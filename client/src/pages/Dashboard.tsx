import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import { useProjects } from "../api/hooks/boms";
import { useWatchlist, useWatchlistSummary } from "../api/hooks/watchlist";
import type { WatchlistItem } from "../api/types";
import { Card, DataTable, LifecycleBadge, ScoreRing, type Column } from "../components/ui";
import { formatDate, getGreeting } from "../lib/format";

export function Dashboard() {
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const watchlist = useWatchlist();
  const summary = useWatchlistSummary();
  const projects = useProjects();
  const needingAttention = [...watchlist].sort((a, b) => a.score - b.score).slice(0, 5);

  const columns: Column<WatchlistItem>[] = [
    { key: "mpn", header: "MPN", sortable: true },
    { key: "manufacturer", header: "Manufacturer", sortable: true },
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

  function submit(event: FormEvent) {
    event.preventDefault();
    const next = query.trim();
    navigate(next ? `/search?q=${encodeURIComponent(next)}` : "/search");
  }

  return (
    <div className="stack">
      <section className="hero-search">
        <h1>{getGreeting()}</h1>
        <form className="large-search" role="search" onSubmit={submit}>
          <Search size={20} aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search any part or project..."
            aria-label="Search any part or project"
          />
        </form>
      </section>

      <section className="metric-grid" aria-label="Dashboard summary">
        <Card title="Watchlist risk">
          <ul className="metric-list">
            <li className="metric-row">
              <span className="metric-row__label" style={{ color: "var(--signal-critical)" }}>
                <span className="signal-dot" /> Critical
              </span>
              <strong>{summary.critical}</strong>
            </li>
            <li className="metric-row">
              <span className="metric-row__label" style={{ color: "var(--signal-warn)" }}>
                <span className="signal-dot" /> High
              </span>
              <strong>{summary.high}</strong>
            </li>
            <li className="metric-row">
              <span className="metric-row__label" style={{ color: "var(--signal-caution)" }}>
                <span className="signal-dot" /> Medium
              </span>
              <strong>{summary.medium}</strong>
            </li>
          </ul>
        </Card>

        <Card title="Recent projects">
          <ul className="metric-list">
            {projects.slice(0, 3).map((project) => (
              <li key={project.id} className="metric-row">
                <Link to={`/projects/${project.id}`}>{project.name}</Link>
                <ScoreRing value={project.lowest_score} size="sm" />
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Needs review">
          <ul className="metric-list">
            <li className="metric-row">
              <span className="metric-row__label">Parts with high risk</span>
              <strong>{summary.needs_review}</strong>
            </li>
            <li className="metric-row">
              <span className="metric-row__label">Last sweep</span>
              <strong>{formatDate("2026-07-01")}</strong>
            </li>
            <li className="metric-row">
              <span className="metric-row__label">Watchlist size</span>
              <strong>{watchlist.length}</strong>
            </li>
          </ul>
        </Card>
      </section>

      <Card title="Parts needing attention">
        <DataTable
          columns={columns}
          rows={needingAttention}
          getRowId={(row) => row.id}
          onRowClick={(row) => navigate(`/parts/${row.id}`)}
        />
      </Card>
    </div>
  );
}
