import { useMemo } from "react";
import { api } from "../client";
import type { WatchlistItem, WatchlistSummary } from "../types";
import { useAsync } from "./useAsync";

type ApiWatchlistItem = Partial<WatchlistItem> & {
  part_id?: string;
  added_at?: string;
};

function riskBandForScore(score: number): WatchlistItem["risk_band"] {
  if (score < 40) return "critical";
  if (score < 60) return "high";
  if (score < 80) return "medium";
  return "low";
}

function itemsFromResponse(payload: unknown): ApiWatchlistItem[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];

  const record = payload as Record<string, unknown>;
  if (Array.isArray(record.items)) return record.items as ApiWatchlistItem[];
  if (Array.isArray(record.data)) return record.data as ApiWatchlistItem[];
  return [];
}

function normalizeWatchlistItem(item: ApiWatchlistItem): WatchlistItem {
  const score = item.score ?? 0;
  return {
    id: item.id ?? item.part_id ?? item.mpn ?? crypto.randomUUID(),
    mpn: item.mpn ?? "Unknown",
    manufacturer: item.manufacturer ?? "Unknown",
    category: item.category ?? "Watchlist",
    description: item.description ?? "",
    lifecycle_stage: item.lifecycle_stage ?? "unknown",
    score,
    country_of_origin: item.country_of_origin ?? "Unknown",
    compliance: item.compliance ?? [],
    unit_price: item.unit_price ?? 0,
    parameters: item.parameters ?? {},
    risk_band: item.risk_band ?? riskBandForScore(score),
    last_changed: item.last_changed ?? item.added_at?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
  };
}

/**
 * Fetch the user's watchlist via `GET /v1/watchlist`.
 */
export function useWatchlist() {
  return useAsync<WatchlistItem[]>(
    () =>
      api
        .get("/v1/watchlist")
        .then((res) => itemsFromResponse(res.data).map(normalizeWatchlistItem))
        .catch(() => []),
    [],
  );
}

/**
 * Derive watchlist risk summary from watchlist data.
 */
export function useWatchlistSummary(items: WatchlistItem[] | undefined): WatchlistSummary {
  return useMemo(() => {
    const empty: WatchlistSummary = { critical: 0, high: 0, medium: 0, low: 0, needs_review: 0 };
    if (!Array.isArray(items)) return empty;
    return items.reduce((summary, item) => {
      summary[item.risk_band] += 1;
      if (item.risk_band === "critical" || item.risk_band === "high") summary.needs_review += 1;
      return summary;
    }, { ...empty });
  }, [items]);
}

/**
 * Add a part to the watchlist via `POST /v1/watchlist`.
 */
export function useAddToWatchlist() {
  return {
    addToWatchlist: async (partId: string) => {
      await api.post("/v1/watchlist", { part_id: partId });
    },
  };
}

/**
 * Remove a part from the watchlist via `DELETE /v1/watchlist/{partId}`.
 */
export function useRemoveFromWatchlist() {
  return {
    removeFromWatchlist: async (partId: string) => {
      await api.delete(`/v1/watchlist/${partId}`);
    },
  };
}
