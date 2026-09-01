import { componentMetadataFromApi } from "./componentMetadata";
import type { Part } from "./types";

export function apiRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function apiString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

export function apiNumber(value: unknown, fallback = 0) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function apiResponseItems(payload: unknown, key = "data"): unknown[] {
  if (Array.isArray(payload)) return payload;
  const record = apiRecord(payload);
  if (Array.isArray(record.items)) return record.items;
  return Array.isArray(record[key]) ? record[key] : [];
}

export function partFromApi(value: unknown): Part | undefined {
  const part = apiRecord(value);
  const id = apiString(part.id);
  const mpn = apiString(part.mpn);
  if (!id || !mpn) return undefined;

  return {
    id,
    mpn,
    manufacturer: apiString(part.manufacturer, "Unknown"),
    category: apiString(part.category, "Uncategorized"),
    description: apiString(part.description, "No description available"),
    score: Math.max(0, Math.min(100, apiNumber(part.score, 0))),
    component_metadata: componentMetadataFromApi(part.component_metadata),
  };
}

export function partsFromApiResponse(payload: unknown, key = "data"): Part[] {
  return apiResponseItems(payload, key).flatMap((value) => {
    const part = partFromApi(value);
    return part ? [part] : [];
  });
}
