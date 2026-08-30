import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import {
  Activity,
  BellRing,
  BookOpen,
  Box,
  Bug,
  ChevronDown,
  ChevronRight,
  ChevronsDown,
  ChevronsUp,
  CircuitBoard,
  ClipboardList,
  Cpu,
  FileText,
  GitBranch,
  Grid3x3,
  MoreVertical,
  Plus,
  Shapes,
  Star,
  type LucideIcon,
} from "lucide-react";
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
  PartNoteEditor,
  ScoreRing,
  Spinner,
  useToast,
  type Column,
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
  commercial: new Set([
    "priceBreaks",
    "distributors",
    "alternateSources",
    "obsolescenceRiskScore",
  ]),
};

const identificationSection = CDD_SECTION_DEFINITIONS.find(
  (section) => section.key === "identification",
);
const characteristicSections = CDD_SECTION_DEFINITIONS.filter(
  (section) =>
    section.key !== "identification" && section.key !== "documentation",
);

const documentationFields = [
  { key: "datasheetUrl", label: "Datasheet", icon: BookOpen },
  { key: "applicationNote", label: "Application Note", icon: ClipboardList },
  { key: "technicalNote", label: "Technical Note", icon: FileText },
  { key: "errata", label: "Errata", icon: Bug },
  { key: "pcn", label: "PCN", icon: BellRing },
] satisfies ResourceField[];

const edaModelFields = [
  { key: "bsdl", label: "BSDL", icon: GitBranch },
  { key: "ibis", label: "IBIS", icon: Activity },
  { key: "spice", label: "SPICE", icon: CircuitBoard },
  { key: "svd", label: "SVD", icon: Cpu },
  { key: "symbol", label: "Symbol", icon: Shapes },
  { key: "footprint", label: "Footprint", icon: Grid3x3 },
  { key: "threeDModel", label: "3D Model", icon: Box },
] satisfies ResourceField[];

const documentationAndEdaFields = [...documentationFields, ...edaModelFields];

interface ResourceField {
  key: string;
  label: string;
  icon: LucideIcon;
}

function resourceUris(value: unknown): string[] {
  if (typeof value === "string") {
    const uri = value.trim();
    return uri ? [uri] : [];
  }
  if (Array.isArray(value)) return value.flatMap(resourceUris);
  if (value && typeof value === "object") {
    const resource = value as Record<string, unknown>;
    return resourceUris(resource.url ?? resource.value);
  }
  return [];
}

