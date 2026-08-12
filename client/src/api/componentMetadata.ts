export type DesignatorCategory =
  | "A" | "AE" | "BT" | "C" | "D" | "DS" | "F" | "FB" | "FD" | "FL"
  | "H" | "J" | "JP" | "K" | "L" | "LS" | "M" | "MK" | "P" | "Q"
  | "R" | "RN" | "RT" | "RV" | "SW" | "T" | "TC" | "TJ" | "TP" | "U"
  | "Y" | "Z";

export type CddSectionKey =
  | "identification"
  | "electrical"
  | "mechanical"
  | "thermal"
  | "material"
  | "environmental"
  | "reliability"
  | "regulatory"
  | "manufacturing"
  | "commercial"
  | "packaging"
  | "documentation";

export interface CddProperty extends Record<string, unknown> {
  value?: unknown;
  unit?: string;
  dataType?: string;
  conditionOfApplication?: string;
  tolerance?: string;
  minValue?: number;
  typValue?: number;
  maxValue?: number;
  definition?: string;
  irdi?: string;
  source?: string;
}

export type ComponentMetadataSection = Record<string, unknown>;

/** A component document following docs/component-cdd.schema.json. */
export interface ComponentMetadata extends Record<string, unknown> {
  identification?: ComponentMetadataSection;
  electrical?: ComponentMetadataSection;
  mechanical?: ComponentMetadataSection;
  thermal?: ComponentMetadataSection;
  material?: ComponentMetadataSection;
  environmental?: ComponentMetadataSection;
  reliability?: ComponentMetadataSection;
  regulatory?: ComponentMetadataSection;
  manufacturing?: ComponentMetadataSection;
  commercial?: ComponentMetadataSection;
  packaging?: ComponentMetadataSection;
  documentation?: ComponentMetadataSection;
}

export interface CddSectionDefinition {
  key: CddSectionKey;
  title: string;
  fields: string[];
}

const IDENTIFICATION_FIELDS = [
  "referenceDesignator",
  "designatorCategory",
  "designatorCategoryLabel",
  "manufacturerPartNumber",
  "manufacturer",
  "internalPartNumber",
  "genericPartFamily",
  "irdiClassId",
  "description",
  "revision",
  "alternatePartNumbers",
  "eccnClassification",
];

const ALL_ELECTRICAL_FIELDS = [
  "voltageRating",
  "currentRating",
  "powerRating",
  "resistance",
  "capacitance",
  "inductance",
  "impedance",
  "frequencyRange",
  "tolerance",
  "temperatureCoefficient",
  "dielectricType",
  "polarized",
  "pinCount",
  "logicFamily",
  "switchingCharacteristics",
  "insulationResistance",
  "dielectricWithstandingVoltage",
  "esdRating",
  "additionalProperties",
];

const VCP = ["voltageRating", "currentRating", "powerRating"];
const PASSIVE = [...VCP, "resistance", "tolerance", "temperatureCoefficient"];

