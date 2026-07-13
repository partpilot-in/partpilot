# PartPilot API — `partpilot-server`

Base URL: `https://api.bestpartpilot.com` (production) · `http://localhost:8080` (local dev)

All requests/responses are JSON. All timestamps are ISO 8601 UTC.

---

## 1. Authentication

Three tiers, matched to the route table in §3:

| Scheme | Header | Used for |
|---|---|---|
| None | — | Public read endpoints (parts, search) |
| Supabase session | `Authorization: Bearer <supabase_access_token>` | User-scoped endpoints (watchlist, BOMs) |
| API key | `X-API-Key: <key>` | KiCad plugin endpoint |

Supabase tokens are obtained client-side via the Supabase Auth SDK, not from this API. API keys are generated from the client's account settings page and map to a `user_id` server-side via the `api_keys` table.

Requests to an authenticated route with a missing/invalid credential return `401` (see §4).

---

## 2. Common conventions

**Pagination** (list endpoints): cursor-based.

```
GET /v1/parts/search?q=lm317&cursor=<opaque>&limit=25
```

Response envelope for paginated lists:

```json
{
  "data": [ /* items */ ],
  "next_cursor": "eyJpZCI6ICI4ZTQ..." ,
  "has_more": true
}
```

`limit` defaults to 25, max 100.

**Non-paginated responses** return the resource directly (no envelope).

**Sorting** (BOM line tables): `sort` + `order` query params, e.g. `?sort=risk_score&order=desc`. Sortable fields are listed per endpoint below.

---

## 3. Endpoints

### 3.1 `GET /v1/parts/search`

Fuzzy search by MPN or description.

**Auth**: none (IP rate-limited)

**Query params**

| Param | Type | Required | Notes |
|---|---|---|---|
| `q` | string | yes | MPN or description fragment |
| `category` | string | no | filter, e.g. `regulator` |
| `manufacturer` | string | no | filter, exact canonical name |
| `lifecycle` | string | no | one of `active`, `nrnd`, `last_time_buy`, `obsolete`, `unknown` |
| `cursor` | string | no | pagination cursor |
| `limit` | int | no | default 25, max 100 |

**Response** `200`

```json
{
  "data": [
    {
      "id": "8e4c1a20-1f3a-4b8e-9e2a-0a1b2c3d4e5f",
      "mpn": "LM317T",
      "manufacturer": "TEXAS INSTRUMENTS",
      "description": "3-terminal adjustable regulator, TO-220",
      "category": "regulator",
      "lifecycle_stage": "active",
      "score": 92
    }
  ],
  "next_cursor": null,
  "has_more": false
}
```

---

### 3.2 `GET /v1/parts/:id`

Part detail — reconciled lifecycle status and risk/PartPilot score.

**Auth**: none

**Path params**: `id` (uuid)

**Response** `200`

```json
{
  "id": "8e4c1a20-1f3a-4b8e-9e2a-0a1b2c3d4e5f",
  "mpn": "LM317T",
  "manufacturer": "TEXAS INSTRUMENTS",
  "description": "3-terminal adjustable regulator, TO-220",
  "category": "regulator",
  "parameters": {
    "output_current_max_a": 1.5,
    "package": "TO-220",
    "voltage_min_v": 1.25,
    "voltage_max_v": 37
  },
  "reconciled_status": {
    "stage": "active",
    "last_time_buy_date": null,
    "confidence": 0.94,
    "reported_at": "2026-06-30T08:00:00Z"
  },
  "risk": { "value": 0.08, "band": "low" },
  "score": 92
}
```

**Errors**: `404` if the part doesn't exist.

---

### 3.3 `GET /v1/parts/:id/history`

Raw per-source lifecycle statuses (audit trail behind the reconciled status).

**Auth**: none

**Response** `200`

```json
{
  "part_id": "8e4c1a20-1f3a-4b8e-9e2a-0a1b2c3d4e5f",
  "statuses": [
    {
      "source": "manufacturer_pcn",
      "stage": "active",
      "confidence": 1.0,
      "reported_at": "2026-06-30T08:00:00Z",
      "raw_payload_ref": "pcn/ti/lm317t-2026-06.pdf"
    },
    {
      "source": "digikey",
      "stage": "active",
      "confidence": 0.7,
      "reported_at": "2026-07-12T14:00:00Z",
      "raw_payload_ref": null
    }
  ]
}
```

---

### 3.4 `GET /v1/parts/:id/alternates`

