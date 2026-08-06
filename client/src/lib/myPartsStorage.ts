import type { Part } from "../api/types";

export const manualPartsStorageKey = "partpilot.manualParts";

export interface StoredMyPart extends Part {
  project_count: number;
  project_names: string;
  total_qty: number;
  source: "manual" | "project";
}

export function readManualParts(): StoredMyPart[] {
  try {
    const raw = window.localStorage.getItem(manualPartsStorageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveManualParts(parts: StoredMyPart[]) {
  window.localStorage.setItem(manualPartsStorageKey, JSON.stringify(parts));
}