function ResourceGrid({
  fields,
  metadata,
}: {
  fields: ResourceField[];
  metadata: Record<string, unknown>;
}) {
  return (
    <div className="resource-grid">
      {fields.flatMap(({ key, label, icon: Icon }) => {
        const uris = resourceUris(metadata[key]);
        const resources: Array<string | undefined> = uris.length
          ? uris
          : [undefined];
        return resources.map((uri, index) => {
          const numberedLabel =
            resources.length > 1 ? `${label} ${index + 1}` : label;
          const content = (
            <>
              <span className="resource-tile__icon">
                <Icon size={24} aria-hidden="true" />
              </span>
              <span className="resource-tile__label">{numberedLabel}</span>
            </>
          );

          return uri ? (
            <a
              className="resource-tile resource-tile--available"
              href={uri}
              key={`${key}-${uri}-${index}`}
              target="_blank"
              rel="noreferrer"
              title={`Open ${numberedLabel}`}
              aria-label={`Open ${numberedLabel}`}
            >
              {content}
            </a>
          ) : (
            <span
              className="resource-tile resource-tile--missing"
              key={key}
              title={`${label} unavailable`}
              aria-label={`${label} unavailable`}
            >
              {content}
            </span>
          );
        });
      })}
    </div>
  );
}

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
  const [expandedCharacteristicSections, setExpandedCharacteristicSections] =
    useState<Set<CddSectionKey> | null>(null);
  const actionsMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setExpandedCharacteristicSections(null);
  }, [part?.id]);

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
  const documentationMetadata = componentMetadata.documentation ?? {};
  const nestedEdaModels = documentationMetadata.edaModels;
  const edaModelsMetadata =
    nestedEdaModels &&
    typeof nestedEdaModels === "object" &&
    !Array.isArray(nestedEdaModels)
      ? (nestedEdaModels as Record<string, unknown>)
      : documentationMetadata;
  const documentationAndEdaMetadata = {
    ...documentationMetadata,
    ...edaModelsMetadata,
  };
  const characteristicSectionData = characteristicSections.map((section) => {
    const fields = fieldsForCddSection(section, designatorCategory)
      .filter((field) => !hiddenCharacteristicFields[section.key]?.has(field))
      .map((field) => ({
        field,
        value: cddValueAtPath(componentMetadata, section.key, field),
      }))
      .filter(({ value }) => formatCddValue(value) !== "—");
    return { section, fields };
  });
  const populatedCharacteristicSectionKeys = characteristicSectionData
    .filter(({ fields }) => fields.length > 0)
    .map(({ section }) => section.key);
  const defaultExpandedCharacteristicSections = new Set(
    populatedCharacteristicSectionKeys,
  );
  const visibleCharacteristicSections =
    expandedCharacteristicSections ?? defaultExpandedCharacteristicSections;
  const allCharacteristicSectionsExpanded =
    populatedCharacteristicSectionKeys.length > 0 &&
    populatedCharacteristicSectionKeys.every((sectionKey) =>
      visibleCharacteristicSections.has(sectionKey),
    );
  const overviewFields = identificationSection
    ? fieldsForCddSection(identificationSection, designatorCategory)
        .filter(
          (field) => !hiddenCharacteristicFields.identification?.has(field),
        )
        .map((field) => ({
          field,
          value: cddValueAtPath(componentMetadata, "identification", field),
        }))
        .filter(({ value }) => formatCddValue(value) !== "—")
    : [];

  return (
    <div className="stack">
      <div className="page-header detail-page-header">
        <div className="detail-page-heading">
          <h1 className="page-title">{part.mpn}</h1>
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
        <Card title="PartPilot score" className="part-score-card">
          <div className="part-score-summary">
            <ScoreRing value={part.score} size="xl" />
          </div>
        </Card>
        <Card title="Overview" className="overview-card">
          <dl className="overview-list">
            {overviewFields.map(({ field, value }) => (
              <div
                className={[
                  "overview-stat",
                  field === "description" && "overview-stat--wide",
                ]
                  .filter(Boolean)
                  .join(" ")}
                key={field}
              >
                <dt>{cddFieldLabel(field)}</dt>
                <dd>{formatCddValue(value)}</dd>
              </div>
            ))}
          </dl>
        </Card>
        <Card title="Documentation" className="documentation-card">
          <ResourceGrid
            fields={documentationAndEdaFields}
            metadata={documentationAndEdaMetadata}
          />
        </Card>
        <Card
          title="Characteristics"
          className="characteristics-card"
          action={
            <div className="characteristics-card__actions">
              {designatorCategory && (
                <span className="component-category-label">
                  {designatorCategory} ·{" "}
                  {DESIGNATOR_CATEGORY_LABELS[designatorCategory]}
                </span>
              )}
              <button
                type="button"
                className="characteristics-expand-toggle"
                onClick={() =>
                  setExpandedCharacteristicSections(
                    allCharacteristicSectionsExpanded
                      ? new Set<CddSectionKey>()
                      : new Set(populatedCharacteristicSectionKeys),
                  )
                }
              >
                {allCharacteristicSectionsExpanded ? (
                  <ChevronsUp size={16} aria-hidden="true" />
                ) : (
                  <ChevronsDown size={16} aria-hidden="true" />
                )}
                <span>
                  {allCharacteristicSectionsExpanded
                    ? "Collapse all"
                    : "Expand all"}
                </span>
              </button>
            </div>
          }
        >
          <div className="characteristics-sections">
            {characteristicSectionData.map(({ section, fields }) => {
              const expanded = visibleCharacteristicSections.has(section.key);
              const hasData = fields.length > 0;
              const panelId = `characteristics-${section.key}-panel`;
              return (
                <section
                  className={[
                    "characteristics-section",
                    !hasData && "characteristics-section--empty",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  key={section.key}
                >
                  <button
                    type="button"
                    className="characteristics-section__toggle"
                    aria-expanded={expanded}
                    aria-controls={panelId}
                    onClick={() =>
                      setExpandedCharacteristicSections((current) => {
                        const visible =
                          current ?? defaultExpandedCharacteristicSections;
                        return visible.size === 1 && visible.has(section.key)
                          ? new Set<CddSectionKey>()
                          : new Set<CddSectionKey>([section.key]);
                      })
                    }
                  >
                    {expanded ? (
                      <ChevronDown size={18} aria-hidden="true" />
                    ) : (
                      <ChevronRight size={18} aria-hidden="true" />
                    )}
                    <span className="characteristics-section__title">
                      {section.title}
                    </span>
                    {hasData ? (
                      <span className="characteristics-section__count">
                        {fields.length}
                      </span>
                    ) : (
                      <span className="characteristics-section__no-data">
                        No data (0)
                      </span>
                    )}
                  </button>
                  {expanded && (
                    <div
                      className="characteristics-section__panel"
                      id={panelId}
                    >
                      {hasData ? (
                        <dl className="characteristics-list">
                          {fields.map(({ field, value }) => (
                            <div className="characteristic-stat" key={field}>
                              <dt>{cddFieldLabel(field)}</dt>
                              <dd>{formatCddValue(value)}</dd>
                            </div>
                          ))}
                        </dl>
                      ) : (
                        <p className="characteristics-section__empty-message">
                          No populated characteristics in this section.
                        </p>
                      )}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        </Card>
        <Card title="Notes" className="part-note-card">
          <PartNoteEditor part={{ id: part.id, label: part.mpn }} />
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
    </div>
  );
}
