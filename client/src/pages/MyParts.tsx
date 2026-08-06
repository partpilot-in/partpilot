import { FormEvent, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Plus, Search, Star } from "lucide-react";
import { useProjects } from "../api/hooks/boms";
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
import { readManualParts, saveManualParts } from "../lib/myPartsStorage";
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

function createManualPartId(mpn: string) {
  const slug = mpn.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const suffix = "crypto" in window && "randomUUID" in window.crypto
    ? window.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `manual-${slug || "part"}-${suffix}`;
}

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

export function MyParts() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { showToast } = useToast();
  const { data: projects, loading, error } = useProjects();
  const projectRows = useProjectParts(projects);
  const { ids: importantIds, toggleImportant } = useImportantParts();
  const [manualRows, setManualRows] = useState<MyPartRow[]>(() => readManualParts());
  const [recentSearches, setRecentSearches] = useState<RecentSearchPart[]>(() => readRecentSearches());
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [addPartOpen, setAddPartOpen] = useState(false);
  const [manualForm, setManualForm] = useState<ManualPartForm>(emptyManualPartForm);

  useEffect(() => {
    setQuery(searchParams.get("q") ?? "");
  }, [searchParams]);

  const activeQuery = searchParams.get("q")?.trim() ?? "";
  const { data: searchRows, loading: searchLoading, error: searchError } = useSearchParts(activeQuery, {});
  const myRows: MyPartRow[] = useMemo(
    () => [
      ...manualRows,
      ...projectRows.map((row) => ({ ...row, source: "project" as const })),
    ],
    [manualRows, projectRows],
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

  function submitManualPart(event: FormEvent) {
    event.preventDefault();
    const qty = Number(manualForm.qty);
    const unitPrice = Number(manualForm.unit_price || 0);

    const part: MyPartRow = {
      id: createManualPartId(manualForm.mpn),
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
      project_count: 0,
      project_names: "Manual entry",
      total_qty: Number.isFinite(qty) ? Math.max(1, qty) : 1,
      source: "manual",
    };

    const next = [part, ...manualRows];
    setManualRows(next);
    saveManualParts(next);
    setManualForm(emptyManualPartForm);
    setAddPartOpen(false);
    showToast({ title: "Part added", body: part.mpn, tone: "success" });
  }

  return (
    <div className="stack">
      <section className="page-header">
        <div>
          <h1 className="page-title">My Parts</h1>
          <p className="page-subtitle">Manage existing parts and search for new parts to procure.</p>
        </div>
        <button type="button" className="button button--primary" onClick={() => setAddPartOpen(true)}>
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

      {loading ? (
        <Spinner message="Loading parts..." />
      ) : error ? (
        <ErrorMessage message={error} />
      ) : (
        <DataTable
          columns={myPartsColumns}
          rows={myRows}
          getRowId={(row) => row.id}
          onRowClick={(row) => {
            if (!row.id.startsWith("manual-")) navigate(`/parts/${row.id}`);
          }}
          emptyState={<EmptyState title="No parts yet" body="Upload a BOM or add a part manually to start building your inventory." />}
        />
      )}

      <Modal open={addPartOpen} title="Add Part" onClose={() => setAddPartOpen(false)}>
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
            <button type="button" className="button" onClick={() => setAddPartOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="button button--primary">
              Add Part
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
