import { api } from "../client";
import type { BomDiffLine, BomLine, Project } from "../types";
import { useAsync } from "./useAsync";

const localProjects: Project[] = [];

function upsertLocalProject(project: Project) {
  const index = localProjects.findIndex((item) => item.id === project.id);
  if (index >= 0) localProjects[index] = project;
  else localProjects.unshift(project);
  return project;
}

/**
 * List BOM projects from local/session data.
 *
 * The backend does not currently expose `GET /v1/boms`, so do not call it.
 * With no local user-created/uploaded BOMs, widgets should render empty.
 */
export function useProjects() {
  return useAsync<Project[]>(
    () => Promise.resolve(localProjects),
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
        const local = localProjects.find((project) => project.id === id);
        if (local) return local;
        return api.get(`/v1/boms/${id}`, { params: { sort: "risk_score", order: "desc" } }).then((res) => res.data);
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
    const formData = new FormData();
    formData.append("file", file);
    if (name) formData.append("name", name);

    const res = await api.post("/v1/boms", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return upsertLocalProject(res.data);
  }

  return { uploadBom };
}

/**
 * Create a BOM from manually entered lines.
 * Sends as JSON to `POST /v1/boms` with a JSON body.
 * Falls back to local-only creation if the server doesn't support it.
 * This preserves user-entered data, but does not seed sample/mock data.
 */
export function useCreateBom() {
  async function createBom({ name, lines }: { name: string; lines: BomLine[] }): Promise<Project> {
    try {
      const res = await api.post("/v1/boms", { name, lines });
      return upsertLocalProject(res.data);
    } catch {
      // Fallback: construct a local project object
      return upsertLocalProject({
        id: `bom-manual-${Date.now()}`,
        name: name.trim() || "Manual BOM",
        part_count: lines.length,
        uploaded_at: new Date().toISOString().slice(0, 10),
        owner: "You",
        lowest_score: lines.length ? Math.min(...lines.map((line) => line.score)) : 0,
        lines,
      });
    }
  }

  return { createBom };
}

/**
 * Update BOM lines. No PATCH endpoint exists in the collection,
 * so this remains a local-only operation.
 */
export function useUpdateBom() {
  function updateBom(projectId: string, lines: BomLine[]): Project | undefined {
    const existing = localProjects.find((project) => project.id === projectId);
    if (!existing) return undefined;
    return upsertLocalProject({
      ...existing,
      part_count: lines.length,
      lowest_score: lines.length ? Math.min(...lines.map((line) => line.score)) : 0,
      lines,
    });
  }

  return { updateBom };
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
