import { FormEvent, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Pencil, Plus, Search, Star, Trash2 } from "lucide-react";
import { useProjects } from "../api/hooks/boms";
import { useMyParts, useMyPartsMutations, type MyPartInput } from "../api/hooks/myParts";
import { useProjectParts, useSearchParts, type ProjectPartRow } from "../api/hooks/parts";
import type { Part } from "../api/types";
import {
  DataTable,
  EmptyState,
  ErrorMessage,
  FilterChip,
  LifecycleBadge,
  Modal,
  ScoreRing,
  Spinner,
  useToast,
  type Column,
} from "../components/ui";
import { useImportantParts } from "../lib/useImportantParts";

const recentSearchesStorageKey = "partpilot.recentPartSearches";
const maxRecentSearches = 8;

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
  id: string;
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
          typeof item.id === "string" &&
          typeof item.mpn === "string" &&
          typeof item.manufacturer === "string",
      )
      : [];
  } catch {
    return [];
  }
}

function saveRecentSearches(searches: RecentSearchPart[]) {
  window.localStorage.setItem(recentSearchesStorageKey, JSON.stringify(searches));
}

function errorMessage(error: unknown) {
  if (error && typeof error === "object" && "response" in error) {
    const response = (error as { response?: { data?: { error?: unknown } } }).response;
    if (typeof response?.data?.error === "string") return response.data.error;
  }
  return error instanceof Error ? error.message : "Please try again.";
}

