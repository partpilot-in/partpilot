import type { LifecycleStage } from "../api/types";

export type CurrencyCode = "USD" | "EUR" | "GBP" | "INR" | "JPY";

export const supportedCurrencies: { code: CurrencyCode; label: string }[] = [
  { code: "USD", label: "USD - US Dollar" },
  { code: "EUR", label: "EUR - Euro" },
  { code: "GBP", label: "GBP - British Pound" },
  { code: "INR", label: "INR - Indian Rupee" },
  { code: "JPY", label: "JPY - Japanese Yen" },
];

export const defaultCurrency: CurrencyCode = "USD";
export const currencyPreferenceStorageKey = "partpilot.defaultCurrency";
export const currencyPreferenceChangeEvent = "partpilot:currency-change";

export function isCurrencyCode(value: string): value is CurrencyCode {
  return supportedCurrencies.some((currency) => currency.code === value);
}

export function readCurrencyPreference(): CurrencyCode {
  if (typeof window === "undefined") return defaultCurrency;
  const saved = window.localStorage.getItem(currencyPreferenceStorageKey);
  return saved && isCurrencyCode(saved) ? saved : defaultCurrency;
}

export function saveCurrencyPreference(currency: CurrencyCode) {
  window.localStorage.setItem(currencyPreferenceStorageKey, currency);
  window.dispatchEvent(new CustomEvent(currencyPreferenceChangeEvent, { detail: { currency } }));
}

export function createCurrencyFormatter(currency: CurrencyCode = defaultCurrency) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
}

export const currencyFormatter = createCurrencyFormatter(defaultCurrency);

export const usdCurrencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

export const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

export function formatDate(value: string | undefined) {
  if (!value) return "Unknown date";

  const dateOnly = value.match(/^\d{4}-\d{2}-\d{2}$/);
  const date = new Date(dateOnly ? `${value}T00:00:00` : value);

  if (!Number.isFinite(date.getTime())) return "Unknown date";

  return dateFormatter.format(date);
}

export function formatLifecycleForParam(stage: LifecycleStage) {
  return stage.replace(/_/g, " ");
}

export function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}
