import { Fragment } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, BellPlus, Plus } from "lucide-react";
import { usePart, usePartAlternates } from "../api/hooks/parts";
import { useAddToWatchlist } from "../api/hooks/watchlist";
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

const manualPartsStorageKey = "partpilot.manualParts";
const recentSearchesStorageKey = "partpilot.recentPartSearches";

interface StoredMyPart extends Part {
  project_count: number;
  project_names: string;
  total_qty: number;
  source: "manual" | "project";
}

function readStoredMyParts(): StoredMyPart[] {
  try {
    const raw = window.localStorage.getItem(manualPartsStorageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeStoredMyParts(parts: StoredMyPart[]) {
  window.localStorage.setItem(manualPartsStorageKey, JSON.stringify(parts));
}

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
  const { data: part, loading, error } = usePart(id);
  const { data: alternates, loading: altLoading } = usePartAlternates(id);
  const { addToWatchlist } = useAddToWatchlist();
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

  async function watchPart() {
    if (!part) return;
    await addToWatchlist(part.id);
    showToast({ title: "Added to watchlist", body: part.mpn, tone: "success" });
  }

  function addToMyParts() {
    if (!part) return;
    const stored = readStoredMyParts();
    const exists = stored.some(
      (item) => item.id === part.id || item.mpn.trim().toLowerCase() === part.mpn.trim().toLowerCase(),
    );

    if (exists) {
      showToast({ title: "Already in My Parts", body: part.mpn });
      return;
    }

    writeStoredMyParts([
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

  if (loading) {
    return <Spinner message="Loading part details..." />;
  }

  if (error) {
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
          <button type="button" className="button" onClick={watchPart}>
            <BellPlus size={16} />
            Watch
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

      <Card title="Alternates">
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
      </Card>
    </div>
  );
}
