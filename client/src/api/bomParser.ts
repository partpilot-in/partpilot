import type { BomLine } from "./types";

export interface ParsedBom {
  name: string;
  lines: BomLine[];
}

export type BomCellValue = string | number | boolean;

const ZIP_LOCAL_FILE_HEADER = 0x04034b50;
const ZIP_CENTRAL_DIRECTORY_HEADER = 0x02014b50;
const ZIP_END_OF_CENTRAL_DIRECTORY = 0x06054b50;

const FIELD_ALIASES = {
  line_no: ["#", "line", "line no", "line number", "item", "item no", "item number"],
  designator: ["designator", "designators", "reference", "references", "reference designator", "reference designators", "refdes", "ref des", "ref"],
  mpn: [
    "mpn",
    "mfg pn",
    "mfg part number",
    "mfr pn",
    "mfr part number",
    "manufacturer pn",
    "manufacturer part number",
    "part number",
    "part no",
    "part",
    "vendor pn",
    "vendor part number",
    "supplier pn",
    "supplier part number",
    "component number",
    "ordering code",
    "order code",
    "material number",
  ],
  description: ["description", "desc", "assembly instructions", "item description", "component description"],
  manufacturer: ["manufacturer", "mfg", "mfr", "vendor", "supplier", "brand", "maker"],
  country_of_origin: ["country", "country of origin", "origin country", "coo", "made in", "origin"],
  category: ["category", "type", "part type", "component type", "package", "footprint"],
  qty: ["qty", "quantity", "unit qty", "unit quantity", "bom qty", "usage", "amount", "count"],
  unit_price: ["unit price", "price", "unit cost", "cost", "price each", "cost each"],
} as const;

export type BomField = keyof typeof FIELD_ALIASES;

export const BOM_FIELD_OPTIONS: { value: BomField; label: string }[] = [
  { value: "line_no", label: "Line number" },
  { value: "designator", label: "Designator" },
  { value: "mpn", label: "MPN" },
  { value: "description", label: "Description" },
  { value: "manufacturer", label: "Manufacturer" },
  { value: "country_of_origin", label: "Country of origin" },
  { value: "category", label: "Category" },
  { value: "qty", label: "Quantity" },
  { value: "unit_price", label: "Unit price" },
];

export const REQUIRED_BOM_FIELDS: BomField[] = ["designator", "mpn"];
export const RECOMMENDED_BOM_FIELDS: BomField[] = ["manufacturer", "description", "qty"];

export type BomFieldMapping = Record<number, BomField | undefined>;

export interface BomImportColumn {
  index: number;
  header: string;
  samples: string[];
  suggestedField?: BomField;
  confidence: "high" | "medium" | "low";
}

export interface BomImportPreview {
  name: string;
  rows: BomCellValue[][];
  headerIndex: number;
  dataRowCount: number;
  columns: BomImportColumn[];
  suggestedMapping: BomFieldMapping;
}

export interface BomMappingIssue {
  field: BomField;
  label: string;
  missingRows: number;
  mappingMissing: boolean;
}

export interface BomMappingValidation {
  errors: BomMappingIssue[];
  warnings: BomMappingIssue[];
}

const DEFAULT_COMPLIANCE = [
  { standard: "RoHS", status: "unknown" as const },
  { standard: "REACH", status: "unknown" as const },
];

const DESIGNATOR_CATEGORIES: Record<string, string> = {
  A: "Removable Sub-assembly or Plug-in Module",
  AE: "Antenna",
  BT: "Battery",
  C: "Capacitor",
  D: "Diode",
  DS: "Display",
  F: "Fuse",
  FB: "Ferrite Bead",
  FD: "Fiducial",
  FL: "Filter",
  H: "Hardware",
  J: "Jack",
  JP: "Jumper / Link",
  K: "Relay",
  L: "Inductor",
  LS: "Loudspeaker or Buzzer",
  M: "Motor",
  MK: "Microphone",
  P: "Plug",
  Q: "Transistor",
  R: "Resistor",
  RN: "Resistor Network",
  RT: "Thermistor",
  RV: "Varistor",
  SW: "Switch",
  T: "Transformer",
  TC: "Thermocouple",
  TJ: "Thermal Jumper",
  TP: "Test Point",
  U: "Integrated Circuit",
  Y: "Crystal / Oscillator",
  Z: "Zener Diode",
};

