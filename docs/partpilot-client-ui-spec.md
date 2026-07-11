# PartPilot client — UI implementation spec

## 1. Design direction

**Brief, restated precisely**: a data-dense engineering tool that should feel like Google's own product surfaces (Search, Chrome DevTools, Google Sheets) — restrained, whitespace-forward, one accent color, no decoration that isn't load-bearing — with YouTube's horizontal top-tab navigation pattern for switching between the app's three modes.

### Tokens

**Color** (name → hex → use)
- `surface` → `#FFFFFF` → page background
- `surface-alt` → `#F8F9FA` → app bar, table header row, hover states
- `border` → `#DADCE0` → hairline dividers, card borders, table row separators
- `text-primary` → `#202124` → headings, primary data values
- `text-secondary` → `#5F6368` → labels, metadata, table headers
- `accent` → `#1A73E8` → active tab underline, links, primary buttons, focus rings
- Semantic (lifecycle/risk, shared by `LifecycleBadge`, `ScoreRing`, and BOM row accents):
  - `signal-good` → `#1E8E3E` (Active / Low risk)
  - `signal-caution` → `#F9AB00` (NRND / Medium)
  - `signal-warn` → `#E8710A` (Last Time Buy / High)
  - `signal-critical` → `#D93025` (Obsolete / Critical)

**Type**
- UI/body: **Roboto** (400/500) — sentence case throughout, no all-caps except single-letter column abbreviations if truly needed.
- Numeric/tabular data (Qty, Price, Score, Serial No columns): **Roboto Mono**, tabular figures — this is the one deliberate typographic choice that signals "engineering tool" rather than generic SaaS, and it makes sorted numeric columns actually easier to scan.
- Scale: 13px (table body / secondary), 14px (body/buttons), 16px (card titles), 20px (page titles). Line height 1.5 for body, 1.2 for numerics in tables.

**Layout**
- 8px base spacing unit. Cards: 8px corner radius, 1px `border`, no shadow at rest (Google's own surfaces mostly use hairlines, not elevation, in dense data views) — reserve a subtle `0 1px 2px rgba(0,0,0,.1)` shadow only for floating/overlay elements (the compare action bar, modals, toasts).
- Content max-width 1280px, centered, 24px side gutters.
- Top app bar: 56px, fixed. Tab bar: 48px, sticky directly below the app bar.

**Signature element**
- `ScoreRing`: a circular progress ring (SVG stroke-dasharray, ~32–48px) showing the PartPilot Score (0–100) with the semantic color at the current band, number centered inside. This is deliberately styled like Chrome DevTools' Lighthouse score circles — it's the one recognizable, memorable visual, used consistently everywhere a part's score appears (search results, BOM rows, part detail, dashboard cards). Everything else stays quiet so this stays the thing people remember.

### Wireframe (shell)

```
┌─────────────────────────────────────────────────────────────┐
│ [PartPilot]        [ 🔍 Search parts, projects...       ]  ⚙ 👤│  ← app bar, 56px
├─────────────────────────────────────────────────────────────┤
│  Dashboard    Part Search    Projects / BOM                  │  ← tab bar, 48px,
│  ▔▔▔▔▔▔▔▔                                                     │    underline indicator
├─────────────────────────────────────────────────────────────┤
│                                                               │
│                     page content, 1280px max                 │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Reusable component library (`client/src/components/ui/`)

Build these first, independent of any page — every page below is composed from this set only.

```ts
// TopAppBar.tsx
interface TopAppBarProps {
  onSearch: (query: string) => void;
  user: { name: string; avatarUrl?: string } | null;
}

// TabNav.tsx — the YouTube-style top tabs
interface Tab { key: string; label: string; to: string }
interface TabNavProps { tabs: Tab[]; activeKey: string }

// DataTable.tsx — the single generic table used by Part Search results AND
// BOM line tables. This is the most important reuse point in the app.
interface Column<T> {
  key: keyof T | string;
  header: string;
  sortable?: boolean;
  align?: 'left' | 'right';
  numeric?: boolean;               // renders with Roboto Mono, right-aligned by default
  render?: (row: T) => React.ReactNode;
}
interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  getRowId: (row: T) => string;
  sort?: { key: string; direction: 'asc' | 'desc' };
  onSortChange?: (key: string, direction: 'asc' | 'desc') => void;
  selectable?: boolean;
  selectedIds?: Set<string>;
  onSelectionChange?: (ids: Set<string>) => void;
  onRowClick?: (row: T) => void;
  emptyState?: React.ReactNode;
  loading?: boolean;               // renders skeleton rows
}

