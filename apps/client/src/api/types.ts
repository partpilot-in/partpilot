import type { ComponentMetadata } from "./componentMetadata";

export type LifecycleStage =
  "active" | "nrnd" | "last_time_buy" | "obsolete" | "unknown";

export type ComplianceStatus = "pass" | "fail" | "unknown";

export interface PartNote {
  part_id: string;
  note: string;
  partpilot_points: string[];
}

export interface Part {
  id: string;
  mpn: string;
  manufacturer: string;
  category: string;
  description: string;
  score: number;
  component_metadata: ComponentMetadata;
}

export interface PartFilters {
  category?: string[];
  manufacturer?: string[];
  lifecycle?: LifecycleStage[];
}

export interface BomLine {
  id: string;
  part_id: string;
  line_no: number;
  mpn: string;
  description: string;
  manufacturer: string;
  category: string;
  qty: number;
  unit_price: number;
  score: number;
  component_metadata: ComponentMetadata;
}

export interface Project {
  id: string;
  name: string;
  part_count: number;
  uploaded_at: string;
  owner: string;
  lowest_score: number;
  lines: BomLine[];
}

export interface BomDiffLine extends BomLine {
  delta: "added" | "removed" | "changed" | "unchanged";
  change_summary: string;
  previous_score?: number;
}
