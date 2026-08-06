import { useEffect, useState } from "react";
import type { CurrencyCode } from "./format";

interface ExchangeRateState {
  date: string | undefined;
  error: string | undefined;
  loading: boolean;
  rate: number;
}

interface FrankfurterRateResponse {
  date?: string;
  base?: string;
  quote?: string;
  rate?: number;
}

const exchangeRateCacheKey = "partpilot.exchangeRates";
const exchangeRateCacheTtlMs = 15 * 60 * 1000;

interface CachedRate {
  date: string | undefined;
  fetchedAt: number;
  rate: number;
}

function readCachedRate(currency: CurrencyCode): CachedRate | undefined {
  try {
    const raw = window.sessionStorage.getItem(exchangeRateCacheKey);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw);
    const cached = parsed?.[currency] as CachedRate | undefined;
    if (!cached || typeof cached.rate !== "number" || typeof cached.fetchedAt !== "number") return undefined;
    if (Date.now() - cached.fetchedAt > exchangeRateCacheTtlMs) return undefined;
    return cached;
  } catch {
    return undefined;
  }
}

function writeCachedRate(currency: CurrencyCode, rate: CachedRate) {
  try {
    const raw = window.sessionStorage.getItem(exchangeRateCacheKey);
    const parsed = raw ? JSON.parse(raw) : {};
    window.sessionStorage.setItem(exchangeRateCacheKey, JSON.stringify({ ...parsed, [currency]: rate }));
  } catch {
    // Cache failure should not block rendering converted prices.
  }
}

export function useUsdExchangeRate(currency: CurrencyCode): ExchangeRateState {
  const [state, setState] = useState<ExchangeRateState>({
    date: undefined,
    error: undefined,
    loading: currency !== "USD",
    rate: 1,
  });

  useEffect(() => {
    if (currency === "USD") {
      setState({ date: undefined, error: undefined, loading: false, rate: 1 });
      return;
    }

    const cached = readCachedRate(currency);
    if (cached) {
      setState({ date: cached.date, error: undefined, loading: false, rate: cached.rate });
      return;
    }

    const controller = new AbortController();
    setState((current) => ({ ...current, error: undefined, loading: true }));

    fetch(`https://api.frankfurter.dev/v2/rate/USD/${currency}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Exchange rate unavailable");
        return response.json() as Promise<FrankfurterRateResponse>;
      })
      .then((payload) => {
        if (!payload.rate || !Number.isFinite(payload.rate)) {
          throw new Error("Exchange rate unavailable");
        }

        const nextRate = { date: payload.date, fetchedAt: Date.now(), rate: payload.rate };
        writeCachedRate(currency, nextRate);
        setState({ date: payload.date, error: undefined, loading: false, rate: payload.rate });
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState({ date: undefined, error: "Live exchange rate unavailable", loading: false, rate: 1 });
      });

    return () => controller.abort();
  }, [currency]);

  return state;
}