export function MyParts() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { showToast } = useToast();
  const { data: projects, loading: projectsLoading, error: projectsError } = useProjects();
  const { data: storedParts, loading: partsLoading, error: partsError, refetch: refetchParts } = useMyParts();
  const { createMyPart, updateMyPart, deleteMyPart } = useMyPartsMutations();
  const projectRows = useProjectParts(projects);
  const { ids: importantIds, toggleImportant } = useImportantParts();
  const [recentSearches, setRecentSearches] = useState<RecentSearchPart[]>(() => readRecentSearches());
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [addPartOpen, setAddPartOpen] = useState(false);
  const [editingPart, setEditingPart] = useState<MyPartRow | null>(null);
  const [savingPart, setSavingPart] = useState(false);
  const [manualForm, setManualForm] = useState<ManualPartForm>(emptyManualPartForm);

  useEffect(() => {
    setQuery(searchParams.get("q") ?? "");
  }, [searchParams]);

  const activeQuery = searchParams.get("q")?.trim() ?? "";
  const { data: searchRows, loading: searchLoading, error: searchError } = useSearchParts(activeQuery, {});
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
      header: "Important",
      render: (row) => {
        const important = importantIds.has(row.id);
        return (
          <button
            type="button"
            className={["star-button", important && "star-button--active"].filter(Boolean).join(" ")}
            aria-label={important ? `Unmark ${row.mpn} as important` : `Mark ${row.mpn} as important`}
            onClick={(event) => {
              event.stopPropagation();
              const nextImportant = toggleImportant(row);
              showToast({
                title: nextImportant ? "Marked important" : "Removed important mark",
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
    {
      key: "actions",
      header: "Actions",
      render: (row) => row.source === "manual" ? (
        <div className="inline-stack">
          <button
            type="button"
            className="icon-button"
            aria-label={`Edit ${row.mpn}`}
            onClick={(event) => {
              event.stopPropagation();
              setEditingPart(row);
              setManualForm({
                mpn: row.mpn,
                manufacturer: row.manufacturer,
                category: row.category,
                description: row.description,
                qty: String(row.total_qty),
                unit_price: String(row.unit_price),
                country_of_origin: row.country_of_origin,
              });
              setAddPartOpen(true);
            }}
          >
            <Pencil size={16} />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label={`Delete ${row.mpn}`}
            onClick={async (event) => {
              event.stopPropagation();
              if (!window.confirm(`Remove ${row.mpn} from My Parts?`)) return;
              try {
                await deleteMyPart(row.id);
                refetchParts();
                showToast({ title: "Part removed", body: row.mpn, tone: "success" });
              } catch (deleteError) {
                showToast({ title: "Could not remove part", body: errorMessage(deleteError) });
              }
            }}
          >
            <Trash2 size={16} />
          </button>
        </div>
      ) : null,
    },
  ];

  useEffect(() => {
    setRecentSearches((current) => {
      const next = current.filter(
        (part) => !myPartKeys.ids.has(part.id) && !myPartKeys.mpns.has(part.mpn.trim().toLowerCase()),
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
    const inMyParts = myPartKeys.ids.has(part.id) || myPartKeys.mpns.has(part.mpn.trim().toLowerCase());
    if (!inMyParts) {
      setRecentSearches((current) => {
        const next = [
          { id: part.id, mpn: part.mpn, manufacturer: part.manufacturer },
          ...current.filter((item) => item.id !== part.id && item.mpn.toLowerCase() !== part.mpn.toLowerCase()),
        ].slice(0, maxRecentSearches);
        saveRecentSearches(next);
        return next;
      });
    }
    navigate(`/parts/${part.id}`);
  }

  function updateManualForm<K extends keyof ManualPartForm>(key: K, value: ManualPartForm[K]) {
    setManualForm((current) => ({ ...current, [key]: value }));
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
      lifecycle_stage: "active",
      score: 80,
      country_of_origin: manualForm.country_of_origin.trim() || "Unknown",
      unit_price: Number.isFinite(unitPrice) ? Math.max(0, unitPrice) : 0,
      compliance: [{ standard: "Manual review", status: "unknown" }],
      parameters: {},
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
      showToast({ title: editingPart ? "Part updated" : "Part added", body: part.mpn, tone: "success" });
    } catch (saveError) {
      showToast({ title: "Could not save part", body: errorMessage(saveError) });
    } finally {
      setSavingPart(false);
    }
  }

  return (
    <div className="stack">
      <section className="page-header">
        <div>
          <h1 className="page-title">My Parts</h1>
          <p className="page-subtitle">Manage existing parts and search for new parts to procure.</p>
        </div>
        <button type="button" className="button button--primary" onClick={() => {
          setEditingPart(null);
          setManualForm(emptyManualPartForm);
          setAddPartOpen(true);
        }}>
          <Plus size={16} />
          Add Part
        </button>
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
          <div className="part-search__dropdown" role="listbox" aria-label="Search results">
            {searchLoading ? (
              <div className="part-search__status">Searching parts...</div>
            ) : searchError ? (
              <div className="part-search__status part-search__status--error">{searchError}</div>
            ) : (searchRows ?? []).length === 0 ? (
              <div className="part-search__status">No results</div>
            ) : (
              (searchRows ?? []).map((part) => (
                <button
                  key={part.id}
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
              key={part.id}
              label={`${part.mpn} - ${part.manufacturer}`}
              active={activeQuery.toLowerCase() === part.mpn.toLowerCase()}
              showActiveIcon={false}
              onToggle={() => navigate(`/parts/${part.id}`)}
            />
          ))}
        </div>
      )}

      {projectsLoading || partsLoading ? (
        <Spinner message="Loading parts..." />
      ) : projectsError || partsError ? (
        <ErrorMessage message={projectsError ?? partsError ?? "Could not load parts"} />
      ) : (
        <DataTable
          columns={myPartsColumns}
          rows={myRows}
          getRowId={(row) => row.id}
          onRowClick={(row) => {
            if (row.source === "project") navigate(`/parts/${row.id}`);
          }}
          emptyState={<EmptyState title="No parts yet" body="Upload a BOM or add a part manually to start building your inventory." />}
        />
      )}

      <Modal open={addPartOpen} title={editingPart ? "Edit Part" : "Add Part"} onClose={() => {
        setAddPartOpen(false);
        setEditingPart(null);
      }}>
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
              onChange={(event) => updateManualForm("manufacturer", event.target.value)}
              required
            />
          </label>
          <label className="field-label">
            Category
            <input
              className="form-control"
              value={manualForm.category}
              onChange={(event) => updateManualForm("category", event.target.value)}
            />
          </label>
          <label className="field-label part-form__wide">
            Description
            <textarea
              className="form-control form-control--textarea"
              value={manualForm.description}
              onChange={(event) => updateManualForm("description", event.target.value)}
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
              onChange={(event) => updateManualForm("unit_price", event.target.value)}
            />
          </label>
          <label className="field-label">
            Country of Origin
            <input
              className="form-control"
              value={manualForm.country_of_origin}
              onChange={(event) => updateManualForm("country_of_origin", event.target.value)}
            />
          </label>
          <div className="part-form__actions">
            <button type="button" className="button" onClick={() => {
              setAddPartOpen(false);
              setEditingPart(null);
            }}>
              Cancel
            </button>
            <button type="submit" className="button button--primary" disabled={savingPart}>
              {savingPart ? "Saving..." : editingPart ? "Save Changes" : "Add Part"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