Ranked alternate/substitute part suggestions.

**Auth**: none

**Response** `200`

```json
{
  "part_id": "8e4c1a20-1f3a-4b8e-9e2a-0a1b2c3d4e5f",
  "alternates": [
    {
      "id": "b1a2c3d4-...",
      "mpn": "LM317ABCD",
      "manufacturer": "ONSEMI",
      "match_kind": "manufacturer_cross_ref",
      "similarity": 1.0,
      "score": 88
    },
    {
      "id": "c2b3d4e5-...",
      "mpn": "LM317T-ALT",
      "manufacturer": "STMICROELECTRONICS",
      "match_kind": "same_family",
      "similarity": 0.91,
      "score": 90
    }
  ]
}
```

---

### 3.5 `GET /v1/parts/:id/insights`

Community Pulse digest — synthesized summary of public forum mentions, with citations. Regenerated on-demand if missing or stale.

**Auth**: none

**Response** `200`

```json
{
  "part_id": "8e4c1a20-1f3a-4b8e-9e2a-0a1b2c3d4e5f",
  "summary": "Widely regarded as a reliable, easy-to-source linear regulator for low-current designs; frequently recommended for hobbyist and prototype work.",
  "sentiment": "positive",
  "common_praise": ["easy to design around", "widely available", "forgiving of layout mistakes"],
  "common_issues": ["poor efficiency at high dropout", "needs a heatsink above ~0.5A"],
  "based_on_post_count": 34,
  "generated_at": "2026-07-06T00:00:00Z",
  "citations": [
    {
      "source": "eevblog",
      "url": "https://www.eevblog.com/forum/...",
      "title": "LM317 thermal issues in enclosure",
      "posted_at": "2026-05-02T00:00:00Z",
      "engagement": 41
    }
  ]
}
```

**Response** `200`, insufficient data:

```json
{
  "part_id": "...",
  "summary": null,
  "sentiment": "insufficient",
  "common_praise": [],
  "common_issues": [],
  "based_on_post_count": 1,
  "generated_at": "2026-07-06T00:00:00Z",
  "citations": []
}
```

---

### 3.6 `GET /v1/parts/compare`

Side-by-side parameter comparison for the Part Search "Compare" flow.

**Auth**: none

**Query params**: `ids` — comma-separated part UUIDs, 2–8 parts.

**Response** `200`

```json
{
  "parts": [
    {
      "id": "8e4c1a20-...",
      "label": "LM317T — Texas Instruments",
      "parameters": { "output_current_max_a": 1.5, "package": "TO-220" }
    },
    {
      "id": "c2b3d4e5-...",
      "label": "LM317T-ALT — STMicroelectronics",
      "parameters": { "output_current_max_a": 1.5, "package": "TO-220" }
    }
  ]
}
```

**Errors**: `400` if fewer than 2 or more than 8 ids given.

---

### 3.7 `POST /v1/boms`

Upload a BOM (CSV or XLSX) and generate a risk report.

**Auth**: Supabase session

**Request**: `multipart/form-data`

| Field | Type | Required |
|---|---|---|
| `file` | file (.csv/.xlsx) | yes |
| `name` | string | no — defaults to filename |

**Response** `201`

```json
{
  "id": "d4e5f6a7-...",
  "name": "Amp-v3 BOM",
  "uploaded_at": "2026-07-13T10:00:00Z",
  "line_count": 42,
  "unmatched_line_count": 2
}
```

**Errors**: `400` unsupported file type or unparseable file.

---

### 3.8 `GET /v1/boms/:id`

Fetch a stored BOM's risk report.

**Auth**: Supabase session, owner-only

**Query params** (sorting): `sort` — one of `line_no`, `description`, `manufacturer`, `country_of_origin`, `category`, `qty`, `unit_price`, `compliance`, `lifecycle_stage`, `score`. `order` — `asc` | `desc`.

**Response** `200`

```json
{
  "id": "d4e5f6a7-...",
  "name": "Amp-v3 BOM",
  "uploaded_at": "2026-07-13T10:00:00Z",
  "lines": [
    {
      "line_no": 1,
      "description": "10k resistor, 1%",
      "manufacturer": "YAGEO",
      "country_of_origin": "TW",
      "category": "resistor",
      "qty": 12,
      "unit_price": 0.01,
      "compliance": [{ "standard": "rohs", "status": "pass" }],
      "lifecycle_stage": "active",
      "score": 97,
      "matched_part_id": "9f8e7d6c-..."
    },
    {
      "line_no": 2,
      "description": "LM317T regulator",
      "manufacturer": "TEXAS INSTRUMENTS",
      "country_of_origin": "US",
      "category": "regulator",
      "qty": 4,
      "unit_price": 0.42,
      "compliance": [{ "standard": "rohs", "status": "pass" }],
      "lifecycle_stage": "nrnd",
      "score": 58,
      "matched_part_id": "8e4c1a20-..."
    }
  ]
}
```