const DESIGNATOR_PREFIXES = Object.keys(DESIGNATOR_CATEGORIES).sort((a, b) => b.length - a.length);

export async function parseBomFile(file: File): Promise<ParsedBom> {
  const preview = await inspectBomFile(file);
  const lines = buildBomLines(preview, preview.suggestedMapping);

  if (!lines.length) {
    throw new Error("No BOM lines were found in the selected file.");
  }

  return { name: preview.name, lines };
}

export async function inspectBomFile(file: File): Promise<BomImportPreview> {
  const extension = file.name.split(".").pop()?.toLowerCase();
  const rows = extension === "xlsx" ? await readXlsxRows(file) : parseCsv(await file.text());
  const headerIndex = findHeaderIndex(rows);
  const headerRow = rows[headerIndex] ?? [];
  const columnCount = Math.max(headerRow.length, ...rows.slice(headerIndex + 1, headerIndex + 6).map((row) => row.length));
  const candidates = Array.from({ length: columnCount }, (_, index) => {
    const header = cleanText(headerRow[index]) || `Column ${index + 1}`;
    const match = bestFieldMatch(header);
    return {
      index,
      header,
      samples: rows
        .slice(headerIndex + 1)
        .map((row) => cleanText(row[index]))
        .filter(Boolean)
        .slice(0, 2),
      match,
    };
  });
  const suggestedMapping: BomFieldMapping = {};
  const usedFields = new Set<BomField>();

  [...candidates]
    .sort((left, right) => right.match.score - left.match.score)
    .forEach(({ index, match }) => {
      if (match.field && match.score >= 0.42 && !usedFields.has(match.field)) {
        suggestedMapping[index] = match.field;
        usedFields.add(match.field);
      }
    });

  const columns = candidates.map<BomImportColumn>(({ index, header, samples, match }) => ({
    index,
    header,
    samples,
    suggestedField: suggestedMapping[index],
    confidence: match.score >= 0.88 ? "high" : match.score >= 0.58 ? "medium" : "low",
  }));

  if (!columns.length || rows.length <= headerIndex + 1) {
    throw new Error("The selected file does not contain a header and BOM data rows.");
  }

  return {
    name: filenameToBomName(file.name),
    rows,
    headerIndex,
    dataRowCount: rows.slice(headerIndex + 1).filter((row) => row.some((cell) => cleanText(cell))).length,
    columns,
    suggestedMapping,
  };
}

export function buildBomLines(preview: BomImportPreview, mapping: BomFieldMapping): BomLine[] {
  const fieldIndexes: Partial<Record<BomField, number>> = {};
  Object.entries(mapping).forEach(([columnIndex, field]) => {
    if (field) fieldIndexes[field] = Number(columnIndex);
  });

  return rowsToBomLines(preview.rows, preview.name, preview.headerIndex, fieldIndexes);
}

export function validateBomMapping(preview: BomImportPreview, mapping: BomFieldMapping): BomMappingValidation {
  const dataRows = preview.rows
    .slice(preview.headerIndex + 1)
    .filter((row) => row.some((cell) => cleanText(cell)));
  const mappedIndexes = new Map<BomField, number>();
  Object.entries(mapping).forEach(([columnIndex, field]) => {
    if (field) mappedIndexes.set(field, Number(columnIndex));
  });

  const issuesFor = (fields: BomField[]) => fields.flatMap<BomMappingIssue>((field) => {
    const columnIndex = mappedIndexes.get(field);
    const label = BOM_FIELD_OPTIONS.find((option) => option.value === field)?.label ?? field;
    if (columnIndex === undefined) return [{ field, label, missingRows: dataRows.length, mappingMissing: true }];

    const missingRows = dataRows.filter((row) => !cleanText(row[columnIndex])).length;
    return missingRows ? [{ field, label, missingRows, mappingMissing: false }] : [];
  });

  return {
    errors: issuesFor(REQUIRED_BOM_FIELDS),
    warnings: issuesFor(RECOMMENDED_BOM_FIELDS),
  };
}

