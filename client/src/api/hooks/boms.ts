import { api } from "../client";
import { parseBomFile } from "../bomParser";
import type { BomDiffLine, BomLine, Project } from "../types";
import { useAsync } from "./useAsync";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asNumber(value: unknown, fallback = 0) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function asDateString(value: unknown, fallback = new Date()) {
  const date = typeof value === "string" && value.trim() ? new Date(value) : fallback;
  const safeDate = Number.isFinite(date.getTime()) ? date : fallback;
  return safeDate.toISOString().slice(0, 10);
}

function asProjectName(value: unknown, fallback = "Untitled") {
  const name = asString(value);
  if (!name || name === "Placeholder BOM") return fallback;
  return name;
}

function normalizeBomLine(value: unknown, index: number, projectId: string): BomLine {
  const line = asRecord(value);
  const lineNo = Math.max(1, Math.floor(asNumber(line.line_no, index + 1)));
  const partId = asString(line.part_id, asString(line.matched_part_id, `${projectId}-part-${lineNo}`));

  return {
    id: asString(line.id, `${projectId}-line-${lineNo}`),
    part_id: partId,
    line_no: lineNo,
    mpn: asString(line.mpn, asString(line.manufacturer_part_number, `UNKNOWN-${lineNo}`)),
    description: asString(line.description, `BOM line ${lineNo}`),
    manufacturer: asString(line.manufacturer, "Unknown"),
    country_of_origin: asString(line.country_of_origin, "Unknown"),
    category: asString(line.category, "Uncategorized"),
    qty: Math.max(1, asNumber(line.qty, 1)),
    unit_price: Math.max(0, asNumber(line.unit_price, 0)),
    compliance: Array.isArray(line.compliance) ? (line.compliance as BomLine["compliance"]) : [
      { standard: "RoHS", status: "unknown" },
      { standard: "REACH", status: "unknown" },
    ],
    lifecycle_stage: ["active", "nrnd", "last_time_buy", "obsolete", "unknown"].includes(String(line.lifecycle_stage))
      ? (line.lifecycle_stage as BomLine["lifecycle_stage"])
      : "unknown",
    score: Math.max(0, Math.min(100, asNumber(line.score, 72))),
  };
}

function normalizeProject(value: unknown, fallback?: { name?: string; lines?: BomLine[] }): Project {
  const project = asRecord(value);
  const id = asString(project.id, `bom-upload-${Date.now()}`);
  const rawLines = Array.isArray(project.lines) && project.lines.length ? project.lines : fallback?.lines ?? [];
  const lines = rawLines.map((line, index) => normalizeBomLine(line, index, id));
  const uploadedAt = asDateString(project.uploaded_at);
  const lowestScore = lines.length ? Math.min(...lines.map((line) => line.score)) : asNumber(project.lowest_score, 0);

  return {
    id,
    name: asProjectName(project.name, fallback?.name ?? "Untitled"),
    part_count: lines.length || asNumber(project.part_count, asNumber(project.line_count, 0)),
    uploaded_at: uploadedAt,
    owner: asString(project.owner, "You"),
    lowest_score: lowestScore,
    lines,
  };
}

/**
 * List the signed-in user's persisted BOM projects.
 */
export function useProjects() {
  return useAsync<Project[]>(
    () => api.get("/v1/boms").then((res) => {
      const payload = asRecord(res.data);
      const projects = Array.isArray(payload.data) ? payload.data : [];
      return projects.map((project) => normalizeProject(project));
    }),
    [],
  );
}

/**
 * Get a single BOM risk report via `GET /v1/boms/{id}`.
 */
export function useProject(id: string | undefined) {
  return useAsync<Project>(
    id
      ? async () => {
        return api
          .get(`/v1/boms/${id}`, { params: { sort: "risk_score", order: "desc" } })
          .then((res) => normalizeProject(res.data));
      }
      : null,
    [id],
  );
}

/**
 * Upload a BOM file via `POST /v1/boms` (multipart/form-data).
 */
export function useUploadBom() {
  async function uploadBom(file: File, name?: string): Promise<Project> {
    const parsed = await parseBomFile(file);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("name", name?.trim() || parsed.name);
    formData.append("lines", JSON.stringify(parsed.lines));
    const res = await api.post("/v1/boms", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return normalizeProject(res.data, parsed);
  }

  return { uploadBom };
}

/**
 * Create a BOM from manually entered lines.
 * Sends as JSON to `POST /v1/boms` with a JSON body.
 * The project and all lines are persisted atomically by the server.
 */
export function useCreateBom() {
  async function createBom({ name, lines }: { name: string; lines: BomLine[] }): Promise<Project> {
    const res = await api.post("/v1/boms", { name, lines });
    return normalizeProject(res.data, { name, lines });
  }

  return { createBom };
}

/**
 * Update a project's name and/or BOM lines.
 */
export function useUpdateBom() {
  async function updateBom(projectId: string, input: { name?: string; lines?: BomLine[] }): Promise<Project> {
    const res = await api.patch(`/v1/boms/${projectId}`, input);
    return normalizeProject(res.data, input);
  }

  return { updateBom };
}

export function useRenameBom() {
  async function renameBom(projectId: string, name: string): Promise<Project> {
    const res = await api.patch(`/v1/boms/${projectId}`, { name });
    return normalizeProject(res.data);
  }

  return { renameBom };
}

export function useDeleteBom() {
  async function deleteBom(projectId: string): Promise<boolean> {
    await api.delete(`/v1/boms/${projectId}`);
    return true;
  }

  return { deleteBom };
}

/**
 * Compare two BOMs via `GET /v1/boms/{id}/compare?with={otherId}`.
 */
export function useCompareBoms(a: string | null, b: string | null) {
  return useAsync<BomDiffLine[]>(
    a && b
      ? () =>
        api
          .get(`/v1/boms/${a}/compare`, { params: { with: b } })
          .then((res) => res.data?.items ?? res.data ?? [])
      : null,
    [a, b],
  );
}
