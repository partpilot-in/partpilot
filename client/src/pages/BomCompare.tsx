import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useCompareBoms, useProject } from "../api/hooks/boms";
import type { BomDiffLine } from "../api/types";
import {
  Card,
  ComplianceBadge,
  DataTable,
  EmptyState,
  LifecycleBadge,
  ScoreRing,
  type Column,
} from "../components/ui";
import { currencyFormatter } from "../lib/format";

export function BomCompare() {
  const [searchParams] = useSearchParams();
  const a = searchParams.get("a");
  const b = searchParams.get("b");
  const left = useProject(a ?? undefined);
  const right = useProject(b ?? undefined);
  const rows = useCompareBoms(a, b);

  const columns: Column<BomDiffLine>[] = [
    {
      key: "delta",
      header: "Delta",
      sortable: true,
      render: (row) => <span className="delta-badge">{row.delta}</span>,
    },
    { key: "mpn", header: "MPN", sortable: true },
    { key: "description", header: "Description", sortable: true },
    { key: "manufacturer", header: "Manufacturer", sortable: true },
    { key: "qty", header: "Qty", sortable: true, numeric: true },
    {
      key: "unit_price",
      header: "Price",
      sortable: true,
      numeric: true,
      render: (row) => currencyFormatter.format(row.unit_price),
    },
    {
      key: "compliance",
      header: "Compliance",
      sortable: true,
      render: (row) => <ComplianceBadge statuses={row.compliance} />,
    },
    {
      key: "lifecycle_stage",
      header: "Lifecycle",
      sortable: true,
      render: (row) => <LifecycleBadge stage={row.lifecycle_stage} />,
    },
    {
      key: "score",
      header: "PartPilot Score",
      sortable: true,
      numeric: true,
      render: (row) => <ScoreRing value={row.score} size="sm" />,
    },
    { key: "change_summary", header: "Change", sortable: true },
  ];

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">BOM diff</h1>
          <p className="page-subtitle">
            {left?.name ?? "Project A"} compared with {right?.name ?? "Project B"}
          </p>
        </div>
        <Link className="button" to="/projects">
          <ArrowLeft size={16} />
          Back to projects
        </Link>
      </div>
      <Card>
        {a && b ? (
          <DataTable
            columns={columns}
            rows={rows}
            getRowId={(row) => `${row.delta}-${row.id}`}
            rowClassName={(row) => `data-table-row--${row.delta}`}
          />
        ) : (
          <EmptyState title="Choose two BOMs" body="Select two project cards to open a line-level diff." />
        )}
      </Card>
    </div>
  );
}
