import { AlertCircle, CheckCircle2, HelpCircle } from "lucide-react";
import type { ComplianceStatus } from "../../api/types";

interface ComplianceBadgeProps {
  statuses?: { standard?: string; status?: ComplianceStatus }[] | null;
}

function StatusIcon({ status }: { status: ComplianceStatus }) {
  if (status === "pass") return <CheckCircle2 size={14} aria-hidden="true" />;
  if (status === "fail") return <AlertCircle size={14} aria-hidden="true" />;
  return <HelpCircle size={14} aria-hidden="true" />;
}

export function ComplianceBadge({ statuses }: ComplianceBadgeProps) {
  const safeStatuses = Array.isArray(statuses) ? statuses : [];

  if (!safeStatuses.length) {
    return (
      <span className="compliance-badge__item" data-status="unknown">
        <StatusIcon status="unknown" />
        Unknown
      </span>
    );
  }

  return (
    <span className="compliance-badge" aria-label="Compliance statuses">
      {safeStatuses.map((item, index) => (
        <span
          key={`${item.standard ?? "unknown"}-${index}`}
          className="compliance-badge__item"
          data-status={item.status ?? "unknown"}
        >
          <StatusIcon status={item.status ?? "unknown"} />
          {item.standard ?? "Unknown"}
        </span>
      ))}
    </span>
  );
}