const ELECTRICAL_FIELDS_BY_CATEGORY: Record<DesignatorCategory, string[]> = {
  A: [...VCP, "frequencyRange", "pinCount", "switchingCharacteristics", "additionalProperties"],
  AE: ["powerRating", "impedance", "frequencyRange", "additionalProperties"],
  BT: [...VCP, "resistance", "temperatureCoefficient", "additionalProperties"],
  C: ["voltageRating", "powerRating", "capacitance", "tolerance", "temperatureCoefficient", "dielectricType", "polarized", "insulationResistance", "dielectricWithstandingVoltage", "additionalProperties"],
  D: [...VCP, "switchingCharacteristics", "polarized", "esdRating", "additionalProperties"],
  DS: [...VCP, "frequencyRange", "pinCount", "additionalProperties"],
  F: [...PASSIVE, "additionalProperties"],
  FB: ["currentRating", "resistance", "impedance", "frequencyRange", "additionalProperties"],
  FD: ["additionalProperties"],
  FL: [...VCP, "impedance", "frequencyRange", "additionalProperties"],
  H: ["additionalProperties"],
  J: [...VCP, "pinCount", "insulationResistance", "dielectricWithstandingVoltage", "additionalProperties"],
  JP: ["voltageRating", "currentRating", "resistance", "pinCount", "additionalProperties"],
  K: [...VCP, "resistance", "pinCount", "switchingCharacteristics", "insulationResistance", "dielectricWithstandingVoltage", "additionalProperties"],
  L: ["currentRating", "powerRating", "resistance", "inductance", "frequencyRange", "tolerance", "temperatureCoefficient", "additionalProperties"],
  LS: [...VCP, "impedance", "frequencyRange", "additionalProperties"],
  M: [...VCP, "resistance", "additionalProperties"],
  MK: ["voltageRating", "currentRating", "impedance", "frequencyRange", "additionalProperties"],
  P: [...VCP, "pinCount", "insulationResistance", "dielectricWithstandingVoltage", "additionalProperties"],
  Q: [...VCP, "pinCount", "switchingCharacteristics", "esdRating", "additionalProperties"],
  R: [...PASSIVE, "additionalProperties"],
  RN: [...PASSIVE, "pinCount", "additionalProperties"],
  RT: ["voltageRating", "powerRating", "resistance", "tolerance", "temperatureCoefficient", "additionalProperties"],
  RV: [...VCP, "resistance", "additionalProperties"],
  SW: [...VCP, "resistance", "pinCount", "switchingCharacteristics", "insulationResistance", "dielectricWithstandingVoltage", "additionalProperties"],
  T: [...VCP, "inductance", "impedance", "frequencyRange", "insulationResistance", "dielectricWithstandingVoltage", "additionalProperties"],
  TC: ["voltageRating", "resistance", "temperatureCoefficient", "additionalProperties"],
  TJ: ["currentRating", "resistance", "temperatureCoefficient", "additionalProperties"],
  TP: ["voltageRating", "currentRating", "impedance", "additionalProperties"],
  U: [...VCP, "frequencyRange", "pinCount", "logicFamily", "switchingCharacteristics", "esdRating", "additionalProperties"],
  Y: [...VCP, "impedance", "frequencyRange", "tolerance", "temperatureCoefficient", "additionalProperties"],
  Z: [...VCP, "switchingCharacteristics", "polarized", "esdRating", "additionalProperties"],
};

