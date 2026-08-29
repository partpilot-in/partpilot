import { Check } from "lucide-react";

interface FilterChipProps {
  label: string;
  active: boolean;
  onToggle: () => void;
  showActiveIcon?: boolean;
}

export function FilterChip({ label, active, onToggle, showActiveIcon = true }: FilterChipProps) {
  return (
    <button
      type="button"
      className={["filter-chip", active && "filter-chip--active"].filter(Boolean).join(" ")}
      aria-pressed={active}
      onClick={onToggle}
    >
      {active && showActiveIcon ? <Check size={14} aria-hidden="true" /> : null}
      {label}
    </button>
  );
}
