import { useEffect, useMemo, useState } from "react";
import { api } from "../client";
import {
  componentMetadataFromApi,
  flattenCharacteristics,
} from "../componentMetadata";
import {
  apiRecord,
  apiResponseItems,
  apiString,
  partFromApi,
  partsFromApiResponse,
} from "../partPayload";
import type { Part, PartFilters } from "../types";
import { useAsync } from "./useAsync";

export interface ProjectPartRow extends Part {
  project_count: number;
  project_names: string;
  total_qty: number;
}

/**
 * Search parts via `GET /v1/parts/search`.
 */
export function useSearchParts(query: string, filters: PartFilters) {
  const q = query.trim();

  return useAsync<Part[]>(() => {
    const params: Record<string, string> = {};
    if (q) params.q = q;
    if (filters.category?.length) params.category = filters.category.join(",");
    if (filters.manufacturer?.length)
      params.manufacturer = filters.manufacturer.join(",");
    if (filters.lifecycle?.length)
      params.lifecycle = filters.lifecycle.join(",");
    params.limit = "25";

    return api
      .get("/v1/parts/search", { params })
      .then((res) => partsFromApiResponse(res.data));
  }, [
    q,
    filters.category?.join(","),
    filters.manufacturer?.join(","),
    filters.lifecycle?.join(","),
  ]);
}

/**
 * Get a single part via `GET /v1/parts/{id}`.
 */
export function usePart(id: string | undefined) {
  return useAsync<Part>(
    id
      ? () =>
          api.get(`/v1/parts/${id}`).then((res) => {
            const part = partFromApi(res.data);
            if (!part) throw new Error("The server returned an invalid part");
            return part;
          })
      : null,
    [id],
  );
}