// ScoreRing.tsx — the signature element
interface ScoreRingProps { value: number; size?: 'sm' | 'md' | 'lg'; showLabel?: boolean }

// LifecycleBadge.tsx
type LifecycleStage = 'active' | 'nrnd' | 'last_time_buy' | 'obsolete' | 'unknown';
interface LifecycleBadgeProps { stage: LifecycleStage }

// ComplianceBadge.tsx
interface ComplianceBadgeProps { statuses: { standard: string; status: 'pass' | 'fail' | 'unknown' }[] }

// Card.tsx
interface CardProps { title?: string; action?: React.ReactNode; children: React.ReactNode }

// FileDropzone.tsx
interface FileDropzoneProps {
  accept: string[];               // ['.csv', '.xlsx']
  onFileSelected: (file: File) => void;
  hint?: string;
}

// PropertyCompareTable.tsx — renders the union of PartParameters HashMap
// keys across N selected parts as rows, one column per part; this is the
// component the Part Search "Compare" flow and any future BOM-line
// side-by-side view both use.
interface CompareTablePart {
  id: string;
  label: string;                  // MPN — Manufacturer
  parameters: Record<string, string | number | boolean>;
}
interface PropertyCompareTableProps {
  parts: CompareTablePart[];
  highlightDifferences?: boolean; // default true — rows where values differ across parts get a subtle left border in `accent`
}

// EmptyState.tsx
interface EmptyStateProps { title: string; body: string; action?: React.ReactNode }