function filenameToBomName(filename: string) {
  return filename.replace(/\.[^.]+$/, "").trim() || "Uploaded BOM";
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (quoted) {
      if (char === '"' && next === '"') {
        value += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        value += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === "," || char === "\t" || char === ";") {
      row.push(value.trim());
      value = "";
    } else if (char === "\n") {
      row.push(value.trim());
      rows.push(row);
      row = [];
      value = "";
    } else if (char !== "\r") {
      value += char;
    }
  }

  row.push(value.trim());
  rows.push(row);

  return rows.filter((cells) => cells.some((cell) => cell.trim()));
}

async function readXlsxRows(file: File): Promise<BomCellValue[][]> {
  const entries = await readZipEntries(await file.arrayBuffer());
  const sharedStrings = parseSharedStrings(entries.get("xl/sharedStrings.xml"));
  const worksheetPath = findFirstWorksheetPath(entries);
  const worksheetXml = entries.get(worksheetPath);

  if (!worksheetXml) {
    throw new Error("The workbook does not contain a readable worksheet.");
  }

  return parseWorksheet(new TextDecoder().decode(worksheetXml), sharedStrings);
}

function findFirstWorksheetPath(entries: Map<string, Uint8Array>) {
  const workbook = entries.get("xl/workbook.xml");
  const relationships = entries.get("xl/_rels/workbook.xml.rels");

  if (workbook && relationships) {
    const workbookDoc = parseXml(new TextDecoder().decode(workbook));
    const relsDoc = parseXml(new TextDecoder().decode(relationships));
    const firstSheet = workbookDoc.getElementsByTagName("sheet")[0];
    const relationshipId = firstSheet?.getAttribute("r:id");

    if (relationshipId) {
      const relationship = Array.from(relsDoc.getElementsByTagName("Relationship")).find(
        (node) => node.getAttribute("Id") === relationshipId,
      );
      const target = relationship?.getAttribute("Target");
      if (target) return normalizeWorksheetPath(target);
    }
  }

  const worksheet = Array.from(entries.keys())
    .filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))[0];

  if (!worksheet) {
    throw new Error("The workbook does not contain a readable worksheet.");
  }

  return worksheet;
}

function normalizeWorksheetPath(target: string) {
  const cleanTarget = target.replace(/^\/+/, "");
  if (cleanTarget.startsWith("xl/")) return cleanTarget;
  return `xl/${cleanTarget}`;
}

async function readZipEntries(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const entries = new Map<string, Uint8Array>();
  const eocdOffset = findEndOfCentralDirectory(view);
  const centralDirectorySize = view.getUint32(eocdOffset + 12, true);
  const centralDirectoryOffset = view.getUint32(eocdOffset + 16, true);
  let offset = centralDirectoryOffset;
  const end = centralDirectoryOffset + centralDirectorySize;

  while (offset < end) {
    if (view.getUint32(offset, true) !== ZIP_CENTRAL_DIRECTORY_HEADER) break;

    const compressionMethod = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const filenameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);
    const filename = decodeBytes(bytes.slice(offset + 46, offset + 46 + filenameLength));

    if (!filename.endsWith("/")) {
      const localHeader = localHeaderOffset;
      if (view.getUint32(localHeader, true) !== ZIP_LOCAL_FILE_HEADER) {
        throw new Error("The workbook ZIP structure is invalid.");
      }

      const localFilenameLength = view.getUint16(localHeader + 26, true);
      const localExtraLength = view.getUint16(localHeader + 28, true);
      const dataOffset = localHeader + 30 + localFilenameLength + localExtraLength;
      const compressed = bytes.slice(dataOffset, dataOffset + compressedSize);
      entries.set(filename, await inflateZipEntry(compressed, compressionMethod));
    }

    offset += 46 + filenameLength + extraLength + commentLength;
  }

  return entries;
}

