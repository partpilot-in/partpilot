import { Fragment, useMemo } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Plus, Star } from "lucide-react";
import { useProjects } from "../api/hooks/boms";
import { usePart, usePartAlternates, useProjectParts } from "../api/hooks/parts";
import type { Part } from "../api/types";
import {
  Card,
  ComplianceBadge,
  DataTable,
  EmptyState,
  ErrorMessage,
  LifecycleBadge,
  ScoreRing,
  Spinner,
  useToast,
  type Column,
} from "../components/ui";
import { currencyFormatter } from "../lib/format";
import { readManualParts, saveManualParts, type StoredMyPart } from "../lib/myPartsStorage";
import { useImportantParts } from "../lib/useImportantParts";

const recentSearchesStorageKey = "partpilot.recentPartSearches";

function removeRecentSearch(part: Part) {
  try {
    const raw = window.localStorage.getItem(recentSearchesStorageKey);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return;
    const next = parsed.filter((item) => {
      if (!item || typeof item !== "object") return false;
      const record = item as { id?: unknown; mpn?: unknown };
      return record.id !== part.id && String(record.mpn ?? "").toLowerCase() !== part.mpn.toLowerCase();
    });
    window.localStorage.setItem(recentSearchesStorageKey, JSON.stringify(next));
  } catch {
    // Ignore malformed local storage.
  }
}

export function PartDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: projects, loading: projectsLoading } = useProjects();
  const projectParts = useProjectParts(projects);
  const manualParts = useMemo(() => readManualParts(), []);
  const { parts: importantParts, isImportant, toggleImportant } = useImportantParts();
  const localPart = useMemo(
    () =>
      [
        ...manualParts,
        ...projectParts.map((row) => ({ ...row, source: "project" as const })),
        ...importantParts.map((row) => ({
          ...row,
          project_count: 0,
          project_names: "Important",
          total_qty: 1,
          source: "manual" as const,
        })),
      ].find((row) => row.id === id),
    [id, importantParts, manualParts, projectParts],
  );
  const { data: catalogPart, loading, error } = usePart(localPart ? undefined : id);
  const part = localPart ?? catalogPart;
  const { data: alternates, loading: altLoading } = usePartAlternates(localPart ? undefined : id);
  const { showToast } = useToast();

  const columns: Column<Part>[] = [
    { key: "mpn", header: "MPN", sortable: true },
    { key: "manufacturer", header: "Manufacturer", sortable: true },
    { key: "category", header: "Category", sortable: true },
    {
      key: "lifecycle_stage",
      header: "Lifecycle",
      sortable: true,
      render: (row) => <LifecycleBadge stage={row.lifecycle_stage} />,
    },
    {
      key: "unit_price",
      header: "Price",
      sortable: true,
      numeric: true,
      render: (row) => currencyFormatter.format(row.unit_price),
    },
    {
      key: "score",
      header: "PartPilot Score",
      sortable: true,
      numeric: true,
      render: (row) => <ScoreRing value={row.score} size="sm" />,
    },
  ];

  function markImportant() {
    if (!part) return;
    const important = toggleImportant(part);
    showToast({
      title: important ? "Marked important" : "Removed important mark",
      body: part.mpn,
      tone: "success",
    });
  }

  function addToMyParts() {
    if (!part) return;
    const stored = readManualParts();
    const exists = stored.some(
      (item) => item.id === part.id || item.mpn.trim().toLowerCase() === part.mpn.trim().toLowerCase(),
    ) || !!localPart;

    if (exists) {
      showToast({ title: "Already in My Parts", body: part.mpn });
      return;
    }

    saveManualParts([
      {
        ...part,
        project_count: 0,
        project_names: "Added from catalog",
        total_qty: 1,
        source: "manual",
      },
      ...stored,
    ]);
    removeRecentSearch(part);
    showToast({ title: "Added to My Parts", body: part.mpn, tone: "success" });
  }

  if (!localPart && (loading || projectsLoading)) {
    return <Spinner message="Loading part details..." />;
  }

  if (!localPart && error) {
    return <ErrorMessage message={error} />;
  }

  if (!part) {
    return (
      <EmptyState
        title="Part not found"
        body="This part does not exist in the catalog."
        action={
          <Link className="button" to="/my-parts">
            Back to My Parts
          </Link>
        }
      />
    );
  }

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">{part.mpn}</h1>
          <p className="page-subtitle">
            {part.manufacturer} – {part.description}
          </p>
        </div>
        <div className="inline-stack">
          <Link className="button" to="/my-parts">
            <ArrowLeft size={16} />
            Back
          </Link>
          <button type="button" className="button button--primary" onClick={addToMyParts}>
            <Plus size={16} />
            Add to My Parts
          </button>
          <button type="button" className="button" onClick={markImportant}>
            <Star size={16} fill={isImportant(part.id) ? "currentColor" : "none"} />
            {isImportant(part.id) ? "Important" : "Mark Important"}
          </button>
        </div>
      </div>

      <section className="detail-grid">
        <Card title="Lifecycle summary">
          <div className="part-summary">
            <ScoreRing value={part.score} size="lg" showLabel />
            <dl className="property-list">
              <dt>Manufacturer</dt>
              <dd>{part.manufacturer}</dd>
              <dt>Lifecycle</dt>
              <dd>
                <LifecycleBadge stage={part.lifecycle_stage} />
              </dd>
              <dt>Compliance</dt>
              <dd>
                <ComplianceBadge statuses={part.compliance} />
              </dd>
              <dt>Country</dt>
              <dd>{part.country_of_origin}</dd>
              <dt>Unit price</dt>
              <dd>{currencyFormatter.format(part.unit_price)}</dd>
            </dl>
          </div>
        </Card>
        <Card title="Parameters">
          <dl className="property-list">
            {Object.entries(part.parameters).map(([key, value]) => (
              <Fragment key={key}>
                <dt>{key}</dt>
                <dd>{String(value)}</dd>
              </Fragment>
            ))}
          </dl>
        </Card>
      </section>

      <section className="stack alternates-section">
        <h2 className="section-title">Alternates</h2>
        {altLoading ? (
          <Spinner message="Loading alternates..." />
        ) : (
          <DataTable
            columns={columns}
            rows={alternates ?? []}
            getRowId={(row) => row.id}
            onRowClick={(row) => navigate(`/parts/${row.id}`)}
          />
        )}
      </section>
    </div>
  );
}
