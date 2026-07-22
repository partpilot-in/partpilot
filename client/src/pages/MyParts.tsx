import { useNavigate } from "react-router-dom";
import { useProjectParts, type ProjectPartRow } from "../api/hooks/parts";
import {
  DataTable,
  EmptyState,
  LifecycleBadge,
  ScoreRing,
  type Column,
} from "../components/ui";

export function MyParts() {
  const navigate = useNavigate();
  const rows = useProjectParts();

  const columns: Column<ProjectPartRow>[] = [
    { key: "mpn", header: "MPN", sortable: true },
    { key: "manufacturer", header: "Manufacturer", sortable: true },
    { key: "category", header: "Category", sortable: true },
    { key: "project_names", header: "Projects", sortable: true },
    { key: "project_count", header: "Project Count", sortable: true, numeric: true },
    { key: "total_qty", header: "Total Qty", sortable: true, numeric: true },
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
  ];

  return (
    <div className="stack">
      <section className="page-header">
        <div>
          <h1 className="page-title">My Parts</h1>
          <p className="page-subtitle">All parts currently used across project BOMs.</p>
        </div>
      </section>

      <DataTable
        columns={columns}
        rows={rows}
        getRowId={(row) => row.id}
        onRowClick={(row) => navigate(`/parts/${row.id}`)}
        emptyState={<EmptyState title="No project parts" body="Uploaded projects will appear here." />}
      />
    </div>
  );
}
