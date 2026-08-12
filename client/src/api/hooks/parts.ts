import { useMemo } from "react";
import { api } from "../client";
import { flattenCharacteristics } from "../componentMetadata";
import type { Part, PartFilters } from "../types";
import { useAsync } from "./useAsync";

export interface ProjectPartRow extends Part {
  project_count: number;
  project_names: string;
  total_qty: number;
}

function itemsFromResponse<T>(payload: unknown, key = "data"): T[] {
  if (Array.isArray(payload)) return payload as T[];
  if (!payload || typeof payload !== "object") return [];
  const record = payload as Record<string, unknown>;
  if (Array.isArray(record.items)) return record.items as T[];
  if (Array.isArray(record[key])) return record[key] as T[];
  return [];
}

/**
 * Search parts via `GET /v1/parts/search`.
 */
export function useSearchParts(query: string, filters: PartFilters) {
  const q = query.trim();

  return useAsync<Part[]>(
    () => {
      const params: Record<string, string> = {};
      if (q) params.q = q;
      if (filters.category?.length) params.category = filters.category.join(",");
      if (filters.manufacturer?.length) params.manufacturer = filters.manufacturer.join(",");
      if (filters.lifecycle?.length) params.lifecycle = filters.lifecycle.join(",");
      params.limit = "25";

      return api.get("/v1/parts/search", { params }).then((res) => itemsFromResponse<Part>(res.data));
    },
    [q, filters.category?.join(","), filters.manufacturer?.join(","), filters.lifecycle?.join(",")],
  );
}

/**
 * Get a single part via `GET /v1/parts/{id}`.
 */
export function usePart(id: string | undefined) {
  return useAsync<Part>(
    id ? () => api.get(`/v1/parts/${id}`).then((res) => res.data) : null,
    [id],
  );
}

/**
 * Get alternates for a part via `GET /v1/parts/{id}/alternates`.
 */
export function usePartAlternates(id: string | undefined) {
  return useAsync<Part[]>(
    id ? () => api.get(`/v1/parts/${id}/alternates`).then((res) => itemsFromResponse<Part>(res.data, "alternates")) : null,
    [id],
  );
}

/**
 * Compare parts via `GET /v1/parts/compare?ids=id1,id2,...`.
 */
export function useComparePartsProperties(ids: string[]) {
  const idsKey = ids.filter(Boolean).join(",");

  return useAsync<{ id: string; label: string; parameters: Record<string, string | number | boolean> }[]>(
    idsKey
      ? () =>
        api
          .get("/v1/parts/compare", { params: { ids: idsKey } })
          .then((res) => {
            const parts = itemsFromResponse<Part>(res.data, "parts");
            return parts.map((part) => ({
              id: part.id,
              label: `${part.mpn} - ${part.manufacturer}`,
              parameters: flattenCharacteristics(part.component_metadata ?? {}),
            }));
          })
      : null,
    [idsKey],
  );
}

/**
 * Aggregate all parts across loaded BOMs into a deduped list with
 * project counts and total quantities. This is a client-side derivation
 * — there's no dedicated server endpoint.
 */
export function useProjectParts(
  projects: { name: string; lines: { part_id: string; qty: number; mpn: string; manufacturer: string; category: string; description: string; score: number; unit_price: number; component_metadata?: Part["component_metadata"] }[] }[] | undefined,
) {
  return useMemo(() => {
    if (!projects) return [];

    const rows = new Map<string, ProjectPartRow>();

    projects.forEach((project) => {
      project.lines.forEach((line) => {
        const existing = rows.get(line.part_id);
        if (existing) {
          const projectNames = new Set(existing.project_names.split(", "));
          projectNames.add(project.name);
          rows.set(line.part_id, {
            ...existing,
            project_count: projectNames.size,
            project_names: Array.from(projectNames).join(", "),
            total_qty: existing.total_qty + line.qty,
          });
          return;
        }

        rows.set(line.part_id, {
          id: line.part_id,
          mpn: line.mpn,
          manufacturer: line.manufacturer,
          category: line.category,
          description: line.description,
          score: line.score,
          component_metadata: line.component_metadata ?? {},
          project_count: 1,
          project_names: project.name,
          total_qty: line.qty,
        });
      });
    });

    return Array.from(rows.values());
  }, [projects]);
}