function findEndOfCentralDirectory(view: DataView) {
  const minOffset = Math.max(0, view.byteLength - 65557);

  for (let offset = view.byteLength - 22; offset >= minOffset; offset -= 1) {
    if (view.getUint32(offset, true) === ZIP_END_OF_CENTRAL_DIRECTORY) return offset;
  }

  throw new Error("The workbook ZIP directory could not be read.");
}

async function inflateZipEntry(compressed: Uint8Array, method: number) {
  if (method === 0) return compressed;
  if (method !== 8) {
    throw new Error("The workbook uses an unsupported ZIP compression method.");
  }

  const buffer =
    compressed.buffer instanceof ArrayBuffer
      ? compressed.buffer.slice(compressed.byteOffset, compressed.byteOffset + compressed.byteLength)
      : new Uint8Array(compressed).buffer;
  const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function parseSharedStrings(xmlBytes: Uint8Array | undefined) {
  if (!xmlBytes) return [];
  const doc = parseXml(new TextDecoder().decode(xmlBytes));

  return Array.from(doc.getElementsByTagName("si")).map((node) =>
    Array.from(node.getElementsByTagName("t"))
      .map((textNode) => textNode.textContent ?? "")
      .join(""),
  );
}

function parseWorksheet(xml: string, sharedStrings: string[]) {
  const doc = parseXml(xml);
  const rows: BomCellValue[][] = [];

  Array.from(doc.getElementsByTagName("row")).forEach((rowNode) => {
    const cells: BomCellValue[] = [];

    Array.from(rowNode.getElementsByTagName("c")).forEach((cellNode) => {
      const ref = cellNode.getAttribute("r");
      const columnIndex = ref ? columnNameToIndex(ref.replace(/\d+$/, "")) : cells.length;
      cells[columnIndex] = readCellValue(cellNode, sharedStrings);
    });

    if (cells.some((cell) => String(cell ?? "").trim())) rows.push(cells);
  });

  return rows;
}

function readCellValue(cellNode: Element, sharedStrings: string[]): BomCellValue {
  const type = cellNode.getAttribute("t");
  const raw = cellNode.getElementsByTagName("v")[0]?.textContent ?? "";

  if (type === "s") return sharedStrings[Number(raw)] ?? "";
  if (type === "inlineStr") return cellNode.getElementsByTagName("t")[0]?.textContent ?? "";
  if (type === "b") return raw === "1";

  const numberValue = Number(raw);
  return raw && Number.isFinite(numberValue) ? numberValue : raw;
}

function columnNameToIndex(columnName: string) {
  return columnName
    .toUpperCase()
    .split("")
    .reduce((total, char) => total * 26 + char.charCodeAt(0) - 64, 0) - 1;
}

function rowsToBomLines(
  rows: BomCellValue[][],
  bomName: string,
  headerIndex = findHeaderIndex(rows),
  fieldIndexes = buildFieldIndexes((rows[headerIndex] ?? []).map(normalizeHeader)),
): BomLine[] {
  const prefix = sanitizeId(bomName);

  return rows
    .slice(headerIndex + 1)
    .map((row, index) => rowToBomLine(row, index, fieldIndexes, prefix))
    .filter((line): line is BomLine => !!line);
}

function findHeaderIndex(rows: BomCellValue[][]) {
  let bestIndex = 0;
  let bestScore = -1;

  rows.slice(0, 10).forEach((row, index) => {
    const matches = row.map((header) => bestFieldMatch(cleanText(header)));
    const distinctFields = new Set(matches.filter((match) => match.score >= 0.42).map((match) => match.field));
    const score = distinctFields.size * 2 + matches.reduce((total, match) => total + match.score, 0);

    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });

  return bestIndex;
}

function buildFieldIndexes(headers: string[]) {
  const indexes: Partial<Record<BomField, number>> = {};

  headers.forEach((header, index) => {
    (Object.keys(FIELD_ALIASES) as BomField[]).forEach((field) => {
      if (indexes[field] === undefined && (FIELD_ALIASES[field] as readonly string[]).includes(header)) {
        indexes[field] = index;
      }
    });
  });

  return indexes;
}

function bestFieldMatch(header: string): { field?: BomField; score: number } {
  const normalized = normalizeHeader(header);
  if (!normalized) return { score: 0 };

  let best: { field?: BomField; score: number } = { score: 0 };
  (Object.keys(FIELD_ALIASES) as BomField[]).forEach((field) => {
    const aliases = [...FIELD_ALIASES[field], BOM_FIELD_OPTIONS.find((option) => option.value === field)?.label ?? ""];
    aliases.forEach((alias) => {
      const normalizedAlias = normalizeHeader(alias);
      const score = headerSimilarity(normalized, normalizedAlias);
      if (score > best.score) best = { field, score };
    });
  });

  return best;
}

function headerSimilarity(header: string, alias: string) {
  if (!header || !alias) return 0;
  if (header === alias) return 1;

  const compactHeader = header.replace(/\s/g, "");
  const compactAlias = alias.replace(/\s/g, "");
  if (compactHeader === compactAlias) return 0.96;
  if (Math.min(header.length, alias.length) >= 3 && (header.includes(alias) || alias.includes(header))) return 0.76;

  const headerTokens = new Set(header.split(" ").filter((token) => token.length > 1));
  const aliasTokens = new Set(alias.split(" ").filter((token) => token.length > 1));
  const overlap = [...headerTokens].filter((token) => aliasTokens.has(token)).length;
  if (!overlap) return 0;
  return (overlap / Math.max(headerTokens.size, aliasTokens.size)) * 0.68;
}

function rowToBomLine(
  row: BomCellValue[],
  index: number,
  fields: Partial<Record<BomField, number>>,
  prefix: string,
): BomLine | undefined {
  const lineNo = parseInteger(cellAt(row, fields.line_no)) || index + 1;
  const designator = cleanText(cellAt(row, fields.designator));
  const mpn = cleanText(cellAt(row, fields.mpn));
  const mappedDescription = cleanText(cellAt(row, fields.description));

  if (!mpn || !designator) return undefined;

  const description = mappedDescription ? `${designator} — ${mappedDescription}` : designator;
  const category = cleanText(cellAt(row, fields.category)) || inferCategory(description);
  const id = `${prefix}-line-${lineNo}`;

  return {
    id,
    part_id: `${prefix}-part-${lineNo}`,
    line_no: lineNo,
    mpn: mpn || `UNKNOWN-${lineNo}`,
    description,
    manufacturer: cleanText(cellAt(row, fields.manufacturer)) || "Unknown",
    country_of_origin: cleanText(cellAt(row, fields.country_of_origin)) || "Unknown",
    category: category || "Uncategorized",
    qty: parseNumber(cellAt(row, fields.qty)) || 1,
    unit_price: parseNumber(cellAt(row, fields.unit_price)),
    compliance: DEFAULT_COMPLIANCE,
    lifecycle_stage: "unknown",
    score: 72,
  };
}

function cellAt(row: BomCellValue[], index: number | undefined) {
  return index === undefined ? "" : row[index];
}

function cleanText(value: BomCellValue | undefined) {
  return String(value ?? "").trim();
}

function normalizeHeader(value: BomCellValue | undefined) {
  return cleanText(value)
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/[^a-z0-9# ]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseNumber(value: BomCellValue | undefined) {
  const number = Number(cleanText(value).replace(/[^0-9.,+-]/g, "").replace(/,/g, ""));
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function parseInteger(value: BomCellValue | undefined) {
  const number = parseNumber(value);
  return number > 0 ? Math.floor(number) : 0;
}

function inferCategory(description: string) {
  const token = description.trim().match(/^([A-Za-z]+)\d/)?.[1].toUpperCase();
  if (!token) return "";

  const prefix = DESIGNATOR_PREFIXES.find((candidate) => token.startsWith(candidate));
  return prefix ? DESIGNATOR_CATEGORIES[prefix] : "";
}

function sanitizeId(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "bom";
}

function parseXml(xml: string) {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const parserError = doc.getElementsByTagName("parsererror")[0];

  if (parserError) {
    throw new Error("The workbook contains invalid XML.");
  }

  return doc;
}

function decodeBytes(bytes: Uint8Array) {
  return new TextDecoder().decode(bytes);
}
