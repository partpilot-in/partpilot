import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Download,
  FileSpreadsheet,
  MoreVertical,
  Plus,
  Search,
  Star,
  Trash2,
} from "lucide-react";
import { useProjects } from "../api/hooks/boms";
import {
  useMyParts,
  useMyPartsMutations,
  type MyPartInput,
} from "../api/hooks/myParts";
import {
  useProjectParts,
  useSearchParts,
  type ProjectPartRow,
} from "../api/hooks/parts";
import {
  complianceFromCharacteristics,
  countryOfOriginFromCharacteristics,
  lifecycleFromCharacteristics,
  referencePriceFromCharacteristics,
  withCharacteristicSummary,
} from "../api/componentMetadata";
import type { Part } from "../api/types";
import {
  ComplianceBadge,
  DataTable,
  EmptyState,
  ErrorMessage,
  FilterChip,
  LifecycleBadge,
  Modal,
  PartNoteButton,
  PartNoteModal,
  ScoreRing,
  Spinner,
  useToast,
  type Column,
  type NoteTarget,
} from "../components/ui";
import { useImportantParts } from "../lib/useImportantParts";
import {
  exportTableCsv,
  exportTableXlsx,
  type ExportCell,
} from "../lib/exportTable";
import { partLookupPath } from "../lib/partRoutes";

const recentSearchesStorageKey = "partpilot.recentPartSearches";
const maxRecentSearches = 8;
const exportHeaders = [
  "MPN",
  "Manufacturer",
  "Category",
  "Description",
  "Projects",
  "Project Count",
  "Total Qty",
  "Unit Price",
  "Country of Origin",
  "Lifecycle",
  "PartPilot Score",
  "Source",
  "Important",
];

interface ManualPartForm {
  mpn: string;
  manufacturer: string;
  category: string;
  description: string;
  qty: string;
  unit_price: string;
  country_of_origin: string;
}

interface MyPartRow extends ProjectPartRow {
  source: "project" | "manual";
}

interface RecentSearchPart {
  id?: string;
  mpn: string;
  manufacturer: string;
}

const emptyManualPartForm: ManualPartForm = {
  mpn: "",
  manufacturer: "",
  category: "",
  description: "",
  qty: "1",
  unit_price: "",
  country_of_origin: "",
};

