import { Check, ChevronDown } from "lucide-react";

interface FilterChipProps {
  label: string;
  active: boolean;
  onToggle: () => void;
}

export function FilterChip({ label, active, onToggle }: FilterChipProps) {
  return (
    <button
      type="button"
      className={["filter-chip", active && "filter-chip--active"].filter(Boolean).join(" ")}
      aria-pressed={active}
      onClick={onToggle}
    >
      {active ? <Check size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
      {label}
    </button>
  );
}
