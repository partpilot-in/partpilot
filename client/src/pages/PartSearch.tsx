import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { GitCompareArrows, Search, X } from "lucide-react";
import { useSearchParts } from "../api/hooks/parts";
import type { LifecycleStage, Part, PartFilters } from "../api/types";
import {
  DataTable,
  EmptyState,
  FilterChip,
  LifecycleBadge,
  ScoreRing,
  type Column,
} from "../components/ui";

const categories = ["Regulator", "Resistor", "MCU", "Wireless MCU", "Amplifier"];
const manufacturers = [
  "Texas Instruments",
  "onsemi",
  "STMicroelectronics",
  "Yageo",
  "Vishay",
  "Microchip",
  "Nordic Semiconductor",
];
const lifecycleOptions: { value: LifecycleStage; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "nrnd", label: "NRND" },
  { value: "last_time_buy", label: "Last Time Buy" },
  { value: "obsolete", label: "Obsolete" },
];

function listFromParam(value: string | null) {
  return value ? value.split(",").filter(Boolean) : [];
}

export function PartSearch() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedIds, setSelectedIds] = useState(new Set<string>());
  const [query, setQuery] = useState(searchParams.get("q") ?? "");

  useEffect(() => {
    setQuery(searchParams.get("q") ?? "");
  }, [searchParams]);

  const filters: PartFilters = useMemo(
    () => ({
      category: listFromParam(searchParams.get("category")),
      manufacturer: listFromParam(searchParams.get("manufacturer")),
      lifecycle: listFromParam(searchParams.get("lifecycle")) as LifecycleStage[],
    }),
    [searchParams],
  );
  const rows = useSearchParts(query, filters);

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
      key: "score",
      header: "PartPilot Score",
      sortable: true,
      numeric: true,
      render: (row) => <ScoreRing value={row.score} size="sm" />,
    },
  ];

  function submit(event: FormEvent) {
    event.preventDefault();
    updateParam("q", query.trim());
  }

  function updateParam(key: string, value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next);
  }

  function toggleListParam(key: "category" | "manufacturer" | "lifecycle", value: string) {
    const current = new Set(listFromParam(searchParams.get(key)));
    if (current.has(value)) current.delete(value);
    else current.add(value);
    updateParam(key, Array.from(current).join(","));
  }

  const selectedCount = selectedIds.size;
  const compareUrl = `/search/compare?ids=${Array.from(selectedIds).join(",")}`;

  return (
    <div className="stack">
      <section className="page-header">
        <div>
          <h1 className="page-title">PartProcure</h1>
          <p className="page-subtitle">Search and compare lifecycle, sourcing, and compliance signals.</p>
        </div>
      </section>

      <form className="large-search" role="search" onSubmit={submit}>
        <Search size={20} aria-hidden="true" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="MPN or description..."
          aria-label="Search MPN or description"
        />
      </form>

      <div className="filter-strip" aria-label="Part search filters">
        {categories.map((category) => (
          <FilterChip
            key={category}
            label={category}
            active={filters.category?.includes(category) ?? false}
            onToggle={() => toggleListParam("category", category)}
          />
        ))}
        {manufacturers.map((manufacturer) => (
          <FilterChip
            key={manufacturer}
            label={manufacturer}
            active={filters.manufacturer?.includes(manufacturer) ?? false}
            onToggle={() => toggleListParam("manufacturer", manufacturer)}
          />
        ))}
        {lifecycleOptions.map((option) => (
          <FilterChip
            key={option.value}
            label={option.label}
            active={filters.lifecycle?.includes(option.value) ?? false}
            onToggle={() => toggleListParam("lifecycle", option.value)}
          />
        ))}
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        getRowId={(row) => row.id}
        selectable
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        onRowClick={(row) => navigate(`/parts/${row.id}`)}
        emptyState={<EmptyState title="No matching parts" body="Clear filters or try another manufacturer." />}
      />

      {selectedCount >= 2 && (
        <div className="floating-bar" role="region" aria-label="Compare selected parts">
          <span>{selectedCount} parts selected</span>
          <div className="inline-stack">
            <Link className="button button--primary" to={compareUrl}>
              <GitCompareArrows size={16} />
              Compare ({selectedCount})
            </Link>
            <button type="button" className="button" onClick={() => setSelectedIds(new Set())}>
              <X size={16} />
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
