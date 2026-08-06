import { FormEvent, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Star } from "lucide-react";
import { useProjects } from "../api/hooks/boms";
import { useProjectParts } from "../api/hooks/parts";
import type { Part } from "../api/types";
import { DataTable, ErrorMessage, LifecycleBadge, ScoreRing, Spinner, type Column } from "../components/ui";
import { getGreeting } from "../lib/format";
import { readManualParts } from "../lib/myPartsStorage";
import { useImportantParts } from "../lib/useImportantParts";

export function Dashboard() {
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const { ids: importantIds, parts: importantParts } = useImportantParts();
  const { data: projects, loading: projLoading, error: projError } = useProjects();
  const projectParts = useProjectParts(projects);
  const manualParts = useMemo(() => readManualParts(), []);
  const parts = useMemo(() => {
    const rows = new Map<string, Part>();
    [...projectParts, ...manualParts, ...importantParts].forEach((part) => rows.set(part.id, part));
    return Array.from(rows.values());
  }, [importantParts, manualParts, projectParts]);
  const attentionRows = useMemo(
    () =>
      [...parts]
        .sort((a, b) => Number(importantIds.has(b.id)) - Number(importantIds.has(a.id)) || a.score - b.score)
        .slice(0, 10),
    [importantIds, parts],
  );
  const columns: Column<Part>[] = [
    {
      key: "important",
      header: "Important",
      render: (row) =>
        importantIds.has(row.id) ? <Star className="dashboard-star" size={16} fill="currentColor" /> : "",
    },
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
    navigate(next ? `/my-parts?q=${encodeURIComponent(next)}` : "/my-parts");
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

      <section className="stack alternates-section" aria-label="Dashboard overview">
        <h2 className="section-title">Parts needing attention</h2>
        {projLoading ? (
          <Spinner message="Scanning parts..." />
        ) : projError ? (
          <ErrorMessage message={projError} />
        ) : (
          <DataTable
            columns={columns}
            rows={attentionRows}
            getRowId={(row) => row.id}
            onRowClick={(row) => navigate(`/parts/${row.id}`)}
          />
        )}
      </section>
    </div>
  );
}
