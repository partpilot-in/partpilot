# PartPilot API — `server`

Base URL: `https://api.bestpartpilot.com` (production) · `http://localhost:8080` (local dev)

All requests/responses are JSON. All timestamps are ISO 8601 UTC.

---

## 1. Authentication

Three tiers, matched to the route table in §3:

| Scheme | Header | Used for |
|---|---|---|
| None | — | Public read endpoints (parts, search) |
| Supabase session | `Authorization: Bearer <supabase_access_token>` | User-scoped endpoints (BOMs, Important parts, part notes) |
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

**Sorting** (BOM line tables): `sort` + `order` query params, e.g. `?sort=score&order=desc`. Sortable fields are listed per endpoint below.

### Component metadata schema

`component_metadata` is a partial JSON projection of DatasheetXML v0.3. An
unenriched part may use `{}`. Every non-empty value is normalized by the server
and database to include string `version` and `schemaVersion: "0.3"` fields.
Defined characteristic sections are objects and may be omitted when no data is
available:

| Section | Purpose |
|---|---|
| `identification` | Manufacturer, MPN, family, description and classification |
| `electrical`, `mechanical`, `thermal`, `material` | Datasheet characteristics |
| `environmental`, `reliability`, `regulatory` | Compliance and reliability data |
| `manufacturing`, `commercial`, `packaging` | Production, lifecycle and packaging data |
| `documentation` | Documents, certificates and revision history |
| `edaModels` | Canonical EDA model URI lists |

Canonical documentation and EDA example:

```json
{
  "version": "1",
  "schemaVersion": "0.3",
  "identification": {
    "manufacturerPartNumber": "STM32F103C8T6",
    "manufacturer": "STMicroelectronics"
  },
  "documentation": {
    "documents": [
      {
        "documentType": "Datasheet",
        "title": "STM32F103x8/xB datasheet",
        "documentNumber": "DS5319",
        "revision": "Rev 20",
        "date": "2025-02-03",
        "url": "https://www.st.com/resource/en/datasheet/stm32f103c8.pdf"
      },
      {
        "documentType": "Application Note",
        "title": "Getting started with STM32F10xxx hardware development",
        "url": "https://www.st.com/resource/en/application_note/an2586.pdf"
      }
    ],
    "complianceCertificates": [
      "https://example.com/stm32f103-rohs.pdf"
    ],
    "revisionHistory": [
      { "revision": "Rev 20", "date": "2025-02-03", "notes": "Current release" }
    ]
  },
  "edaModels": {
    "bsdl": ["https://example.com/stm32f103.bsdl"],
    "ibis": ["https://example.com/stm32f103.ibs"],
    "spice": ["https://example.com/stm32f103.lib"],
    "svd": ["https://example.com/stm32f103.svd"],
    "symbol": ["https://example.com/stm32f103.kicad_sym"],
    "footprint": ["https://example.com/lqfp48.kicad_mod"],
    "threeDModel": ["https://example.com/lqfp48.step"]
  }
}
```

`documentation.documents` entries allow `documentType`, `title`,
`documentNumber`, `revision`, `date`, and `url`. `documentType` is one of
`Datasheet`, `Application Note`, `Technical Note`, `Errata`, or `PCN`.
`Datasheet` is a PartPilot extension because the source XSD models the
datasheet as the root document rather than as a linked document. `url` is
required; other document fields are optional strings.

Every `edaModels` value is a list of non-empty URI strings. The only supported
keys are `bsdl`, `ibis`, `spice`, `svd`, `symbol`, `footprint`, and
`threeDModel`.

For adapter compatibility, legacy documentation fields such as
`datasheetUrl`, `applicationNotes`, `technicalNotes`, and
`changeNotifications` are retained, while equivalent entries are added to the
canonical `documentation.documents` list. EDA links found directly under
`documentation` or under `documentation.edaModels` are promoted into the
top-level `edaModels` object. Invalid canonical metadata submitted through My
Parts or BOM endpoints returns `400`; invalid adapter metadata returns `502`.

---

## 3. Endpoints

### 3.1 `GET /v1/parts/search`

Fuzzy search by MPN or description.

**Auth**: none (IP rate-limited)

**Query params**