function comparableMpn(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

export interface PartLookupCandidate {
  key: string;
  mpn: string;
  manufacturer?: string;
}

const inFlightPartLookups = new Map<string, Promise<Part | undefined>>();

function lookupCacheKey(mpn: string, manufacturer: string) {
  return `${comparableMpn(mpn)}\n${manufacturer.trim().toLowerCase()}`;
}

function manufacturerForLookup(value: string | undefined) {
  const manufacturer = value?.trim() ?? "";
  return ["", "unknown", "n/a", "na", "—", "-"].includes(
    manufacturer.toLowerCase(),
  )
    ? ""
    : manufacturer;
}

function requestPartByMpn(mpn: string, manufacturer = "") {
  const q = mpn.trim();
  const manufacturerFilter = manufacturerForLookup(manufacturer);
  if (!q) return Promise.resolve(undefined);

  const cacheKey = lookupCacheKey(q, manufacturerFilter);
  const pending = inFlightPartLookups.get(cacheKey);
  if (pending) return pending;

  const params: Record<string, string> = { q, limit: "25" };
  if (manufacturerFilter) params.manufacturer = manufacturerFilter;
  const request = api
    .get("/v1/parts/search", { params })
    .then((res) => {
      const candidates = partsFromApiResponse(res.data);
      const expectedMpn = comparableMpn(q);
      return (
        candidates.find(
          (candidate) => comparableMpn(candidate.mpn) === expectedMpn,
        ) ?? candidates[0]
      );
    })
    .finally(() => inFlightPartLookups.delete(cacheKey));
  inFlightPartLookups.set(cacheKey, request);
  return request;
}

/**
 * Enrich a collection of local/manual/BOM rows through the same MPN search
 * endpoint used by PartDetail. Requests are deduplicated and concurrency is
 * bounded to avoid flooding the public adapter on large projects.
 */
export function usePartsByMpn(candidates: PartLookupCandidate[]) {
  const normalized = candidates
    .map((candidate) => ({
      key: candidate.key,
      mpn: candidate.mpn.trim(),
      manufacturer: manufacturerForLookup(candidate.manufacturer),
    }))
    .filter((candidate) => candidate.key && candidate.mpn);
  const candidatesKey = normalized
    .map(
      (candidate) =>
        `${candidate.key}\n${lookupCacheKey(candidate.mpn, candidate.manufacturer)}`,
    )
    .join("\n\n");

  const [state, setState] = useState<{
    requestKey: string;
    partsByRowKey: Record<string, Part>;
    loadingRowKeys: Set<string>;
  }>({
    requestKey: "",
    partsByRowKey: {},
    loadingRowKeys: new Set(),
  });

  useEffect(() => {
    let cancelled = false;
    const grouped = new Map<
      string,
      {
        mpn: string;
        manufacturer: string;
        rowKeys: string[];
      }
    >();
    normalized.forEach((candidate) => {
      const lookupKey = lookupCacheKey(candidate.mpn, candidate.manufacturer);
      const existing = grouped.get(lookupKey);
      if (existing) existing.rowKeys.push(candidate.key);
      else {
        grouped.set(lookupKey, {
          mpn: candidate.mpn,
          manufacturer: candidate.manufacturer,
          rowKeys: [candidate.key],
        });
      }
    });

    const lookups = Array.from(grouped.values());
    setState({
      requestKey: candidatesKey,
      partsByRowKey: {},
      loadingRowKeys: new Set(normalized.map((candidate) => candidate.key)),
    });

    let cursor = 0;
    const worker = async () => {
      while (!cancelled && cursor < lookups.length) {
        const lookup = lookups[cursor++];
        let part: Part | undefined;
        try {
          part = await requestPartByMpn(lookup.mpn, lookup.manufacturer);
        } catch {
          // Keep the stored row when an individual enrichment fails.
        }
        if (cancelled) return;
        setState((current) => {
          if (current.requestKey !== candidatesKey) return current;
          const loadingRowKeys = new Set(current.loadingRowKeys);
          lookup.rowKeys.forEach((rowKey) => loadingRowKeys.delete(rowKey));
          const partsByRowKey = { ...current.partsByRowKey };
          if (part) {
            lookup.rowKeys.forEach((rowKey) => {
              partsByRowKey[rowKey] = part;
            });
          }
          return { requestKey: candidatesKey, partsByRowKey, loadingRowKeys };
        });
      }
    };

    void Promise.all(
      Array.from({ length: Math.min(4, lookups.length) }, () => worker()),
    );
    return () => {
      cancelled = true;
    };
    // `candidatesKey` captures the normalized lookup input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidatesKey]);

  const isCurrentRequest = state.requestKey === candidatesKey;
  const loadingRowKeys = isCurrentRequest
    ? state.loadingRowKeys
    : new Set(normalized.map((candidate) => candidate.key));

  return {
    data: isCurrentRequest ? state.partsByRowKey : undefined,
    loading: loadingRowKeys.size > 0,
    loadingRowKeys,
  };
}

/**
 * Resolve a part through `GET /v1/parts/search` using its MPN. This is kept
 * separate from `usePart` because the search endpoint may enrich a catalog
 * miss through a configured distributor adapter before returning the record.
 */
export function usePartByMpn(mpn: string | undefined, manufacturer?: string) {
  const q = mpn?.trim() ?? "";
  const manufacturerFilter = manufacturerForLookup(manufacturer);
  const requestKey = `${q}\n${manufacturerFilter}`;
  const state = useAsync<{ requestKey: string; part: Part | undefined }>(
    q
      ? () => {
          return requestPartByMpn(q, manufacturerFilter).then((part) => ({
            requestKey,
            part,
          }));
        }
      : null,
    [q, manufacturerFilter],
  );

  return {
    ...state,
    data: state.data?.requestKey === requestKey ? state.data.part : undefined,
    loading:
      state.loading ||
      (!!q && !state.error && state.data?.requestKey !== requestKey),
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
              requestPartByMpn(mpn).then((resolvedPart) =>
                resolvedPart ? { ...resolvedPart, mpn } : undefined,
              ),
            ),
          );
          const alternates = searchResults.flatMap((result) =>
            result.status === "fulfilled" && result.value ? [result.value] : [],
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

  return useAsync<
    {
      id: string;
      label: string;
      parameters: Record<string, string | number | boolean>;
    }[]
  >(
    idsKey
      ? () =>
          api
            .get("/v1/parts/compare", { params: { ids: idsKey } })
            .then((res) => {
              return apiResponseItems(res.data, "parts").flatMap((value) => {
                const part = apiRecord(value);
                const id = apiString(part.id);
                if (!id) return [];
                return [
                  {
                    id,
                    label: apiString(part.label, id),
                    parameters: flattenCharacteristics(
                      componentMetadataFromApi(part.component_metadata),
                    ),
                  },
                ];
              });
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
  projects:
    | {
        name: string;
        lines: {
          part_id: string;
          qty: number;
          mpn: string;
          manufacturer: string;
          category: string;
          description: string;
          score: number;
          unit_price: number;
          component_metadata?: Part["component_metadata"];
        }[];
      }[]
    | undefined,
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
