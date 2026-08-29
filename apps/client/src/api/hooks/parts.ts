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

function comparableMpn(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * Resolve a part through `GET /v1/parts/search` using its MPN. This is kept
 * separate from `usePart` because the search endpoint may enrich a catalog
 * miss through a configured distributor adapter before returning the record.
 */
export function usePartByMpn(mpn: string | undefined, manufacturer?: string) {
  const q = mpn?.trim() ?? "";
  const manufacturerFilter = manufacturer?.trim() ?? "";
  const requestKey = `${q}\n${manufacturerFilter}`;
  const state = useAsync<{ requestKey: string; part: Part | undefined }>(
    q
      ? () => {
        const params: Record<string, string> = { q, limit: "25" };
        if (manufacturerFilter) params.manufacturer = manufacturerFilter;
        return api.get("/v1/parts/search", { params }).then((res) => {
          const expectedMpn = comparableMpn(q);
          const part = itemsFromResponse<Part>(res.data).find(
            (candidate) => comparableMpn(candidate.mpn) === expectedMpn,
          );
          return { requestKey, part };
        });
      }
      : null,
    [q, manufacturerFilter],
  );

  return {
    ...state,
    data: state.data?.requestKey === requestKey ? state.data.part : undefined,
    loading: state.loading || (!!q && !state.error && state.data?.requestKey !== requestKey),
  };
}

/**
 * Resolve alternate MPNs through `GET /v1/parts/search?q={mpn}` so a
 * configured public distributor adapter can populate parts absent from the
 * PartPilot database. Alternate MPNs do not need database UUIDs.
 */
export function usePartAlternates(
  alternatePartNumbers: string[] = [],
  currentMpn = "",
) {
  const uniquePartNumbers = Array.from(
    new Map(
      alternatePartNumbers
        .map((mpn) => mpn.trim())
        .filter(Boolean)
        .filter((mpn) => comparableMpn(mpn) !== comparableMpn(currentMpn))
        .map((mpn) => [comparableMpn(mpn), mpn]),
    ).values(),
  );
  const alternatePartNumbersKey = uniquePartNumbers.join("\n");

  return useAsync<Part[]>(
    uniquePartNumbers.length
      ? async () => {
        const searchResults = await Promise.allSettled(
          uniquePartNumbers.map((mpn) =>
            api.get("/v1/parts/search", { params: { q: mpn } }).then((res) => {
              const candidates = itemsFromResponse<Part>(res.data);
              const expectedMpn = comparableMpn(mpn);
              const resolvedPart = candidates.find(
                (candidate) => comparableMpn(candidate.mpn) === expectedMpn,
              ) ?? candidates[0];
              return resolvedPart ? { ...resolvedPart, mpn } : undefined;
            }),
          ),
        );
        const alternates = searchResults.flatMap((result) =>
          result.status === "fulfilled" && result.value ? [result.value] : []
        );
        const seen = new Set<string>();

        return alternates.filter((candidate) => {
          const key = comparableMpn(candidate.mpn) || candidate.id;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      }
      : null,
    [currentMpn, alternatePartNumbersKey],
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