| Param | Type | Required | Notes |
|---|---|---|---|
| `q` | string | no | MPN or description fragment; omit to list parts |
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
      "score": 92,
      "component_metadata": {
        "version": "1",
        "schemaVersion": "0.3",
        "mechanical": { "packageType": "TO-220" },
        "environmental": { "rohsCompliant": true },
        "regulatory": { "countryOfOrigin": "US" },
        "commercial": { "lifecycleStatus": "Active" },
        "documentation": {
          "documents": [
            {
              "documentType": "Datasheet",
              "url": "https://www.ti.com/lit/ds/symlink/lm317.pdf"
            }
          ]
        }
      }
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
  "component_metadata": {
    "version": "1",
    "schemaVersion": "0.3",
    "mechanical": { "packageType": "TO-220" },
    "environmental": { "rohsCompliant": true },
    "regulatory": { "countryOfOrigin": "US" },
    "commercial": { "lifecycleStatus": "Active" },
    "documentation": {
      "documents": [
        {
          "documentType": "Datasheet",
          "url": "https://www.ti.com/lit/ds/symlink/lm317.pdf"
        }
      ]
    }
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

Side-by-side Characteristics comparison for the Part Search "Compare" flow.

**Auth**: none

**Query params**: `ids` — comma-separated part UUIDs, 2–8 parts.

**Response** `200`

```json
{
  "parts": [
    {
      "id": "8e4c1a20-...",
      "label": "LM317T — Texas Instruments",
      "component_metadata": {
        "version": "1",
        "schemaVersion": "0.3",
        "mechanical": { "packageType": "TO-220" }
      }
    },
    {
      "id": "c2b3d4e5-...",
      "label": "LM317T-ALT — STMicroelectronics",
      "component_metadata": {
        "version": "1",
        "schemaVersion": "0.3",
        "mechanical": { "packageType": "TO-220" }
      }
    }
  ]
}
```

**Errors**: `400` if fewer than 2 or more than 8 ids given.

---

### 3.7 `GET /v1/part-notes/:part_id`

Fetch the current user's note for any catalog, manual, or BOM-only part. A
missing record returns an empty note instead of `404`.

**Auth**: Supabase session

**Response** `200`

```json
{
  "part_id": "8e4c1a20-1f3a-4b8e-9e2a-0a1b2c3d4e5f",
  "note": "Check the alternate footprint before release.",
  "partpilot_points": []
}
```

`note` belongs to the signed-in user. `partpilot_points` is read-only client
data reserved for future insights supplied through adapters and the
PartPilot engine.

---

### 3.8 `PATCH /v1/part-notes/:part_id`

Create or replace the current user's note text without changing any
PartPilot-generated points.

**Auth**: Supabase session

**Request**

```json
{
  "note": "Check the alternate footprint before release."
}
```

**Response** `200`: the complete note resource in the same shape as section
3.7. Note text is trimmed and limited to 20,000 characters.

---

### 3.9 `GET /v1/boms`

List the current user's BOM projects for the Projects page and dashboard aggregations.

**Auth**: Supabase session

**Response** `200`

```json
{
  "data": [
    {
      "id": "d4e5f6a7-...",
      "name": "Amp-v3 BOM",
      "part_count": 42,
      "uploaded_at": "2026-07-13T10:00:00Z",
      "owner": "You",
      "lowest_score": 58,
      "lines": []
    }
  ]
}
```

---

### 3.10 `POST /v1/boms`

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
  "part_count": 42,
  "uploaded_at": "2026-07-13T10:00:00Z",
  "owner": "You",
  "lowest_score": 58,
  "lines": [
    {
      "id": "line-1",
      "part_id": "9f8e7d6c-...",
      "line_no": 1,
      "mpn": "RC0805FR-0710KL",
      "description": "10k resistor, 1%",
      "manufacturer": "YAGEO",
      "category": "resistor",
      "qty": 12,
      "unit_price": 0.01,
      "score": 97,
      "component_metadata": {
        "version": "1",
        "schemaVersion": "0.3",
        "environmental": { "rohsCompliant": true },
        "regulatory": { "countryOfOrigin": "TW" },
        "commercial": { "lifecycleStatus": "Active" }
      }
    }
  ]
}
```

**Errors**: `400` unsupported file type or unparseable file.

---

### 3.11 `GET /v1/boms/:id`

Fetch a stored BOM's risk report.

**Auth**: Supabase session, owner-only

**Query params**: sorting is performed client-side, including Characteristics-derived lifecycle and compliance values.

**Response** `200`

```json
{
  "id": "d4e5f6a7-...",
  "name": "Amp-v3 BOM",
  "part_count": 2,
  "uploaded_at": "2026-07-13T10:00:00Z",
  "owner": "You",
  "lowest_score": 58,
  "lines": [
    {
      "id": "line-1",
      "part_id": "9f8e7d6c-...",
      "line_no": 1,
      "mpn": "RC0805FR-0710KL",
      "description": "10k resistor, 1%",
      "manufacturer": "YAGEO",
      "category": "resistor",
      "qty": 12,
      "unit_price": 0.01,
      "score": 97,
      "component_metadata": {
        "version": "1",
        "schemaVersion": "0.3",
        "environmental": { "rohsCompliant": true },
        "regulatory": { "countryOfOrigin": "TW" },
        "commercial": { "lifecycleStatus": "Active" }
      }
    },
    {
      "id": "line-2",
      "part_id": "8e4c1a20-...",
      "line_no": 2,
      "mpn": "LM317T",
      "description": "LM317T regulator",
      "manufacturer": "TEXAS INSTRUMENTS",
      "category": "regulator",
      "qty": 4,
      "unit_price": 0.42,
      "score": 58,
      "component_metadata": {
        "version": "1",
        "schemaVersion": "0.3",
        "environmental": { "rohsCompliant": true },
        "regulatory": { "countryOfOrigin": "US" },
        "commercial": { "lifecycleStatus": "NRND" }
      }
    }
  ]
}
```

**Errors**: `403` if the requester doesn't own the BOM, `404` if it doesn't exist.

---

### 3.12 `GET /v1/boms/:id/compare`

Line-by-line diff against another BOM (e.g. two revisions of a project).

**Auth**: Supabase session, owner of both BOMs

**Query params**: `with` — the other BOM's id.

**Response** `200`

```json
{
  "items": [
    {
      "id": "line-2",
      "part_id": "8e4c1a20-...",
      "line_no": 2,
      "mpn": "LM317T",
      "description": "LM317T regulator",
      "manufacturer": "TEXAS INSTRUMENTS",
      "category": "regulator",
      "qty": 4,
      "unit_price": 0.42,
      "score": 58,
      "component_metadata": {
        "version": "1",
        "schemaVersion": "0.3",
        "commercial": { "lifecycleStatus": "NRND" }
      },
      "delta": "changed",
      "change_summary": "Lifecycle changed from active to NRND; score dropped from 92 to 58.",
      "previous_score": 92
    },
    {
      "id": "line-3",
      "part_id": "74hc595-...",
      "line_no": 3,
      "mpn": "74HC595",
      "description": "8-bit shift register",
      "manufacturer": "NXP",
      "category": "logic",
      "qty": 8,
      "unit_price": 0.18,
      "score": 89,
      "component_metadata": {
        "version": "1",
        "schemaVersion": "0.3",
        "commercial": { "lifecycleStatus": "Active" }
      },
      "delta": "added",
      "change_summary": "Added in comparison BOM."
    },
    {
      "id": "line-4",
      "part_id": "old-part-...",
      "line_no": 4,
      "mpn": "OLD-PART-123",
      "description": "Legacy component",
      "manufacturer": "VENDOR",
      "category": "Uncategorized",
      "qty": 1,
      "unit_price": 0,
      "score": 3,
      "component_metadata": {
        "version": "1",
        "schemaVersion": "0.3",
        "commercial": { "lifecycleStatus": "Obsolete" }
      },
      "delta": "removed",
      "change_summary": "Removed from comparison BOM."
    }
  ]
}
```

---

### 3.13 `GET /v1/important-parts`

Current user's important parts.

**Auth**: Supabase session

**Response** `200`

```json
{
  "data": [
    {
      "id": "8e4c1a20-...",
      "mpn": "LM317T",
      "manufacturer": "TEXAS INSTRUMENTS",
      "description": "3-terminal adjustable regulator, TO-220",
      "category": "regulator",
      "score": 92,
      "component_metadata": {
        "version": "1",
        "schemaVersion": "0.3",
        "mechanical": { "packageType": "TO-220" },
        "environmental": { "rohsCompliant": true },
        "regulatory": { "countryOfOrigin": "US" },
        "commercial": { "lifecycleStatus": "Active" }
      },
      "created_at": "2026-06-01T00:00:00Z"
    }
  ]
}
```

---

### 3.14 `POST /v1/important-parts`

Mark a part as important for the current user.

**Auth**: Supabase session

**Request body**

```json
{ "part_id": "8e4c1a20-1f3a-4b8e-9e2a-0a1b2c3d4e5f" }
```

**Response** `201`

```json
{ "part_id": "8e4c1a20-1f3a-4b8e-9e2a-0a1b2c3d4e5f", "created_at": "2026-07-13T10:00:00Z" }
```

**Errors**: `409` if already marked important.

---

### 3.15 `DELETE /v1/important-parts/:part_id`

Remove the important mark from a part.

**Auth**: Supabase session

**Response** `204` (empty body)

---

### 3.16 `GET /v1/kicad/lookup`

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
  "component_metadata": {
    "version": "1",
    "schemaVersion": "0.3",
    "commercial": { "lifecycleStatus": "Active" }
  },
  "score": 92,
  "risk_band": "low"
}
```

**Errors**: `404` if no match found, `401` invalid/missing API key.

---

### 3.17 `GET /healthz`

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
| `409` | Conflict (e.g. duplicate important part) |
| `429` | Rate limited |
| `502` | A configured distributor adapter returned invalid or unusable metadata |
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
