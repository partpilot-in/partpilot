import type { LifecycleStage } from "../api/types";

export const currencyFormatter = new Intl.NumberFormat("en-US", {
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
