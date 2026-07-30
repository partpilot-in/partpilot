import { useMemo } from "react";
import { api } from "../client";
import type { WatchlistItem, WatchlistSummary } from "../types";
import { useAsync } from "./useAsync";

/**
 * Fetch the user's watchlist via `GET /v1/watchlist`.
 */
export function useWatchlist() {
  return useAsync<WatchlistItem[]>(
    () => api.get("/v1/watchlist").then((res) => res.data?.items ?? res.data ?? []),
    [],
  );
}

/**
 * Derive watchlist risk summary from watchlist data.
 */
export function useWatchlistSummary(items: WatchlistItem[] | undefined): WatchlistSummary {
  return useMemo(() => {
    const empty: WatchlistSummary = { critical: 0, high: 0, medium: 0, low: 0, needs_review: 0 };
    if (!items) return empty;
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
