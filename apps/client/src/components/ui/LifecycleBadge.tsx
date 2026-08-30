import type { LifecycleStage } from "../../api/types";

interface LifecycleBadgeProps {
  stage: LifecycleStage;
}

const lifecycleMeta: Record<LifecycleStage, { label: string; color: string }> =
  {
    active: { label: "Active", color: "var(--signal-good)" },
    nrnd: { label: "NRND", color: "var(--signal-caution)" },
    last_time_buy: { label: "Last Time Buy", color: "var(--signal-warn)" },
    obsolete: { label: "Obsolete", color: "var(--signal-critical)" },
    unknown: { label: "Unknown", color: "var(--text-secondary)" },
  };

export function LifecycleBadge({ stage }: LifecycleBadgeProps) {
  const meta = lifecycleMeta[stage] ?? lifecycleMeta.unknown;

  return (
    <span
      className="lifecycle-badge"
      style={{ "--badge-color": meta.color } as React.CSSProperties}
    >
      <span className="lifecycle-badge__dot" aria-hidden="true" />
      {meta.label}
    </span>
  );
}
