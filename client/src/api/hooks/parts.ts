import { useMemo } from "react";
import { assertMockMode } from "../client";
import { mockParts, mockProjects } from "../mockData";
import type { Part, PartFilters } from "../types";

const recentPartIds = ["part-lm317t-ti", "part-rc0603-10k-yageo", "part-nrf52840", "part-mcp1700"];

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

export function useRecentlySearchedParts() {
  assertMockMode();
  return useMemo(
    () =>
      recentPartIds
        .map((id) => mockParts.find((part) => part.id === id))
        .filter((part): part is Part => Boolean(part)),
    [],
  );
}

export interface ProjectPartRow extends Part {
  project_count: number;
  project_names: string;
  total_qty: number;
}

export function useProjectParts() {
  assertMockMode();

  return useMemo(() => {
    const rows = new Map<string, ProjectPartRow>();

    mockProjects.forEach((project) => {
      project.lines.forEach((line) => {
        const part = mockParts.find((item) => item.id === line.part_id);
        if (!part) return;

        const existing = rows.get(part.id);
        if (existing) {
          const projectNames = new Set(existing.project_names.split(", "));
          projectNames.add(project.name);
          rows.set(part.id, {
            ...existing,
            project_count: projectNames.size,
            project_names: Array.from(projectNames).join(", "),
            total_qty: existing.total_qty + line.qty,
          });
          return;
        }

        rows.set(part.id, {
          ...part,
          project_count: 1,
          project_names: project.name,
          total_qty: line.qty,
        });
      });
    });

    return Array.from(rows.values());
  }, []);
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
