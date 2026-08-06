import type { BomLine } from "./types";

interface ParsedBom {
  name: string;
  lines: BomLine[];
}

type CellValue = string | number | boolean;

const ZIP_LOCAL_FILE_HEADER = 0x04034b50;
const ZIP_CENTRAL_DIRECTORY_HEADER = 0x02014b50;
const ZIP_END_OF_CENTRAL_DIRECTORY = 0x06054b50;

const FIELD_ALIASES = {
  line_no: ["#", "line", "line no", "line number", "item", "item no", "item number"],
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
  ],
  description: ["description", "desc", "designator", "reference", "reference designator", "refdes", "assembly instructions"],
  manufacturer: ["manufacturer", "mfg", "mfr", "vendor"],
  country_of_origin: ["country", "country of origin", "coo", "made in", "origin"],
  category: ["category", "type", "part type", "package", "footprint"],
  qty: ["qty", "quantity", "unit qty", "unit quantity", "count"],
  unit_price: ["unit price", "price", "unit cost", "cost"],
} as const;

type BomField = keyof typeof FIELD_ALIASES;

const DEFAULT_COMPLIANCE = [
  { standard: "RoHS", status: "unknown" as const },
  { standard: "REACH", status: "unknown" as const },
];

export async function parseBomFile(file: File): Promise<ParsedBom> {
  const extension = file.name.split(".").pop()?.toLowerCase();
  const rows = extension === "xlsx" ? await readXlsxRows(file) : parseCsv(await file.text());
  const lines = rowsToBomLines(rows, filenameToBomName(file.name));

  if (!lines.length) {
    throw new Error("No BOM lines were found in the selected file.");
  }

  return { name: filenameToBomName(file.name), lines };
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

async function readXlsxRows(file: File): Promise<CellValue[][]> {
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
  const rows: CellValue[][] = [];

  Array.from(doc.getElementsByTagName("row")).forEach((rowNode) => {
    const cells: CellValue[] = [];

    Array.from(rowNode.getElementsByTagName("c")).forEach((cellNode) => {
      const ref = cellNode.getAttribute("r");
      const columnIndex = ref ? columnNameToIndex(ref.replace(/\d+$/, "")) : cells.length;
      cells[columnIndex] = readCellValue(cellNode, sharedStrings);
    });

    if (cells.some((cell) => String(cell ?? "").trim())) rows.push(cells);
  });

  return rows;
}

function readCellValue(cellNode: Element, sharedStrings: string[]): CellValue {
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

function rowsToBomLines(rows: CellValue[][], bomName: string): BomLine[] {
  const headerIndex = findHeaderIndex(rows);
  const headers = (rows[headerIndex] ?? []).map(normalizeHeader);
  const fieldIndexes = buildFieldIndexes(headers);
  const prefix = sanitizeId(bomName);

  return rows
    .slice(headerIndex + 1)
    .map((row, index) => rowToBomLine(row, index, fieldIndexes, prefix))
    .filter((line): line is BomLine => !!line);
}

function findHeaderIndex(rows: CellValue[][]) {
  let bestIndex = 0;
  let bestScore = -1;

  rows.slice(0, 10).forEach((row, index) => {
    const headers = row.map(normalizeHeader);
    const score = (Object.keys(FIELD_ALIASES) as BomField[]).filter((field) =>
      headers.some((header) => (FIELD_ALIASES[field] as readonly string[]).includes(header)),
    ).length;

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

function rowToBomLine(
  row: CellValue[],
  index: number,
  fields: Partial<Record<BomField, number>>,
  prefix: string,
): BomLine | undefined {
  const lineNo = parseInteger(cellAt(row, fields.line_no)) || index + 1;
  const mpn = cleanText(cellAt(row, fields.mpn));
  const description = cleanText(cellAt(row, fields.description)) || mpn || `BOM line ${lineNo}`;

  if (!mpn && !description) return undefined;

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

function cellAt(row: CellValue[], index: number | undefined) {
  return index === undefined ? "" : row[index];
}

function cleanText(value: CellValue | undefined) {
  return String(value ?? "").trim();
}

function normalizeHeader(value: CellValue | undefined) {
  return cleanText(value)
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/[^a-z0-9# ]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseNumber(value: CellValue | undefined) {
  const number = Number(cleanText(value).replace(/[$,]/g, ""));
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function parseInteger(value: CellValue | undefined) {
  const number = parseNumber(value);
  return number > 0 ? Math.floor(number) : 0;
}

function inferCategory(description: string) {
  const token = description.trim().match(/^[A-Za-z]+/)?.[0].toUpperCase();
  if (!token) return "";

  if (token.startsWith("R")) return "Resistor";
  if (token.startsWith("C")) return "Capacitor";
  if (token.startsWith("L")) return "Inductor";
  if (token.startsWith("D") || token.startsWith("LED")) return "Diode";
  if (token.startsWith("Q")) return "Transistor";
  if (token.startsWith("U") || token.startsWith("IC")) return "IC";
  if (token.startsWith("J") || token.startsWith("P") || token.startsWith("CON")) return "Connector";
  if (token.startsWith("Y") || token.startsWith("X")) return "Crystal";
  if (token.startsWith("F")) return "Fuse";
  if (token.startsWith("SW") || token.startsWith("S")) return "Switch";
  if (token.startsWith("TP")) return "Test Point";
  return "";
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
