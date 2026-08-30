import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { MoreVertical, Plus, Star } from "lucide-react";
import { useProjects } from "../api/hooks/boms";
import { useMyParts, useMyPartsMutations } from "../api/hooks/myParts";
import {
  usePart,
  usePartAlternates,
  usePartByMpn,
  useProjectParts,
} from "../api/hooks/parts";
import {
  CDD_SECTION_DEFINITIONS,
  DESIGNATOR_CATEGORY_LABELS,
  cddFieldLabel,
  cddValueAtPath,
  complianceFromCharacteristics,
  lifecycleFromCharacteristics,
  fieldsForCddSection,
  formatCddValue,
  overviewCharacteristicFields,
  referencePriceFromCharacteristics,
  resolveDesignatorCategory,
  type CddSectionKey,
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
import { partLookupPath } from "../lib/partRoutes";
import { useImportantParts } from "../lib/useImportantParts";

const recentSearchesStorageKey = "partpilot.recentPartSearches";

const hiddenCharacteristicFields: Partial<
  Record<CddSectionKey, ReadonlySet<string>>
> = {
  identification: new Set(["alternatePartNumbers"]),
  electrical: new Set(["additionalProperties"]),
  commercial: new Set(["priceBreaks", "distributors", "obsolescenceRiskScore"]),
};

function alternatePartNumbersFrom(part: Part | undefined) {
  const value = cddValueAtPath(
    part?.component_metadata ?? {},
    "identification",
    "alternatePartNumbers",
  );
  if (!Array.isArray(value)) return [];
  return value.filter(
    (partNumber): partNumber is string => typeof partNumber === "string",
  );
}

function recentSearchForId(id: string | undefined) {
  if (!id) return undefined;
  try {
    const raw = window.localStorage.getItem(recentSearchesStorageKey);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return undefined;
    return parsed.find(
      (item): item is { id: string; mpn: string; manufacturer?: string } =>
        item &&
        typeof item === "object" &&
        item.id === id &&
        typeof item.mpn === "string" &&
        (item.manufacturer === undefined ||
          typeof item.manufacturer === "string"),
    );
  } catch {
    return undefined;
  }
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
      return (
        record.id !== part.id &&
        String(record.mpn ?? "").toLowerCase() !== part.mpn.toLowerCase()
      );
    });
    window.localStorage.setItem(recentSearchesStorageKey, JSON.stringify(next));
  } catch {
    // Ignore malformed local storage.
  }
}