**Errors**: `403` if the requester doesn't own the BOM, `404` if it doesn't exist.

---

### 3.9 `GET /v1/boms/:id/compare`

Line-by-line diff against another BOM (e.g. two revisions of a project).

**Auth**: Supabase session, owner of both BOMs

**Query params**: `with` — the other BOM's id.

**Response** `200`

```json
{
  "base_bom_id": "d4e5f6a7-...",
  "compare_bom_id": "e5f6a7b8-...",
  "changes": [
    {
      "line_key": "LM317T / TEXAS INSTRUMENTS",
      "status": "changed",
      "fields_changed": ["lifecycle_stage", "score"],
      "base": { "lifecycle_stage": "active", "score": 92 },
      "compare": { "lifecycle_stage": "nrnd", "score": 58 }
    },
    {
      "line_key": "74HC595 / NXP",
      "status": "added",
      "compare": { "lifecycle_stage": "active", "score": 89 }
    },
    {
      "line_key": "OLD-PART-123 / VENDOR",
      "status": "removed",
      "base": { "lifecycle_stage": "obsolete", "score": 3 }
    }
  ]
}
```

---

### 3.10 `GET /v1/watchlist`

Current user's watched parts.

**Auth**: Supabase session

**Response** `200`

```json
{
  "data": [
    {
      "part_id": "8e4c1a20-...",
      "mpn": "LM317T",
      "manufacturer": "TEXAS INSTRUMENTS",
      "lifecycle_stage": "active",
      "score": 92,
      "added_at": "2026-06-01T00:00:00Z"
    }
  ]
}
```

---

### 3.11 `POST /v1/watchlist`

Add a part to the current user's watchlist.

**Auth**: Supabase session

**Request body**

```json
{ "part_id": "8e4c1a20-1f3a-4b8e-9e2a-0a1b2c3d4e5f" }
```

**Response** `201`

```json
{ "part_id": "8e4c1a20-1f3a-4b8e-9e2a-0a1b2c3d4e5f", "added_at": "2026-07-13T10:00:00Z" }
```

**Errors**: `409` if already watchlisted.

---

### 3.12 `DELETE /v1/watchlist/:part_id`

Remove a part from the current user's watchlist.

**Auth**: Supabase session

**Response** `204` (empty body)

---

### 3.13 `GET /v1/kicad/lookup`

Slim single-part lookup for the KiCad plugin.

**Auth**: API key (`X-API-Key`)

**Query params**

| Param | Type | Required |
|---|---|---|
| `mpn` | string | yes |
| `manufacturer` | string | no — improves match precision |

**Response** `200`

```json
{
  "mpn": "LM317T",
  "manufacturer": "TEXAS INSTRUMENTS",
  "lifecycle_stage": "active",
  "score": 92,
  "risk_band": "low"
}
```

**Errors**: `404` if no match found, `401` invalid/missing API key.

---

### 3.14 `GET /healthz`

Liveness/readiness check (used by Railway).

**Auth**: none

**Response** `200`

```json
{ "status": "ok", "db": "ok" }
```

---

## 4. Error format

All non-2xx responses share one shape:

```json
{ "error": "human-readable message" }
```

| Status | Meaning |
|---|---|
| `400` | Malformed request (bad params, unparseable upload) |
| `401` | Missing/invalid credential |
| `403` | Authenticated but not authorized for this resource |
| `404` | Resource not found |
| `409` | Conflict (e.g. duplicate watchlist entry) |
| `429` | Rate limited |
| `500` | Internal error — logged server-side with a request id, never leaks internals in the response |

Every response includes an `X-Request-Id` header for support/debugging correlation.

---

## 5. Rate limits

| Tier | Limit |
|---|---|
| Public (unauthenticated) | 60 requests/min per IP |
| Supabase session | 300 requests/min per user |
| API key (KiCad) | 120 requests/min per key |

`429` responses include a `Retry-After` header (seconds).