function readRecentSearches(): RecentSearchPart[] {
  try {
    const raw = window.localStorage.getItem(recentSearchesStorageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter(
          (item): item is RecentSearchPart =>
            item &&
            typeof item === "object" &&
            (item.id === undefined || typeof item.id === "string") &&
            typeof item.mpn === "string" &&
            typeof item.manufacturer === "string",
        )
      : [];
  } catch {
    return [];
  }
}

function saveRecentSearches(searches: RecentSearchPart[]) {
  window.localStorage.setItem(
    recentSearchesStorageKey,
    JSON.stringify(searches),
  );
}

function errorMessage(error: unknown) {
  if (error && typeof error === "object" && "response" in error) {
    const response = (error as { response?: { data?: { error?: unknown } } })
      .response;
    if (typeof response?.data?.error === "string") return response.data.error;
  }
  return error instanceof Error ? error.message : "Please try again.";
}

function descriptionWithoutDesignator(description: string) {
  const separator = " — ";
  const separatorIndex = description.indexOf(separator);
  return separatorIndex > 0
    ? description.slice(separatorIndex + separator.length)
    : description;
}

export function MyParts() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { showToast } = useToast();
  const {
    data: projects,
    loading: projectsLoading,
    error: projectsError,
  } = useProjects();
  const {
    data: storedParts,
    loading: partsLoading,
    error: partsError,
    refetch: refetchParts,
  } = useMyParts();
  const { createMyPart, updateMyPart, deleteMyPart } = useMyPartsMutations();
  const projectRows = useProjectParts(projects);
  const { ids: importantIds, toggleImportant } = useImportantParts();
  const [recentSearches, setRecentSearches] = useState<RecentSearchPart[]>(() =>
    readRecentSearches(),
  );
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [addPartOpen, setAddPartOpen] = useState(false);
  const [editingPart, setEditingPart] = useState<MyPartRow | null>(null);
  const [savingPart, setSavingPart] = useState(false);
  const [manualForm, setManualForm] =
    useState<ManualPartForm>(emptyManualPartForm);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [noteTarget, setNoteTarget] = useState<NoteTarget | null>(null);
  const actionsMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQuery(searchParams.get("q") ?? "");
  }, [searchParams]);

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

  const activeQuery = searchParams.get("q")?.trim() ?? "";
  const {
    data: searchRows,
    loading: searchLoading,
    error: searchError,
  } = useSearchParts(activeQuery, {});
  const myRows: MyPartRow[] = useMemo(
    () => [
      ...(storedParts ?? []),
      ...projectRows.map((row) => ({ ...row, source: "project" as const })),
    ],
    [storedParts, projectRows],
  );
  const myPartKeys = useMemo(() => {
    const ids = new Set<string>();
    const mpns = new Set<string>();
    myRows.forEach((row) => {
      ids.add(row.id);
      mpns.add(row.mpn.trim().toLowerCase());
    });
    return { ids, mpns };
  }, [myRows]);

  const myPartsColumns: Column<MyPartRow>[] = [
    {
      key: "important",
      header: "",
      render: (row) => {
        const important = importantIds.has(row.id);
        return (
          <button
            type="button"
            className={["star-button", important && "star-button--active"]
              .filter(Boolean)
              .join(" ")}
            aria-label={
              important
                ? `Unmark ${row.mpn} as important`
                : `Mark ${row.mpn} as important`
            }
            onClick={(event) => {
              event.stopPropagation();
              const nextImportant = toggleImportant(row);
              showToast({
                title: nextImportant
                  ? "Marked important"
                  : "Removed important mark",
                body: row.mpn,
                tone: "success",
              });
            }}
          >
            <Star size={16} fill={important ? "currentColor" : "none"} />
          </button>
        );
      },
    },
    { key: "mpn", header: "MPN", sortable: true },
    { key: "manufacturer", header: "Manufacturer", sortable: true },
    {
      key: "country_of_origin",
      header: "Made In",
      sortable: true,
      sortValue: (row) =>
        countryOfOriginFromCharacteristics(row.component_metadata),
      render: (row) =>
        countryOfOriginFromCharacteristics(row.component_metadata),
    },
    { key: "category", header: "Category", sortable: true },
    {
      key: "description",
      header: "Description",
      sortable: true,
      render: (row) => descriptionWithoutDesignator(row.description),
    },
    { key: "project_names", header: "Projects", sortable: true },
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
          part={{ id: row.id, label: row.mpn }}
          onOpen={setNoteTarget}
        />
      ),
    },
  ];

  useEffect(() => {
    setRecentSearches((current) => {
      const next = current.filter(
        (part) =>
          (!part.id || !myPartKeys.ids.has(part.id)) &&
          !myPartKeys.mpns.has(part.mpn.trim().toLowerCase()),
      );
      if (next.length === current.length) return current;
      saveRecentSearches(next);
      return next;
    });
  }, [myPartKeys]);

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    runSearch(query);
  }

  function runSearch(value: string) {
    const trimmed = value.trim();
    const next = new URLSearchParams();
    if (trimmed) next.set("q", trimmed);
    setSearchParams(next);
    setQuery(trimmed);
  }

  function selectSearchResult(part: Part) {
    const inMyParts =
      myPartKeys.ids.has(part.id) ||
      myPartKeys.mpns.has(part.mpn.trim().toLowerCase());
    if (!inMyParts) {
      setRecentSearches((current) => {
        const next = [
          { id: part.id, mpn: part.mpn, manufacturer: part.manufacturer },
          ...current.filter(
            (item) =>
              item.id !== part.id &&
              item.mpn.toLowerCase() !== part.mpn.toLowerCase(),
          ),
        ].slice(0, maxRecentSearches);
        saveRecentSearches(next);
        return next;
      });
    }
    navigate(partLookupPath(part));
  }

  function updateManualForm<K extends keyof ManualPartForm>(
    key: K,
    value: ManualPartForm[K],
  ) {
    setManualForm((current) => ({ ...current, [key]: value }));
  }

  function openAddPart() {
    setEditingPart(null);
    setManualForm(emptyManualPartForm);
    setAddPartOpen(true);
  }

  function openEditPart(row: MyPartRow) {
    setEditingPart(row);
    setManualForm({
      mpn: row.mpn,
      manufacturer: row.manufacturer,
      category: row.category,
      description: row.description,
      qty: String(row.total_qty),
      unit_price: String(
        referencePriceFromCharacteristics(row.component_metadata),
      ),
      country_of_origin: countryOfOriginFromCharacteristics(
        row.component_metadata,
      ),
    });
    setAddPartOpen(true);
  }

  async function removeEditingPart() {
    if (
      !editingPart ||
      !window.confirm(`Remove ${editingPart.mpn} from My Parts?`)
    )
      return;
    setSavingPart(true);
    try {
      await deleteMyPart(editingPart.id);
      refetchParts();
      setAddPartOpen(false);
      setEditingPart(null);
      showToast({
        title: "Part removed",
        body: editingPart.mpn,
        tone: "success",
      });
    } catch (deleteError) {
      showToast({
        title: "Could not remove part",
        body: errorMessage(deleteError),
      });
    } finally {
      setSavingPart(false);
    }
  }

  function exportRows() {
    return myRows.map<ExportCell[]>((row) => [
      row.mpn,
      row.manufacturer,
      row.category,
      row.description,
      row.project_names,
      row.project_count,
      row.total_qty,
      referencePriceFromCharacteristics(row.component_metadata),
      countryOfOriginFromCharacteristics(row.component_metadata),
      lifecycleFromCharacteristics(row.component_metadata).replace(/_/g, " "),
      row.score,
      row.source === "manual" ? "Manual" : "Project",
      importantIds.has(row.id) ? "Yes" : "No",
    ]);
  }

  function exportParts(format: "csv" | "xlsx") {
    if (!myRows.length) {
      showToast({
        title: "No parts to export",
        body: "Add a part or upload a BOM first.",
      });
      return;
    }

    const filename = `my-parts-${new Date().toISOString().slice(0, 10)}`;
    const rows = exportRows();
    if (format === "csv") exportTableCsv(filename, exportHeaders, rows);
    else exportTableXlsx(filename, "My Parts", exportHeaders, rows);

    setActionsOpen(false);
    showToast({
      title: `${format.toUpperCase()} exported`,
      body: `${myRows.length} ${myRows.length === 1 ? "part" : "parts"} downloaded.`,
      tone: "success",
    });
  }

  async function submitManualPart(event: FormEvent) {
    event.preventDefault();
    const qty = Number(manualForm.qty);
    const unitPrice = Number(manualForm.unit_price || 0);

    const input: MyPartInput = {
      mpn: manualForm.mpn.trim(),
      manufacturer: manualForm.manufacturer.trim(),
      category: manualForm.category.trim() || "Uncategorized",
      description: manualForm.description.trim() || "Manually added part",
      score: 80,
      component_metadata: withCharacteristicSummary(
        editingPart?.component_metadata ?? {},
        {
          countryOfOrigin: manualForm.country_of_origin.trim() || "Unknown",
          lifecycleStatus: "Active",
          unitPrice: Number.isFinite(unitPrice) ? Math.max(0, unitPrice) : 0,
        },
      ),
      total_qty: Number.isFinite(qty) ? Math.max(1, qty) : 1,
    };
    setSavingPart(true);
    try {
      const part = editingPart
        ? await updateMyPart(editingPart.id, input)
        : await createMyPart(input);
      refetchParts();
      setManualForm(emptyManualPartForm);
      setEditingPart(null);
      setAddPartOpen(false);
      showToast({
        title: editingPart ? "Part updated" : "Part added",
        body: part.mpn,
        tone: "success",
      });
    } catch (saveError) {
      showToast({
        title: "Could not save part",
        body: errorMessage(saveError),
      });
    } finally {
      setSavingPart(false);
    }
  }

  return (
    <div className="stack">
      <section className="page-header detail-page-header">
        <div className="detail-page-heading">
          <h1 className="page-title">My Parts</h1>
          <p className="page-subtitle">
            Manage existing parts and search for new parts to procure.
          </p>
        </div>
        <div className="account-menu detail-actions-menu" ref={actionsMenuRef}>
          <button
            type="button"
            className="button detail-actions-button"
            aria-label="My Parts actions"
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
                  openAddPart();
                }}
              >
                <Plus size={18} />
                <span>Add Part</span>
              </button>
              <button
                type="button"
                className="account-menu__item"
                role="menuitem"
                onClick={() => exportParts("csv")}
              >
                <Download size={18} />
                <span>Export CSV</span>
              </button>
              <button
                type="button"
                className="account-menu__item"
                role="menuitem"
                onClick={() => exportParts("xlsx")}
              >
                <FileSpreadsheet size={18} />
                <span>Export XLSX</span>
              </button>
            </div>
          )}
        </div>
      </section>

      <div className="part-search">
        <form className="large-search" role="search" onSubmit={submitSearch}>
          <Search size={20} aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search MPN or description..."
            aria-label="Search MPN or description"
          />
        </form>

        {activeQuery && (
          <div
            className="part-search__dropdown"
            role="listbox"
            aria-label="Search results"
          >
            {searchLoading ? (
              <div className="part-search__status">Searching parts...</div>
            ) : searchError ? (
              <div className="part-search__status part-search__status--error">
                {searchError}
              </div>
            ) : (searchRows ?? []).length === 0 ? (
              <div className="part-search__status">No results</div>
            ) : (
              (searchRows ?? []).map((part) => (
                <button
                  key={`${part.manufacturer}:${part.mpn}`}
                  type="button"
                  className="part-search__option"
                  role="option"
                  aria-selected="false"
                  onClick={() => selectSearchResult(part)}
                >
                  <span>
                    <strong>{part.mpn}</strong>
                    <span>{part.manufacturer}</span>
                  </span>
                  <span>{part.category}</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {recentSearches.length > 0 && (
        <div className="filter-strip" aria-label="Recently searched parts">
          {recentSearches.map((part) => (
            <FilterChip
              key={part.id ?? `${part.manufacturer}:${part.mpn}`}
              label={`${part.mpn} - ${part.manufacturer}`}
              active={activeQuery.toLowerCase() === part.mpn.toLowerCase()}
              showActiveIcon={false}
              onToggle={() => navigate(partLookupPath(part))}
            />
          ))}
        </div>
      )}

      {projectsLoading || partsLoading ? (
        <Spinner message="Loading parts..." />
      ) : projectsError || partsError ? (
        <ErrorMessage
          message={projectsError ?? partsError ?? "Could not load parts"}
        />
      ) : (
        <div className="my-parts-table">
          <DataTable
            columns={myPartsColumns}
            rows={myRows}
            getRowId={(row) => row.id}
            onRowClick={(row) => {
              if (row.source === "manual") openEditPart(row);
              else navigate(`/parts/${row.id}`);
            }}
            emptyState={
              <EmptyState
                title="No parts yet"
                body="Upload a BOM or add a part manually to start building your inventory."
              />
            }
          />
        </div>
      )}

      <PartNoteModal part={noteTarget} onClose={() => setNoteTarget(null)} />

      <Modal
        open={addPartOpen}
        title={editingPart ? "Edit Part" : "Add Part"}
        onClose={() => {
          setAddPartOpen(false);
          setEditingPart(null);
        }}
      >
        <form className="part-form" onSubmit={submitManualPart}>
          <label className="field-label">
            MPN
            <input
              className="form-control"
              value={manualForm.mpn}
              onChange={(event) => updateManualForm("mpn", event.target.value)}
              required
            />
          </label>
          <label className="field-label">
            Manufacturer
            <input
              className="form-control"
              value={manualForm.manufacturer}
              onChange={(event) =>
                updateManualForm("manufacturer", event.target.value)
              }
              required
            />
          </label>
          <label className="field-label">
            Category
            <input
              className="form-control"
              value={manualForm.category}
              onChange={(event) =>
                updateManualForm("category", event.target.value)
              }
            />
          </label>
          <label className="field-label part-form__wide">
            Description
            <textarea
              className="form-control form-control--textarea"
              value={manualForm.description}
              onChange={(event) =>
                updateManualForm("description", event.target.value)
              }
            />
          </label>
          <label className="field-label">
            Quantity
            <input
              className="form-control"
              type="number"
              min="1"
              step="1"
              value={manualForm.qty}
              onChange={(event) => updateManualForm("qty", event.target.value)}
            />
          </label>
          <label className="field-label">
            Unit Price
            <input
              className="form-control"
              type="number"
              min="0"
              step="0.01"
              value={manualForm.unit_price}
              onChange={(event) =>
                updateManualForm("unit_price", event.target.value)
              }
            />
          </label>
          <label className="field-label">
            Country of Origin
            <input
              className="form-control"
              value={manualForm.country_of_origin}
              onChange={(event) =>
                updateManualForm("country_of_origin", event.target.value)
              }
            />
          </label>
          <div className="part-form__actions">
            {editingPart && (
              <button
                type="button"
                className="button button--danger part-form__delete"
                onClick={removeEditingPart}
                disabled={savingPart}
              >
                <Trash2 size={16} />
                Delete
              </button>
            )}
            <button
              type="button"
              className="button"
              onClick={() => {
                setAddPartOpen(false);
                setEditingPart(null);
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="button button--primary"
              disabled={savingPart}
            >
              {savingPart
                ? "Saving..."
                : editingPart
                  ? "Save Changes"
                  : "Add Part"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
