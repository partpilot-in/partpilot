import { api } from "../client";
import {
  apiNumber,
  apiRecord,
  apiResponseItems,
  apiString,
  partFromApi,
} from "../partPayload";
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
  return apiResponseItems(payload).flatMap((value) => {
    const part = myPartFromApi(value);
    return part ? [part] : [];
  });
}

function myPartFromApi(value: unknown): MyPart | undefined {
  const part = partFromApi(value);
  if (!part) return undefined;
  const record = apiRecord(value);
  return {
    ...part,
    project_count: Math.max(0, apiNumber(record.project_count, 0)),
    project_names: apiString(record.project_names, "Manual entry"),
    total_qty: Math.max(1, apiNumber(record.total_qty, 1)),
    source: "manual",
  };
}

export function useMyParts() {
  return useAsync<MyPart[]>(
    () =>
      api.get("/v1/my-parts").then((response) => responseItems(response.data)),
    [],
  );
}

export function useMyPartsMutations() {
  async function createMyPart(input: MyPartInput): Promise<MyPart> {
    const response = await api.post("/v1/my-parts", input);
    const part = myPartFromApi(response.data);
    if (!part) throw new Error("The server returned an invalid My Part");
    return part;
  }

  async function updateMyPart(id: string, input: MyPartInput): Promise<MyPart> {
    const response = await api.patch(`/v1/my-parts/${id}`, input);
    const part = myPartFromApi(response.data);
    if (!part) throw new Error("The server returned an invalid My Part");
    return part;
  }

  async function deleteMyPart(id: string): Promise<void> {
    await api.delete(`/v1/my-parts/${id}`);
  }

  return { createMyPart, updateMyPart, deleteMyPart };
}