export const DESIGNATOR_CATEGORY_LABELS: Record<DesignatorCategory, string> = {
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

export const CDD_SECTION_DEFINITIONS: CddSectionDefinition[] = [
  { key: "identification", title: "Identification", fields: IDENTIFICATION_FIELDS },
  { key: "electrical", title: "Electrical", fields: ALL_ELECTRICAL_FIELDS },
  {
    key: "mechanical",
    title: "Mechanical",
    fields: [
      "packageType", "footprint", "dimensions.length", "dimensions.width", "dimensions.height",
      "dimensions.diameter", "dimensions.leadPitch", "mass", "mountingType", "terminationStyle",
      "mechanicalTolerance", "connectorGender", "keying", "actuationForce", "vibrationResistance",
      "shockResistance", "cadModelRef",
    ],
  },
  {
    key: "thermal",
    title: "Thermal",
    fields: [
      "operatingTemperatureRange", "storageTemperatureRange", "thermalResistanceJunctionAmbient",
      "thermalResistanceJunctionCase", "maxJunctionTemperature", "derating", "thermalConductivity",
      "reflowProfileCompatibility",
    ],
  },
  {
    key: "material",
    title: "Material",
    fields: [
      "bodyMaterial", "terminationFinish", "substrateMaterial", "encapsulantMaterial",
      "flammabilityRating", "moistureSensitivityLevel", "colorFinish", "magneticProperties",
      "materialComposition",
    ],
  },
  {
    key: "environmental",
    title: "Environmental",
    fields: [
      "rohsCompliant", "rohsVersion", "reachCompliant", "reachSvhcListDate", "halogenFree",
      "conflictMineralsStatus", "ingressProtectionRating", "humidityRating", "altitudeRating",
      "chemicalResistance", "uvResistance", "californiaProp65",
    ],
  },
  {
    key: "reliability",
    title: "Reliability",
    fields: [
      "mtbf", "failureRate", "ratedLifetime", "qualificationStandard", "gradeLevel", "burnInTested",
      "predictedFailureModes", "endurance.cycleCount", "endurance.testMethod",
    ],
  },
  {
    key: "regulatory",
    title: "Regulatory",
    fields: [
      "certifications", "certificateNumbers", "eccn", "htsCode", "countryOfOrigin",
      "exportLicenseRequired", "ituCompliance", "iecStandardRef",
    ],
  },
  {
    key: "manufacturing",
    title: "Manufacturing",
    fields: [
      "assemblyProcess", "solderReflowProfile", "leadFreeProcessCompatible", "peakReflowTemperature",
      "solderabilityStandard", "placementOrientation", "testCoverage", "yieldRate",
      "processCapabilityIndex", "traceabilityMethod",
    ],
  },
  {
    key: "commercial",
    title: "Commercial",
    fields: [
      "lifecycleStatus", "lastTimeBuyDate", "endOfLifeDate", "leadTimeWeeks", "minimumOrderQuantity",
      "standardPackQuantity", "priceBreaks", "distributors", "alternateSources", "obsolescenceRiskScore",
    ],
  },
  {
    key: "packaging",
    title: "Packaging",
    fields: [
      "packingMethod", "reelSize", "quantityPerReel", "tapeWidth", "tapePitch", "orientation",
      "dryPackRequired", "packagingMaterial", "labelingStandard",
    ],
  },
  {
    key: "documentation",
    title: "Documentation",
    fields: [
      "datasheetUrl", "datasheetRevision", "applicationNotes", "cadModels", "complianceCertificates",
      "changeNotifications", "safetyDataSheet", "revisionHistory",
    ],
  },
];

export function resolveDesignatorCategory(category: string, description: string): DesignatorCategory | undefined {
  const normalizedCategory = category.trim().toLowerCase();
  const categoryMatch = (Object.entries(DESIGNATOR_CATEGORY_LABELS) as [DesignatorCategory, string][])
    .find(([code, label]) => code.toLowerCase() === normalizedCategory || label.toLowerCase() === normalizedCategory);
  if (categoryMatch) return categoryMatch[0];

  const token = description.trim().match(/^([A-Za-z]+)\d/)?.[1].toUpperCase();
  if (!token) return undefined;
  return (Object.keys(DESIGNATOR_CATEGORY_LABELS) as DesignatorCategory[])
    .filter((code) => token.startsWith(code))
    .sort((left, right) => right.length - left.length)[0];
}

export function fieldsForCddSection(section: CddSectionDefinition, category?: DesignatorCategory) {
  if (section.key === "electrical" && category) return ELECTRICAL_FIELDS_BY_CATEGORY[category];
  return section.fields;
}

export function cddFieldLabel(path: string) {
  const segments = path.split(".");
  const key = segments[segments.length - 1] ?? path;
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/^./, (character) => character.toUpperCase());
}

export function cddValueAtPath(metadata: ComponentMetadata, section: CddSectionKey, path: string): unknown {
  let value: unknown = metadata[section];
  for (const key of path.split(".")) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
    value = (value as Record<string, unknown>)[key];
  }
  return value;
}

function scalarText(value: unknown) {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string" || typeof value === "number") return String(value);
  return "";
}

export function formatCddValue(value: unknown): string {
  if (value === undefined || value === null || value === "") return "—";
  if (Array.isArray(value)) {
    if (!value.length) return "—";
    return value.map((item) => scalarText(item) || JSON.stringify(item)).join(", ");
  }
  if (typeof value !== "object") return scalarText(value) || "—";

  const property = value as CddProperty;
  const measured = property.value ?? property.typValue;
  let text = scalarText(measured);
  if (!text && (property.minValue !== undefined || property.maxValue !== undefined)) {
    text = `${property.minValue ?? "…"} – ${property.maxValue ?? "…"}`;
  }
  if (text) {
    if (property.unit) text += ` ${property.unit}`;
    if (property.tolerance) text += ` (${property.tolerance})`;
    return text;
  }

  return Object.keys(property).length ? JSON.stringify(property) : "—";
}