// Toast.tsx — exposed via a `useToast()` hook + context provider, not per-component props
// Modal.tsx — standard controlled open/onClose dialog, used for the BOM compare picker
// FilterChip.tsx — for category/manufacturer/lifecycle filters in Part Search
interface FilterChipProps { label: string; active: boolean; onToggle: () => void }
```

Rules for building these:
- No component reaches into `fetch` or Supabase directly — every data-bearing component takes data via props. All data fetching lives in `client/src/api/hooks/*` (section 5) and is composed at the page level.
- `DataTable` is the one table implementation in the app. Part Search results and every BOM line table both render through it with different `Column<T>[]` definitions — do not build a second bespoke table for BOM lines.
- Visible keyboard focus (`accent`-colored 2px outline) on every interactive element; `TabNav`, `FilterChip`, and `DataTable` header cells all need explicit `:focus-visible` styles since they're the most-used interactive surfaces.

---

## 3. Pages

### 3.1 Dashboard (`pages/Dashboard.tsx`)

```
┌───────────────────────────────────────────────────────────┐
│  Good afternoon                                            │
│  [ 🔍  Search any part or project...                    ]  │  ← prominent, Google-homepage-
├───────────────────────────────────────────────────────────┤     style entry point
│  ┌ Watchlist risk ┐  ┌ Recent projects ┐  ┌ Needs review ┐│
│  │ ● 2 Critical    │  │ Amp-v3   ● 82   │  │ 5 parts       ││
│  │ ● 4 High        │  │ Sensor…  ● 91   │  │ risk↑ since   ││
│  │ ● 11 Medium     │  │ ...             │  │ last sweep    ││
│  └────────────────┘  └────────────────┘  └───────────────┘│
├───────────────────────────────────────────────────────────┤
│  Parts needing attention                     [DataTable]   │
│  (top N watchlist parts by risk band, click → part detail) │
└───────────────────────────────────────────────────────────┘
```

- The search bar routes to Part Search with the query pre-filled (`?q=`), not a separate search implementation.
- "Parts needing attention" reuses `DataTable` with columns: MPN, Manufacturer, `LifecycleBadge`, `ScoreRing`.
- Card contents are the only page-specific data hooks: `useWatchlistSummary()`, `useRecentProjects()`.

### 3.2 Part Search (`pages/PartSearch.tsx`)

```
┌───────────────────────────────────────────────────────────┐
│ [ 🔍 MPN or description...        ]                        │
│ [Category ▾] [Manufacturer ▾] [Lifecycle ▾]  (FilterChips) │
├───────────────────────────────────────────────────────────┤
│ ☐  MPN          Manufacturer   Category   Lifecycle  Score │  ← DataTable,
│ ☐  LM317T       Texas Instr.   Regulator  ● Active    92   │    every column
│ ☑  LM317ABCD    OnSemi         Regulator  ● NRND       61   │    sortable
│ ☑  LM317T-ALT   STMicro        Regulator  ● Active     88   │
└───────────────────────────────────────────────────────────┘
        ⎣ floating bar, appears once ≥2 rows selected ⎦
        [ Compare (2) ]                              [ Clear ]
```

- Selecting rows via `DataTable`'s `selectable` mode surfaces a floating compare bar (fixed bottom, `surface` background, subtle shadow — the one place elevation is used, since it's an overlay).
- "Compare (n)" opens `PropertyCompareTable` in a full-page view or modal — rows are the union of every selected part's `PartParameters` keys, one column per part, `highlightDifferences` on so mismatched values are visually flagged at a glance (the actual point of the compare feature).
- Filter chips are client-side state that map to query params on `useSearchParts(query, filters)`.

### 3.3 Projects / BOM (`pages/Projects.tsx`, `pages/ProjectDetail.tsx`)

**Projects list**: card grid, one card per uploaded BOM — name, part count, uploaded date, an aggregate `ScoreRing` (lowest score in the BOM, since that's the part most likely to bite), and a "Compare" affordance (select two project cards → enabled "Compare selected" button, same floating-bar pattern as Part Search for consistency).

**Project detail** (the BOM table itself):

```
┌───────────────────────────────────────────────────────────────────┐
│  Amp-v3 BOM                                    [ Upload new BOM ]   │
├───────────────────────────────────────────────────────────────────┤
│ #  Description   Manufacturer  Made In  Category   Qty  Price  ✓  Lifecycle  Score │
│ 1  10k resistor  Yageo         TW       Resistor    12  $0.01  ✔  ● Active    97    │
│ 2  LM317T reg    TI            US       Regulator    4  $0.42  ✔  ● NRND      58    │
│ 3  ...                                                                              │
└───────────────────────────────────────────────────────────────────────────────────┘
```

Column → `Column<BomLine>` mapping (every column `sortable: true` except the compliance check icon, which sorts by pass/fail/unknown):

| BOM column | key | render |
|---|---|---|
| Serial No | `line_no` | numeric, Roboto Mono |
| Description | `description` | plain text |
| Manufacturer | `manufacturer` | plain text |
| Made In | `country_of_origin` | plain text or flag+code |
| Category | `category` | plain text |
| Qty | `qty` | numeric |
| Price | `unit_price` | numeric, currency formatted |
| Compliance | `compliance` | `ComplianceBadge` |
| Lifecycle | `lifecycle_stage` | `LifecycleBadge` |
| PartPilot Score | `score` | `ScoreRing size="sm"` |

- **Upload BOM**: `FileDropzone` accepting `.csv`/`.xlsx`, posts to `/v1/boms`, shows a progress toast, then navigates to the new project's detail view.
- **Compare BOM**: picking two BOMs (from the projects list or a `Modal`-based picker inside a project) opens a diff view — reuse `DataTable` again with an added leading `Δ` column (`added` / `removed` / `changed`), row background tinted with `signal-*` tokens at low opacity for changed-for-worse vs. changed-for-better lifecycle/score deltas.

---

## 4. Routing & navigation

```
/                     → redirect to /dashboard
/dashboard            → Dashboard
/search                → PartSearch (?q=, ?category=, ?manufacturer=, ?lifecycle=)
/search/compare        → PropertyCompareTable full view (?ids=a,b,c)
/projects              → Projects (list)
/projects/:id          → ProjectDetail (BOM table)
/projects/compare       → BOM diff view (?a=id&b=id)
```

`TabNav`'s three tabs map to `/dashboard`, `/search`, `/projects` — the router's active path segment (not literal string match) determines the active tab, so `/search/compare` still highlights "Part Search."

---

## 5. Backend integration

Everything below maps directly onto the server routes already defined in `partpilot-implementation-doc.md`. The point of this section is to make the swap from "UI built against mocked data" to "UI built against the real API" a one-file change: every page calls a hook in `client/src/api/hooks/`, never `fetch` directly.

```ts
// client/src/api/hooks/parts.ts
export function useSearchParts(query: string, filters: PartFilters) { /* GET /v1/parts/search */ }
export function usePart(id: string)                                 { /* GET /v1/parts/:id */ }
export function usePartAlternates(id: string)                       { /* GET /v1/parts/:id/alternates */ }
export function useComparePartsProperties(ids: string[])            { /* GET /v1/parts/compare?ids= — NEW, see below */ }

