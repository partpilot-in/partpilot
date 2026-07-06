import { useMemo } from "react";
import { assertMockMode } from "../client";
import { mockBomDiff, mockParts, mockProjects } from "../mockData";
import type { Project } from "../types";

function createUploadedProject(file: File): Project {
  const uploaded: Project = {
    id: `bom-uploaded-${Date.now()}`,
    name: file.name.replace(/\.(csv|xlsx)$/i, "") || "Uploaded BOM",
    part_count: 4,
    uploaded_at: new Date().toISOString().slice(0, 10),
    owner: "Tirrek",
    lowest_score: 61,
    lines: mockProjects[1].lines.map((line, index) => ({
      ...line,
      id: `uploaded-${line.part_id}-${index + 1}`,
      line_no: index + 1,
    })),
  };
  mockProjects.unshift(uploaded);
  return uploaded;
}

export function useProjects() {
  assertMockMode();
  return useMemo(() => mockProjects, []);
}

export function useProject(id: string | undefined) {
  assertMockMode();
  return useMemo(() => {
    if (!id) return undefined;
    return mockProjects.find((project) => project.id === id);
  }, [id]);
}

export function useUploadBom() {
  assertMockMode();
  async function uploadBom(file: File) {
    await new Promise((resolve) => window.setTimeout(resolve, 500));
    return createUploadedProject(file);
  }
  return { uploadBom };
}

export function useCompareBoms(a: string | null, b: string | null) {
  assertMockMode();
  return useMemo(() => {
    if (!a || !b) return [];
    return mockBomDiff.map((row) => {
      const latestPart = mockParts.find((part) => part.id === row.part_id);
      return latestPart ? { ...row, score: latestPart.score } : row;
    });
  }, [a, b]);
}
