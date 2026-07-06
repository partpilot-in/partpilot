import { useMemo } from "react";
import { assertMockMode } from "../client";
import { mockParts } from "../mockData";
import type { PartFilters } from "../types";

export function useSearchParts(query: string, filters: PartFilters) {
  assertMockMode();
  const normalizedQuery = query.trim().toLowerCase();

  return useMemo(() => {
    return mockParts.filter((part) => {
      const matchesQuery =
        !normalizedQuery ||
        [part.mpn, part.manufacturer, part.category, part.description]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);
      const matchesCategory = !filters.category?.length || filters.category.includes(part.category);
      const matchesManufacturer =
        !filters.manufacturer?.length || filters.manufacturer.includes(part.manufacturer);
      const matchesLifecycle =
        !filters.lifecycle?.length || filters.lifecycle.includes(part.lifecycle_stage);
      return matchesQuery && matchesCategory && matchesManufacturer && matchesLifecycle;
    });
  }, [filters.category, filters.lifecycle, filters.manufacturer, normalizedQuery]);
}

export function usePart(id: string | undefined) {
  assertMockMode();
  return useMemo(() => mockParts.find((part) => part.id === id), [id]);
}

export function usePartAlternates(id: string | undefined) {
  assertMockMode();
  const part = mockParts.find((item) => item.id === id);
  return useMemo(() => {
    if (!part) return [];
    return mockParts.filter((candidate) => candidate.id !== part.id && candidate.category === part.category);
  }, [part]);
}

export function useComparePartsProperties(ids: string[]) {
  assertMockMode();
  return useMemo(() => {
    const idSet = new Set(ids);
    return mockParts
      .filter((part) => idSet.has(part.id))
      .map((part) => ({
        id: part.id,
        label: `${part.mpn} - ${part.manufacturer}`,
        parameters: part.parameters,
      }));
  }, [ids]);
}