export function PartDetail() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { data: projects, loading: projectsLoading } = useProjects();
  const {
    data: manualParts,
    loading: manualPartsLoading,
    refetch: refetchMyParts,
  } = useMyParts();
  const { createMyPart } = useMyPartsMutations();
  const projectParts = useProjectParts(projects);
  const {
    parts: importantParts,
    isImportant,
    toggleImportant,
  } = useImportantParts();
  const recentSearchPart = useMemo(() => recentSearchForId(id), [id]);
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
  const requestedMpn = searchParams.get("mpn")?.trim() || recentSearchPart?.mpn;
  const requestedManufacturer =
    searchParams.get("manufacturer")?.trim() || recentSearchPart?.manufacturer;
  const {
    data: catalogPart,
    loading,
    error,
  } = usePart(localPart || requestedMpn ? undefined : id);
  const catalogPartForRoute = catalogPart?.id === id ? catalogPart : undefined;
  const lookupPart = localPart ?? catalogPartForRoute;
  const lookupMpn = lookupPart?.mpn ?? requestedMpn;
  const lookupManufacturer = lookupPart?.manufacturer ?? requestedManufacturer;
  const {
    data: searchedPart,
    loading: searchLoading,
    error: searchError,
  } = usePartByMpn(lookupMpn, lookupManufacturer);
  const part = searchedPart ?? lookupPart;
  const alternatePartNumbers = alternatePartNumbersFrom(part);
  const { data: alternates, loading: altLoading } = usePartAlternates(
    searchLoading ? [] : alternatePartNumbers,
    part?.mpn,
  );
  const { showToast } = useToast();
  const [actionsOpen, setActionsOpen] = useState(false);
  const [activeCharacteristicTab, setActiveCharacteristicTab] =
    useState<CddSectionKey>("electrical");
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
    { key: "description", header: "Description", sortable: true },
    {
      key: "unit_price",
      header: "Price",
      sortable: true,
      numeric: true,
      sortValue: (row) =>
        referencePriceFromCharacteristics(row.component_metadata),
      render: (row) =>
        currencyFormatter.format(
          referencePriceFromCharacteristics(row.component_metadata),
        ),
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
    const exists =
      (manualParts ?? []).some(
        (item) =>
          item.id === part.id ||
          item.mpn.trim().toLowerCase() === part.mpn.trim().toLowerCase(),
      ) || !!localPart;

    if (exists) {
      showToast({ title: "Already in My Parts", body: part.mpn });
      return;
    }

    try {
      await createMyPart({ ...part, total_qty: 1 });
      refetchMyParts();
      removeRecentSearch(part);
      showToast({
        title: "Added to My Parts",
        body: part.mpn,
        tone: "success",
      });
    } catch (addError) {
      showToast({
        title: "Could not add part",
        body:
          addError instanceof Error ? addError.message : "Please try again.",
      });
    }
  }

  if (
    (!localPart && (loading || projectsLoading || manualPartsLoading)) ||
    (!!lookupMpn && searchLoading)
  ) {
    return <Spinner message="Loading part details..." />;
  }

  if (!part && (searchError || (!lookupMpn && error))) {
    return (
      <ErrorMessage
        message={searchError ?? error ?? "Could not load part details"}
      />
    );
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

  const designatorCategory = resolveDesignatorCategory(
    part.category,
    part.description,
  );
  const componentMetadata = part.component_metadata ?? {};
  const activeCharacteristicSection =
    CDD_SECTION_DEFINITIONS.find(
      (section) => section.key === activeCharacteristicTab,
    ) ?? CDD_SECTION_DEFINITIONS[0];
  const overviewFields = overviewCharacteristicFields(designatorCategory);

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
            <div
              className="account-menu__panel detail-actions-menu__panel"
              role="menu"
            >
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
                <Star
                  size={18}
                  fill={isImportant(part.id) ? "currentColor" : "none"}
                />
                <span>
                  {isImportant(part.id) ? "Remove Important" : "Mark Important"}
                </span>
              </button>
            </div>
          )}
        </div>
      </div>

      <section className="detail-grid part-detail-grid">
        <div className="part-overview-grid">
          <Card title="PartPilot score" className="part-score-card">
            <div className="part-score-summary">
              <ScoreRing value={part.score} size="xl" />
            </div>
          </Card>
          <Card title="Overview">
            <dl className="property-list overview-list">
              {overviewFields.map(({ section, field }) => {
                const value = cddValueAtPath(componentMetadata, section, field);
                return (
                  <Fragment key={`${section}.${field}`}>
                    <dt>{cddFieldLabel(field)}</dt>
                    <dd>
                      {section === "commercial" &&
                      field === "lifecycleStatus" ? (
                        <LifecycleBadge
                          stage={lifecycleFromCharacteristics(
                            componentMetadata,
                          )}
                        />
                      ) : (
                        formatCddValue(value)
                      )}
                    </dd>
                  </Fragment>
                );
              })}
            </dl>
          </Card>
        </div>
        <Card
          title="Characteristics"
          className="characteristics-card"
          action={
            designatorCategory && (
              <span className="component-category-label">
                {designatorCategory} ·{" "}
                {DESIGNATOR_CATEGORY_LABELS[designatorCategory]}
              </span>
            )
          }
        >
          <div
            className="characteristics-tabs"
            role="tablist"
            aria-label="Characteristic sections"
          >
            {CDD_SECTION_DEFINITIONS.map((section) => (
              <button
                key={section.key}
                type="button"
                className={[
                  "characteristics-tab",
                  section.key === activeCharacteristicTab &&
                    "characteristics-tab--active",
                ]
                  .filter(Boolean)
                  .join(" ")}
                role="tab"
                aria-selected={section.key === activeCharacteristicTab}
                aria-controls="characteristics-panel"
                onClick={() => setActiveCharacteristicTab(section.key)}
              >
                {section.title}
              </button>
            ))}
          </div>
          <div
            className="characteristics-panel"
            id="characteristics-panel"
            role="tabpanel"
            aria-label={activeCharacteristicSection.title}
          >
            <dl className="property-list characteristics-list">
              {fieldsForCddSection(
                activeCharacteristicSection,
                designatorCategory,
              )
                .filter(
                  (field) =>
                    !hiddenCharacteristicFields[
                      activeCharacteristicSection.key
                    ]?.has(field),
                )
                .map((field) => (
                  <Fragment key={field}>
                    <dt>{cddFieldLabel(field)}</dt>
                    <dd>
                      {formatCddValue(
                        cddValueAtPath(
                          componentMetadata,
                          activeCharacteristicSection.key,
                          field,
                        ),
                      )}
                    </dd>
                  </Fragment>
                ))}
            </dl>
          </div>
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
            getRowId={(row) => `${row.manufacturer}:${row.mpn}`}
            onRowClick={(row) => navigate(partLookupPath(row))}
          />
        )}
      </section>

      <PartNoteModal part={noteTarget} onClose={() => setNoteTarget(null)} />
    </div>
  );
}
