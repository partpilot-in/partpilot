import { api } from "../client";
import type { Part } from "../types";
import type { ProjectPartRow } from "./parts";
import { useAsync } from "./useAsync";

export interface MyPart extends ProjectPartRow {
  source: "manual";
}

export interface MyPartInput {
  mpn: string;
  manufacturer: string;
  category: string;
  description: string;
  total_qty: number;
  score?: number;
  component_metadata?: Part["component_metadata"];
}

function responseItems(payload: unknown): MyPart[] {
  if (!payload || typeof payload !== "object") return [];
  const data = (payload as { data?: unknown }).data;
  return Array.isArray(data) ? data as MyPart[] : [];
}

export function useMyParts() {
  return useAsync<MyPart[]>(
    () => api.get("/v1/my-parts").then((response) => responseItems(response.data)),
    [],
  );
}

export function useMyPartsMutations() {
  async function createMyPart(input: MyPartInput): Promise<MyPart> {
    const response = await api.post("/v1/my-parts", input);
    return response.data as MyPart;
  }

  async function updateMyPart(id: string, input: MyPartInput): Promise<MyPart> {
    const response = await api.patch(`/v1/my-parts/${id}`, input);
    return response.data as MyPart;
  }

  async function deleteMyPart(id: string): Promise<void> {
    await api.delete(`/v1/my-parts/${id}`);
  }

  return { createMyPart, updateMyPart, deleteMyPart };
}
