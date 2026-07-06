import { useMemo } from "react";
import { assertMockMode } from "../client";
import { mockWatchlist } from "../mockData";

export function useWatchlist() {
  assertMockMode();
  return useMemo(() => mockWatchlist, []);
}

export function useWatchlistSummary() {
  assertMockMode();
  return useMemo(
    () =>
      mockWatchlist.reduce(
        (summary, item) => {
          summary[item.risk_band] += 1;
          if (item.risk_band === "critical" || item.risk_band === "high") summary.needs_review += 1;
          return summary;
        },
        { critical: 0, high: 0, medium: 0, low: 0, needs_review: 0 },
      ),
    [],
  );
}

export function useAddToWatchlist() {
  assertMockMode();
  return {
    addToWatchlist: async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 250));
    },
  };
}

export function useRemoveFromWatchlist() {
  assertMockMode();
  return {
    removeFromWatchlist: async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 250));
    },
  };
}