// client/src/api/hooks/boms.ts
export function useProjects()                                       { /* GET /v1/boms */ }
export function useProject(id: string)                              { /* GET /v1/boms/:id */ }
export function useUploadBom()                                      { /* POST /v1/boms */ }
export function useCompareBoms(a: string, b: string)                { /* GET /v1/boms/:id/compare?with= — NEW, see below */ }

// client/src/api/hooks/watchlist.ts
export function useWatchlist()          { /* GET /v1/watchlist */ }
export function useWatchlistSummary()    { /* derived client-side from useWatchlist(), or a future dedicated endpoint */ }
export function useAddToWatchlist()      { /* POST /v1/watchlist */ }
export function useRemoveFromWatchlist() { /* DELETE /v1/watchlist/:part_id */ }
```

During UI-first development, back each hook with an MSW (Mock Service Worker) handler matching the same response shape the real route will return — flip a single `USE_MOCKS` env flag to point React Query at MSW vs. the live `VITE_API_BASE_URL`. This is what makes "integrate the backend later" actually a later step rather than a rewrite.

### New backend surface this UI needs (not yet in the server doc — add when implementing)

1. **`GET /v1/parts/compare?ids=a,b,c`** → returns each part plus its full `PartParameters` map, so `PropertyCompareTable` can union the keys client-side. Backed by `PartRepository` gaining a `find_many(&[PartId])` method — a thin addition, no new port needed beyond that.
2. **`GET /v1/boms/:id/compare?with=:otherId`** → returns a line-by-line diff (matched by MPN where possible, falling back to description similarity for unmatched lines) with `added` / `removed` / `changed` markers and the specific fields that changed (price, lifecycle stage, score). This is server-side logic, not client-side, since it needs the same reconciled lifecycle data the rest of the engine already computes.
3. **Schema additions** to support the BOM columns as specified:
   - `parts.country_of_origin text`
   - a `part_compliance` table: `(part_id uuid references parts(id), standard text, status text check (status in ('pass','fail','unknown')), primary key (part_id, standard))` — RoHS/REACH/conflict-minerals as rows, not fixed columns, so adding a new compliance standard later doesn't need a migration.
   - `bom_lines.qty integer`, `bom_lines.unit_price numeric(12,4)` — both currently missing from the schema in the implementation doc and needed for the Qty/Price columns.
4. **PartPilot Score** is not a new stored field — derive it in the API response as `round((1.0 - risk.value) * 100)`, reusing the existing `RiskScore` the engine already computes, just inverted and rescaled to a 0–100 "higher is better" number for display (matching the `ScoreRing`'s convention).

---

## 6. Build order

1. Design tokens as CSS variables + Tailwind config (or plain CSS custom properties) — colors, type scale, spacing.
2. `ui/` primitives: `Card`, `Badge` variants, `Button`, `TopAppBar`, `TabNav` — no data yet.
3. `DataTable` in isolation with static fixture data — get sorting, selection, and the skeleton/empty states right before wiring any API.
4. `ScoreRing`, `LifecycleBadge`, `ComplianceBadge` — the domain-specific visual vocabulary, still fixture-driven.
5. Part Search page against MSW-mocked `/v1/parts/search`, then `PropertyCompareTable`.
6. Projects/BOM pages against MSW-mocked BOM endpoints, including `FileDropzone` upload flow.
7. Swap `USE_MOCKS` off, point at the real `partpilot-server` once the routes in section 5 exist.
