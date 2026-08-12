import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { MoreVertical, Plus, Star } from "lucide-react";
import { useProjects } from "../api/hooks/boms";
import { useMyParts, useMyPartsMutations } from "../api/hooks/myParts";
import { usePart, usePartAlternates, useProjectParts } from "../api/hooks/parts";
import {
  CDD_SECTION_DEFINITIONS,
  DESIGNATOR_CATEGORY_LABELS,
  cddFieldLabel,
  cddValueAtPath,
  fieldsForCddSection,
  formatCddValue,
  resolveDesignatorCategory,
} from "../api/componentMetadata";
import type { Part } from "../api/types";
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
  useToast,
  type Column,
  type NoteTarget,
} from "../components/ui";
import { currencyFormatter } from "../lib/format";
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
  const { data: manualParts, loading: manualPartsLoading, refetch: refetchMyParts } = useMyParts();
  const { createMyPart } = useMyPartsMutations();
  const projectParts = useProjectParts(projects);
  const { parts: importantParts, isImportant, toggleImportant } = useImportantParts();
  const localPart = useMemo(
    () =>
      [
        ...(manualParts ?? []),
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
  const [actionsOpen, setActionsOpen] = useState(false);
  const [noteTarget, setNoteTarget] = useState<NoteTarget | null>(null);
  const actionsMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function closeActionsMenu(event: MouseEvent) {
      if (!actionsMenuRef.current?.contains(event.target as Node)) {
        setActionsOpen(false);
      }
    }

    function closeActionsMenuOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setActionsOpen(false);
    }

    document.addEventListener("mousedown", closeActionsMenu);
    document.addEventListener("keydown", closeActionsMenuOnEscape);

    return () => {
      document.removeEventListener("mousedown", closeActionsMenu);
      document.removeEventListener("keydown", closeActionsMenuOnEscape);
    };
  }, []);

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
    {
      key: "note",
      header: "Note",
      render: (row) => (
        <PartNoteButton
          part={{ id: row.id, label: row.mpn }}
          onOpen={setNoteTarget}
        />
      ),
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

  async function addToMyParts() {
    if (!part) return;
    const exists = (manualParts ?? []).some(
      (item) => item.id === part.id || item.mpn.trim().toLowerCase() === part.mpn.trim().toLowerCase(),
    ) || !!localPart;

    if (exists) {
      showToast({ title: "Already in My Parts", body: part.mpn });
      return;
    }

    try {
      await createMyPart({ ...part, total_qty: 1 });
      refetchMyParts();
      removeRecentSearch(part);
      showToast({ title: "Added to My Parts", body: part.mpn, tone: "success" });
    } catch (addError) {
      showToast({
        title: "Could not add part",
        body: addError instanceof Error ? addError.message : "Please try again.",
      });
    }
  }

  if (!localPart && (loading || projectsLoading || manualPartsLoading)) {
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

  const parameterEntries = Object.entries(part.parameters ?? {});
  const designatorCategory = resolveDesignatorCategory(part.category, part.description);
  const componentMetadata = part.component_metadata ?? {};

  return (
    <div className="stack">
      <div className="page-header detail-page-header">
        <div className="detail-page-heading">
          <div className="project-title-row">
            <h1 className="page-title">{part.mpn}</h1>
            <PartNoteButton
              part={{ id: part.id, label: part.mpn }}
              onOpen={setNoteTarget}
            />
          </div>
          <p className="page-subtitle">
            {part.manufacturer} – {part.description}
          </p>
        </div>
        <div className="account-menu detail-actions-menu" ref={actionsMenuRef}>
          <button
            type="button"
            className="button detail-actions-button"
            aria-label="Part actions"
            aria-haspopup="menu"
            aria-expanded={actionsOpen}
            onClick={() => setActionsOpen((open) => !open)}
          >
            <MoreVertical size={16} />
            <span className="detail-action-label">Actions</span>
          </button>
          {actionsOpen && (
            <div className="account-menu__panel detail-actions-menu__panel" role="menu">
              <button
                type="button"
                className="account-menu__item"
                role="menuitem"
                onClick={() => {
                  setActionsOpen(false);
                  void addToMyParts();
                }}
              >
                <Plus size={18} />
                <span>Add to My Parts</span>
              </button>
              <button
                type="button"
                className="account-menu__item"
                role="menuitem"
                onClick={() => {
                  setActionsOpen(false);
                  markImportant();
                }}
              >
                <Star size={18} fill={isImportant(part.id) ? "currentColor" : "none"} />
                <span>{isImportant(part.id) ? "Remove Important" : "Mark Important"}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      <section className={`detail-grid${parameterEntries.length ? "" : " detail-grid--single"}`}>
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
        {parameterEntries.length > 0 && (
          <Card title="Parameters">
            <dl className="property-list">
              {parameterEntries.map(([key, value]) => (
                <Fragment key={key}>
                  <dt>{key}</dt>
                  <dd>{String(value)}</dd>
                </Fragment>
              ))}
            </dl>
          </Card>
        )}
      </section>

      <section className="stack component-metadata-section" aria-labelledby="component-metadata-title">
        <div className="component-metadata-heading">
          <div>
            <h2 className="section-title" id="component-metadata-title">Component</h2>
            <p className="component-metadata-subtitle">IEC CDD metadata</p>
          </div>
          {designatorCategory && (
            <span className="component-category-label">
              {designatorCategory} · {DESIGNATOR_CATEGORY_LABELS[designatorCategory]}
            </span>
          )}
        </div>
        <div className="component-metadata-grid">
          {CDD_SECTION_DEFINITIONS.map((section) => (
            <Card key={section.key} title={section.title} className="component-metadata-card">
              <dl className="property-list component-metadata-list">
                {fieldsForCddSection(section, designatorCategory).map((field) => (
                  <Fragment key={field}>
                    <dt>{cddFieldLabel(field)}</dt>
                    <dd>{formatCddValue(cddValueAtPath(componentMetadata, section.key, field))}</dd>
                  </Fragment>
                ))}
              </dl>
            </Card>
          ))}
        </div>
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

      <PartNoteModal part={noteTarget} onClose={() => setNoteTarget(null)} />
    </div>
  );
}
