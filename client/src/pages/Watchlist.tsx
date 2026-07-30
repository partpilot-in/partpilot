import { useNavigate } from "react-router-dom";
import { useWatchlist } from "../api/hooks/watchlist";
import type { WatchlistItem } from "../api/types";
import { Card, DataTable, ErrorMessage, LifecycleBadge, ScoreRing, Spinner, type Column } from "../components/ui";
import { formatDate } from "../lib/format";

export function Watchlist() {
  const navigate = useNavigate();
  const { data: rows, loading, error } = useWatchlist();

  const columns: Column<WatchlistItem>[] = [
    { key: "mpn", header: "MPN", sortable: true },
    { key: "manufacturer", header: "Manufacturer", sortable: true },
    { key: "risk_band", header: "Risk", sortable: true },
    {
      key: "lifecycle_stage",
      header: "Lifecycle",
      sortable: true,
      render: (row) => <LifecycleBadge stage={row.lifecycle_stage} />,
    },
    {
      key: "last_changed",
      header: "Last changed",
      sortable: true,
      render: (row) => formatDate(row.last_changed),
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
      <div className="page-header">
        <div>
          <h1 className="page-title">Watchlist</h1>
          <p className="page-subtitle">Track parts at risk of obsolescence.</p>
        </div>
      </div>
      <Card title="Tracked parts">
        {loading ? (
          <Spinner message="Loading watchlist..." />
        ) : error ? (
          <ErrorMessage message={error} />
        ) : (
          <DataTable columns={columns} rows={rows ?? []} getRowId={(row) => row.id} onRowClick={(row) => navigate(`/parts/${row.id}`)} />
        )}
      </Card>
    </div>
  );
}
