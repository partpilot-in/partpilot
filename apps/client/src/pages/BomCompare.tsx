import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useCompareBoms, useProject } from "../api/hooks/boms";
import {
  complianceFromCharacteristics,
  lifecycleFromCharacteristics,
} from "../api/componentMetadata";
import type { BomDiffLine } from "../api/types";
import {
  Card,
  ComplianceBadge,
  DataTable,
  EmptyState,
  ErrorMessage,
  LifecycleBadge,
  PartNoteButton,
  PartNoteModal,
  ScoreRing,
  Spinner,
  type Column,
  type NoteTarget,
} from "../components/ui";
import { currencyFormatter } from "../lib/format";

export function BomCompare() {
  const [searchParams] = useSearchParams();
  const a = searchParams.get("a");
  const b = searchParams.get("b");
  const { data: left } = useProject(a ?? undefined);
  const { data: right } = useProject(b ?? undefined);
  const { data: rows, loading, error } = useCompareBoms(a, b);
  const [noteTarget, setNoteTarget] = useState<NoteTarget | null>(null);

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
      sortValue: (row) =>
        complianceFromCharacteristics(row.component_metadata)
          .map((item) => item.status)
          .join(","),
      render: (row) => (
        <ComplianceBadge
          statuses={complianceFromCharacteristics(row.component_metadata)}
        />
      ),
    },
    {
      key: "lifecycle_stage",
      header: "Lifecycle",
      sortable: true,
      sortValue: (row) => lifecycleFromCharacteristics(row.component_metadata),
      render: (row) => (
        <LifecycleBadge
          stage={lifecycleFromCharacteristics(row.component_metadata)}
        />
      ),
    },
    {
      key: "score",
      header: "PartPilot Score",
      sortable: true,
      numeric: true,
      render: (row) => <ScoreRing value={row.score} size="sm" />,
    },
    {
      key: "note",
      header: "Note",
      render: (row) => (
        <PartNoteButton
          part={{ id: row.part_id, label: row.mpn }}
          onOpen={setNoteTarget}
        />
      ),
    },
    { key: "change_summary", header: "Change", sortable: true },
  ];

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">BOM diff</h1>
          <p className="page-subtitle">
            {left?.name ?? "Project A"} compared with{" "}
            {right?.name ?? "Project B"}
          </p>
        </div>
        <Link className="button" to="/projects">
          <ArrowLeft size={16} />
          Back to projects
        </Link>
      </div>
      <Card>
        {!a || !b ? (
          <EmptyState
            title="Choose two BOMs"
            body="Select two project cards to open a line-level diff."
          />
        ) : loading ? (
          <Spinner message="Comparing BOMs..." />
        ) : error ? (
          <ErrorMessage message={error} />
        ) : (
          <DataTable
            columns={columns}
            rows={rows ?? []}
            getRowId={(row) => `${row.delta}-${row.id}`}
            rowClassName={(row) => `data-table-row--${row.delta}`}
          />
        )}
      </Card>
      <PartNoteModal part={noteTarget} onClose={() => setNoteTarget(null)} />
    </div>
  );
}
