# Implementation Plan

## 2. Repository structure

```
partpilot/
├── Cargo.toml                      # workspace root
├── Cargo.lock
├── rust-toolchain.toml
├── .env.example
├── .github/
│   └── workflows/
│       ├── rust-ci.yml             # cargo check/test/clippy, path-filtered to crates/**
│       ├── client-ci.yml           # npm lint/build/test, path-filtered to client/**
│       └── deploy.yml              # Railway deploy trigger on main, per service
│
├── crates/
│   ├── partpilot-engine/
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── lib.rs
│   │       ├── domain/
│   │       │   ├── mod.rs
│   │       │   ├── part.rs
│   │       │   ├── lifecycle.rs
│   │       │   ├── alternates.rs
│   │       │   └── risk.rs
│   │       ├── ports/
│   │       │   ├── mod.rs
│   │       │   ├── data_source.rs
│   │       │   ├── repository.rs
│   │       │   └── notify.rs
│   │       ├── normalize.rs
│   │       ├── reconcile.rs
│   │       ├── risk.rs
│   │       ├── match_alt.rs
│   │       └── config.rs           # ReconcilePolicy, RiskWeights — tunable, loaded not hardcoded
│   │
│   ├── partpilot-server/
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── main.rs
│   │       ├── config.rs           # env var loading, validated at startup
│   │       ├── state.rs            # AppState composition root
│   │       ├── auth.rs             # Supabase JWT verification middleware + API-key middleware
│   │       ├── error.rs            # AppError -> IntoResponse
│   │       ├── telemetry.rs        # tracing setup, request-id middleware
│   │       └── routes/
│   │           ├── mod.rs
│   │           ├── parts.rs
│   │           ├── boms.rs
│   │           ├── watchlist.rs
│   │           ├── kicad.rs
│   │           └── health.rs
│   │
│   ├── partpilot-worker/
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── main.rs
│   │       ├── config.rs
│   │       ├── sweep.rs
│   │       ├── enrich.rs
│   │       └── source_health.rs
│   │
│   └── adapters/
│       ├── adapter-digikey/
│       │   └── src/{lib.rs, auth.rs, client.rs, mapping.rs}
│       ├── adapter-mouser/
│       │   └── src/{lib.rs, client.rs, mapping.rs}
│       ├── adapter-octopart/
│       │   └── src/{lib.rs, graphql.rs, mapping.rs}
│       ├── adapter-pcn-parser/
│       │   └── src/{lib.rs, feeds.rs, parse.rs}
│       └── adapter-notify/
│           └── src/{lib.rs, email.rs, webhook.rs}
│
├── supabase/
│   └── migrations/                 # Supabase CLI migrations, source of truth for schema
│       ├── 0001_init_core_schema.sql
│       ├── 0002_user_data_and_alternates.sql
│       └── ...
│
├── client/                         # partpilot-client (Vite + React), own npm workspace
│   ├── package.json
│   ├── vite.config.ts
│   ├── src/
│   │   ├── api/
│   │   │   ├── client.ts           # fetch wrapper, attaches Supabase bearer token
│   │   │   └── types.ts            # DTOs mirroring server response shapes
│   │   ├── pages/{Search,PartDetail,BomUpload,Watchlist}.tsx
│   │   ├── components/
│   │   ├── hooks/                  # React Query hooks per endpoint
│   │   └── lib/supabase.ts
│   └── public/
│
├── kicad-plugin/                   # partpilot-kicad-plugin
│   ├── plugin.json                 # KiCad PCM metadata
│   ├── __init__.py
│   ├── action_plugin.py
│   ├── api_client.py
│   ├── config_dialog.py
│   └── resources/icon.png
│
├── docs/
│   ├── implementation.md           # this document
│   └── architecture-decisions/     # one file per ADR as new ones come up
│
└── scripts/
    ├── seed_dev_db.sh
    └── railway_deploy_check.sh
```

---

## 3. `partpilot-engine`

Pure library crate. No `tokio` runtime requirement in the domain math itself (traits are async via `async-trait` since implementations need it, but `normalize`/`risk`/`reconcile` are plain sync functions). No `sqlx`, `axum`, or HTTP types appear anywhere in this crate — verify periodically with `cargo tree -i partpilot-engine` that no adapter shows up as a dependency of the engine.

### 3.1 `domain` — core types

```rust
// domain/part.rs
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct PartId(pub uuid::Uuid);

#[derive(Debug, Clone)]
pub struct Part {
    pub id: PartId,
    pub mpn: NormalizedMpn,
    pub manufacturer: NormalizedManufacturer,
    pub description: Option<String>,
    pub category: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct NormalizedMpn(pub String);

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct NormalizedManufacturer(pub String);

/// Category-agnostic parametric data (resistance/package for a resistor,
/// voltage/current/package for a regulator, etc.) — a HashMap rather than
/// per-category structs, so new categories don't require schema migrations.
/// Shape is validated at the adapter boundary, not enforced by the type.
#[derive(Debug, Clone, Default)]
pub struct PartParameters(pub std::collections::HashMap<String, ParamValue>);

#[derive(Debug, Clone)]
pub enum ParamValue {
    Number(f64),
    Text(String),
    Bool(bool),
}
```

```rust
// domain/lifecycle.rs
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum LifecycleStage {
    Active,
    Nrnd,
    LastTimeBuy,
    Obsolete,
    Unknown,
}

#[derive(Debug, Clone)]
pub struct LifecycleStatus {
    pub part_id: PartId,
    pub stage: LifecycleStage,
    pub source: SourceId,
    pub reported_at: chrono::DateTime<chrono::Utc>,
    pub last_time_buy_date: Option<chrono::NaiveDate>,
    pub confidence: Confidence,
    pub raw_payload_ref: Option<String>, // Supabase Storage object path
}

#[derive(Debug, Clone, Copy, PartialEq, PartialOrd)]
pub struct Confidence(pub f32); // 0.0..=1.0

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct SourceId(pub u32);
```

```rust
// domain/alternates.rs
#[derive(Debug, Clone)]
pub struct AlternatePart {
    pub original: PartId,
    pub alternate: PartId,
    pub match_kind: AlternateMatchKind,
    pub similarity: f32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AlternateMatchKind {
    ManufacturerCrossRef,
    FormFitFunction,
    SameFamily,
}
```

```rust
// domain/risk.rs
#[derive(Debug, Clone, Copy)]
pub struct RiskScore {
    pub value: f32,
    pub band: RiskBand,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RiskBand { Low, Medium, High, Critical }
```

Design invariants worth unit testing directly:
- `NormalizedMpn`/`NormalizedManufacturer` are the only types that reach comparison/matching logic — never compare raw `String`s from adapters directly.
- `LifecycleStage` derives `Ord` deliberately (`Active < Nrnd < LastTimeBuy < Obsolete < Unknown` is *not* the intended order — define the `Ord` impl explicitly by severity, don't rely on declaration order, and add a test asserting `Obsolete > Active`).

### 3.2 `ports` — trait boundary

```rust
// ports/data_source.rs
#[async_trait::async_trait]
pub trait DataSourceConnector: Send + Sync {
    fn source_id(&self) -> SourceId;

    async fn fetch_status(
        &self,
        mpn: &NormalizedMpn,
        manufacturer: &NormalizedManufacturer,
    ) -> Result<Option<LifecycleStatus>, ConnectorError>;

    /// Default sequential fallback; override for sources with real batch APIs
    /// (DigiKey, Mouser). PCN scraping typically can't batch.
    async fn fetch_status_batch(
        &self,
        parts: &[(NormalizedMpn, NormalizedManufacturer)],
    ) -> Result<Vec<LifecycleStatus>, ConnectorError> {
        let mut out = Vec::with_capacity(parts.len());
        for (mpn, mfr) in parts {
            if let Some(s) = self.fetch_status(mpn, mfr).await? {
                out.push(s);
            }
        }
        Ok(out)
    }
}

#[derive(Debug, thiserror::Error)]
pub enum ConnectorError {
    #[error("rate limited, retry after {0:?}")]
    RateLimited(std::time::Duration),
    #[error("source unavailable: {0}")]
    Unavailable(String),
    #[error("part not found in source")]
    NotFound,
    #[error("malformed response: {0}")]
    Malformed(String),
    #[error("auth failed: {0}")]
    AuthFailed(String),
}
```

```rust
// ports/repository.rs
#[async_trait::async_trait]
pub trait PartRepository: Send + Sync {
    async fn upsert_part(&self, part: &Part) -> Result<PartId, RepoError>;
    async fn find_by_mpn(&self, mpn: &NormalizedMpn) -> Result<Option<Part>, RepoError>;
    async fn search(&self, query: &str, limit: u32) -> Result<Vec<Part>, RepoError>;
    async fn insert_status(&self, status: &LifecycleStatus) -> Result<(), RepoError>;
    async fn latest_statuses(&self, part_id: &PartId) -> Result<Vec<LifecycleStatus>, RepoError>;
    async fn upsert_alternate(&self, alt: &AlternatePart) -> Result<(), RepoError>;
    async fn alternates_for(&self, part_id: &PartId) -> Result<Vec<AlternatePart>, RepoError>;
    async fn watchlist_parts_for_user(&self, user_id: uuid::Uuid) -> Result<Vec<Part>, RepoError>;
    async fn add_to_watchlist(&self, user_id: uuid::Uuid, part_id: &PartId) -> Result<(), RepoError>;
    async fn remove_from_watchlist(&self, user_id: uuid::Uuid, part_id: &PartId) -> Result<(), RepoError>;
    async fn all_parts_paginated(&self, cursor: Option<PartId>, limit: u32) -> Result<Vec<Part>, RepoError>;
}

#[derive(Debug, thiserror::Error)]
pub enum RepoError {
    #[error("not found")]
    NotFound,
    #[error("conflict: {0}")]
    Conflict(String),
    #[error("storage error: {0}")]
    Storage(String),
}
```

```rust
// ports/notify.rs
#[async_trait::async_trait]
pub trait NotificationSender: Send + Sync {
    async fn send_risk_alert(
        &self,
        user_id: uuid::Uuid,
        part: &Part,
        risk: RiskScore,
        previous_band: Option<RiskBand>,
    ) -> Result<(), NotifyError>;
}

#[derive(Debug, thiserror::Error)]
pub enum NotifyError {
    #[error("delivery failed: {0}")]
    DeliveryFailed(String),
    #[error("no delivery channel configured for user")]
    NoChannel,
}
```

Every adapter crate depends on `partpilot-engine`; the engine never depends on an adapter. This is the enforcement point for the hexagonal boundary — CI can run `cargo tree -i partpilot-engine -p adapter-*` as a lint step and fail the build if it ever returns a non-empty result.

### 3.3 `normalize`

```rust
pub fn normalize_mpn(raw: &str) -> NormalizedMpn {
    let cleaned: String = raw
        .trim()
        .to_uppercase()
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == '-')
        .collect();
    NormalizedMpn(cleaned)
}

pub struct AliasTable(std::collections::HashMap<String, NormalizedManufacturer>);

impl AliasTable {
    pub fn resolve(&self, upper_trimmed: &str) -> Option<NormalizedManufacturer> {
        self.0.get(upper_trimmed).cloned()
    }

    /// Seed with common variants; the worker logs unresolved manufacturer
    /// strings so this table grows from real ingestion data rather than
    /// upfront guessing.
    pub fn seed_default() -> Self {
        let mut m = std::collections::HashMap::new();
        m.insert("TI".into(), NormalizedManufacturer("TEXAS INSTRUMENTS".into()));
        m.insert("TEXAS INSTRUMENTS INC".into(), NormalizedManufacturer("TEXAS INSTRUMENTS".into()));
        // ... more seed aliases
        Self(m)
    }
}

pub fn normalize_manufacturer(raw: &str, alias_table: &AliasTable) -> NormalizedManufacturer {
    let trimmed = raw.trim().to_uppercase();
    alias_table.resolve(&trimmed).unwrap_or(NormalizedManufacturer(trimmed))
}
```

Testing strategy: table-driven tests pairing raw distributor strings (`"Texas Instruments Incorporated"`, `"TI Inc."`, `"texas instruments"`) against the expected canonical form. Grow this table whenever the worker's unresolved-manufacturer log surfaces a new variant — treat it as a living dataset, not a one-time seed.

### 3.4 `reconcile`

```rust
pub struct ReconcilePolicy {
    pub source_weight: std::collections::HashMap<SourceId, f32>,
    pub recency_half_life_days: f32, // default 180.0
}

pub fn reconcile(statuses: &[LifecycleStatus], policy: &ReconcilePolicy) -> LifecycleStatus {
    // 1. Keep only the most recent status per source.
    let latest_per_source = dedupe_latest_per_source(statuses);

    // 2. Weight = source_weight * recency_decay(reported_at) * confidence.
    let weighted: Vec<(f32, &LifecycleStatus)> = latest_per_source
        .iter()
        .map(|s| {
            let w = policy.source_weight.get(&s.source).copied().unwrap_or(0.3)
                * recency_decay(s.reported_at, policy.recency_half_life_days)
                * s.confidence.0;
            (w, s)
        })
        .collect();

    // 3. Escalation is sticky: once any high-weight source reports
    //    LastTimeBuy/Obsolete, a lower-weight or older "Active" reading must
    //    NOT silently override it. Obsolescence is a one-way door until a
    //    newer, equally-or-more-authoritative source corrects it. This
    //    guards against the most damaging failure mode — a stale distributor
    //    feed masking a manufacturer's last-time-buy notice.
    pick_authoritative(&weighted)
}

fn recency_decay(reported_at: chrono::DateTime<chrono::Utc>, half_life_days: f32) -> f32 {
    let days = (chrono::Utc::now() - reported_at).num_days().max(0) as f32;
    0.5f32.powf(days / half_life_days)
}
```

Required unit test cases (minimum set before shipping this module):
1. Single source, single status → passthrough.
2. Manufacturer PCN says `LastTimeBuy` (3 months old) vs. distributor says `Active` (yesterday) → result must be `LastTimeBuy`.
3. Two distributors disagree, no manufacturer source present → higher-weighted distributor wins.
4. A newer manufacturer PCN explicitly reverses an older manufacturer PCN (e.g., "resuming production") → newer wins, since both are the same authority tier.
5. All sources stale (>2× half-life) → confidence should decay toward `Unknown` rather than confidently reporting a year-old `Active` status as current truth.

### 3.5 `risk`

```rust
pub struct RiskWeights {
    pub single_source_penalty: f32,   // default 0.10
    pub no_alternates_penalty: f32,   // default 0.15
    pub imminent_ltb_penalty: f32,    // default 0.20
    pub imminent_ltb_days: i64,       // default 90
}

pub struct RiskInputs<'a> {
    pub reconciled_status: &'a LifecycleStatus,
    pub source_count: usize,
    pub alternates_available: usize,
    pub days_to_last_time_buy: Option<i64>,
}

pub fn score_risk(inputs: RiskInputs, weights: &RiskWeights) -> RiskScore {
    let mut value = match inputs.reconciled_status.stage {
        LifecycleStage::Obsolete => 1.0,
        LifecycleStage::LastTimeBuy => 0.75,
        LifecycleStage::Nrnd => 0.4,
        LifecycleStage::Active => 0.05,
        LifecycleStage::Unknown => 0.5,
    };

    if inputs.source_count <= 1 {
        value += weights.single_source_penalty;
    }
    if inputs.alternates_available == 0 {
        value += weights.no_alternates_penalty;
    }
    if let Some(days) = inputs.days_to_last_time_buy {
        if days < weights.imminent_ltb_days {
            value += weights.imminent_ltb_penalty;
        }
    }

    let value = value.clamp(0.0, 1.0);
    RiskScore { value, band: band_for(value) }
}

fn band_for(v: f32) -> RiskBand {
    match v {
        v if v >= 0.85 => RiskBand::Critical,
        v if v >= 0.6 => RiskBand::High,
        v if v >= 0.3 => RiskBand::Medium,
        _ => RiskBand::Low,
    }
}
```

`RiskWeights` is loaded from config (env or a `risk_weights` table), not hardcoded — treat the constants as a first release guess to be tuned once real usage/feedback exists. Table-driven tests should cover every `LifecycleStage` crossed with every combination of the three penalty flags (16 cases), asserting both `value` and `band`.

### 3.6 `match_alt`

```rust
pub struct MatchCandidate {
    pub candidate: PartId,
    pub kind: AlternateMatchKind,
    pub similarity: f32,
}

pub fn find_alternates(
    target: &Part,
    target_params: &PartParameters,
    pool: &[(Part, PartParameters)],
) -> Vec<MatchCandidate> {
    let mut out = Vec::new();

    // Tier 1: manufacturer-published cross-reference, sourced from a PCN's
    // "replacement part" field during ingestion — similarity fixed at 1.0.
    // (These are pre-populated into `alternates` by the PCN adapter, not
    // computed here; this function handles tiers 2-3.)

    // Tier 2: same family prefix (e.g. shared MPN stem) + same package +
    // parametric distance under a category-specific threshold.
    for (candidate, params) in pool {
        if candidate.id == target.id { continue; }
        if shares_family_prefix(&target.mpn, &candidate.mpn)
            && same_package(target_params, params)
        {
            let sim = parametric_similarity(target_params, params);
            if sim > 0.8 {
                out.push(MatchCandidate { candidate: candidate.id.clone(), kind: AlternateMatchKind::SameFamily, similarity: sim });
            }
        }
    }

    // Tier 3: cross-manufacturer parametric match (form/fit/function), lower
    // confidence, surfaced but visually distinguished in the UI from tier 1/2.
    for (candidate, params) in pool {
        if candidate.id == target.id { continue; }
        if candidate.category == target.category {
            let sim = parametric_similarity(target_params, params);
            if sim > 0.9 {
                out.push(MatchCandidate { candidate: candidate.id.clone(), kind: AlternateMatchKind::FormFitFunction, similarity: sim });
            }
        }
    }

    out.sort_by(|a, b| b.similarity.partial_cmp(&a.similarity).unwrap());
    out
}
```

`parametric_similarity` is category-specific (comparing resistance tolerance bands is different math than comparing regulator output current ranges) — implement as a small strategy table keyed by `category`, with a generic numeric-distance fallback for unmodeled categories rather than failing closed.

---

## 4. Adapter crates

| Crate | Implements | Auth | Batch support | Notes |
|---|---|---|---|---|
| `adapter-digikey` | `DataSourceConnector` | OAuth2 client-credentials, token cached in-memory with refresh | Yes — Product Details API | Highest request volume; rate limiter tuned to DigiKey's published RPS |
| `adapter-mouser` | `DataSourceConnector` | Static API key | Partial | Simplest auth — good first adapter to implement end-to-end |
| `adapter-octopart` | `DataSourceConnector` | Bearer token (Nexar) | Yes — GraphQL batch query | Weight lower than direct-from-manufacturer sources; useful as cross-check |
| `adapter-pcn-parser` | `DataSourceConnector` | None (public feeds) or scraping | No | Highest trust tier, hardest to parse. Start with a hand-maintained list of top-N manufacturers' PCN RSS/email feeds rather than generic web scraping |
| `adapter-notify` | `NotificationSender` | Provider API key (Resend/Postmark) + optional webhook URL | N/A | Email primary; webhook as a secondary channel for Slack/Teams |

Shared rate-limiting wrapper used by every distributor adapter:

```rust
pub struct RateLimited<T> {
    inner: T,
    limiter: governor::DefaultDirectRateLimiter,
}

#[async_trait::async_trait]
impl<T: DataSourceConnector> DataSourceConnector for RateLimited<T> {
    fn source_id(&self) -> SourceId { self.inner.source_id() }

    async fn fetch_status(&self, mpn: &NormalizedMpn, mfr: &NormalizedManufacturer)
        -> Result<Option<LifecycleStatus>, ConnectorError>
    {
        self.limiter.until_ready().await;
        self.inner.fetch_status(mpn, mfr).await
    }
}
```

Retry/backoff: wrap `ConnectorError::RateLimited` and `ConnectorError::Unavailable` in an exponential backoff (`backoff` crate or hand-rolled), capped at 3 attempts, surfaced to `source_health` on exhaustion rather than silently dropped.

### 4.1 `adapter-pcn-parser` detail

```rust
pub struct PcnFeedConfig {
    pub manufacturer: NormalizedManufacturer,
    pub feed_url: String,
    pub parser: PcnParserKind,
}

pub enum PcnParserKind {
    Rss,
    HtmlTable { row_selector: String },
    Pdf, // extracted via a shared text-extraction helper, then regex/heuristic parsed
}
```

Ship with a curated `pcn_feeds.toml` config listing the top 20-30 manufacturers by BOM frequency in early usage, rather than attempting to auto-discover PCN pages. Each feed entry is hand-verified once; the worker logs parse failures per feed so broken parsers (manufacturers redesign their PCN pages periodically) surface quickly instead of silently going stale.

### 4.2 Supabase repository detail

```rust
pub struct PostgresRepository {
    pool: sqlx::PgPool,
}

impl PostgresRepository {
    pub async fn connect(database_url: &str) -> anyhow::Result<Self> {
        let pool = sqlx::postgres::PgPoolOptions::new()
            .max_connections(10)
            .connect(database_url)
            .await?;
        Ok(Self { pool })
    }
}

#[async_trait::async_trait]
impl PartRepository for PostgresRepository {
    async fn find_by_mpn(&self, mpn: &NormalizedMpn) -> Result<Option<Part>, RepoError> {
        sqlx::query_as!(
            PartRow,
            "select id, mpn, manufacturer, description, category from parts where mpn = $1",
            mpn.0
        )
        .fetch_optional(&self.pool)
        .await
        .map(|row| row.map(Into::into))
        .map_err(|e| RepoError::Storage(e.to_string()))
    }
    // ... remaining methods
}
```

`sqlx::query_as!` checks queries against the live schema at compile time (via `DATABASE_URL` pointed at a dev database, or `sqlx-cli`'s offline mode with a checked-in `.sqlx` cache for CI). Use the pooled/pgbouncer Supabase connection string for the server (many short-lived connections from request handlers) and the direct connection string for the worker (fewer, longer-running batch transactions).

---

## 5. `partpilot-server`

### 5.1 Composition root

```rust
#[derive(Clone)]
pub struct AppState {
    pub repo: std::sync::Arc<dyn PartRepository>,
    pub notifier: std::sync::Arc<dyn NotificationSender>,
    pub reconcile_policy: std::sync::Arc<ReconcilePolicy>,
    pub risk_weights: std::sync::Arc<RiskWeights>,
    pub db: sqlx::PgPool, // raw pool for server-specific queries (pagination, full-text search) outside the engine's port
}

pub async fn build_state(config: &Config) -> anyhow::Result<AppState> {
    let db = sqlx::postgres::PgPoolOptions::new()
        .max_connections(config.db_max_connections)
        .connect(&config.database_url)
        .await?;
    let repo = std::sync::Arc::new(PostgresRepository::from_pool(db.clone()));
    let notifier = std::sync::Arc::new(EmailNotifier::new(config.notify_api_key.clone()));
    Ok(AppState {
        repo, notifier, db,
        reconcile_policy: std::sync::Arc::new(ReconcilePolicy::default()),
        risk_weights: std::sync::Arc::new(RiskWeights::default()),
    })
}
```

### 5.2 Config loading

```rust
#[derive(Debug, serde::Deserialize)]
pub struct Config {
    pub database_url: String,
    pub supabase_jwks_url: String,
    pub notify_api_key: String,
    pub port: u16,
    pub db_max_connections: u32,
    pub cors_allowed_origin: String,
}

impl Config {
    pub fn from_env() -> anyhow::Result<Self> {
        envy::from_env().map_err(|e| anyhow::anyhow!("config error: {e}"))
    }
}
```

Fail fast at startup — missing/malformed env vars should panic before the process binds a port, not surface as a confusing 500 on the first request.

### 5.3 Route map

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/v1/parts/search?q=` | none (public, rate-limited) | Fuzzy MPN/description search |
| `GET` | `/v1/parts/:id` | none | Part detail + reconciled status + risk score |
| `GET` | `/v1/parts/:id/history` | none | Raw per-source statuses, for audit/debugging |
| `GET` | `/v1/parts/:id/alternates` | none | Ranked alternate suggestions |
| `POST` | `/v1/boms` | Supabase session | Upload a BOM (CSV/Excel), returns risk report |
| `GET` | `/v1/boms/:id` | Supabase session, owner-only | Fetch a stored BOM risk report |
| `GET` | `/v1/watchlist` | Supabase session | Current user's watched parts |
| `POST` | `/v1/watchlist` | Supabase session | Add a part to watchlist |
| `DELETE` | `/v1/watchlist/:part_id` | Supabase session | Remove from watchlist |
| `GET` | `/v1/kicad/lookup?mpn=&manufacturer=` | API key | Slim single-part lookup for the KiCad plugin |
| `GET` | `/healthz` | none | Liveness for Railway healthchecks |

### 5.4 Auth middleware

```rust
pub async fn require_supabase_session(
    State(state): State<AppState>,
    mut req: axum::extract::Request,
    next: axum::middleware::Next,
) -> Result<axum::response::Response, AppError> {
    let token = extract_bearer(&req)?;
    let claims = verify_jwt(&token, &state.jwks).await?; // fetches/caches Supabase JWKS
    req.extensions_mut().insert(UserId(claims.sub));
    Ok(next.run(req).await)
}

pub async fn require_api_key(
    State(state): State<AppState>,
    mut req: axum::extract::Request,
    next: axum::middleware::Next,
) -> Result<axum::response::Response, AppError> {
    let key = extract_api_key_header(&req)?;
    let hashed = hash_key(&key);
    let owner = state.repo.find_api_key_owner(&hashed).await?
        .ok_or(AppError::Unauthorized)?;
    req.extensions_mut().insert(UserId(owner));
    Ok(next.run(req).await)
}
```

Public endpoints get a `tower_governor` rate-limit layer keyed by IP; authenticated endpoints get a higher/no limit keyed by user id.

### 5.5 Error handling

```rust
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error(transparent)] Repo(#[from] RepoError),
    #[error(transparent)] Connector(#[from] ConnectorError),
    #[error(transparent)] Notify(#[from] NotifyError),
    #[error("unauthorized")] Unauthorized,
    #[error("bad request: {0}")] BadRequest(String),
}

impl axum::response::IntoResponse for AppError {
    fn into_response(self) -> axum::response::Response {
        let (status, message) = match &self {
            AppError::Repo(RepoError::NotFound) => (StatusCode::NOT_FOUND, self.to_string()),
            AppError::Unauthorized => (StatusCode::UNAUTHORIZED, self.to_string()),
            AppError::BadRequest(_) => (StatusCode::BAD_REQUEST, self.to_string()),
            _ => (StatusCode::INTERNAL_SERVER_ERROR, "internal error".to_string()),
        };
        (status, Json(serde_json::json!({ "error": message }))).into_response()
    }
}
```

Internal errors are logged with full detail via `tracing` but never leak internals (query text, connector URLs) into the HTTP response body.

### 5.6 Observability

`tracing` + `tracing-subscriber` with a request-id layer (generate a UUID per request, attach to all spans, echo back as `X-Request-Id`), structured JSON logs in production so Railway's log viewer/any downstream log sink can filter by field. A `/healthz` route checks DB connectivity (`SELECT 1`) so Railway's healthcheck catches a dead connection pool, not just a live process.

---

## 6. `partpilot-worker`

Single binary, two run modes selected by CLI arg or env var, each a distinct Railway service (or one service with mode chosen per Railway Cron schedule).

### 6.1 Sweep mode

```rust
pub async fn run_sweep(
    sources: &[std::sync::Arc<dyn DataSourceConnector>],
    repo: &std::sync::Arc<dyn PartRepository>,
    policy: &ReconcilePolicy,
    weights: &RiskWeights,
    notifier: &std::sync::Arc<dyn NotificationSender>,
) -> anyhow::Result<()> {
    let mut cursor = None;
    loop {
        let batch = repo.all_parts_paginated(cursor.clone(), 200).await?;
        if batch.is_empty() { break; }

        for part in &batch {
            let mut statuses = Vec::new();
            for source in sources {
                match source.fetch_status(&part.mpn, &part.manufacturer).await {
                    Ok(Some(s)) => statuses.push(s),
                    Ok(None) => {}
                    Err(e) => {
                        record_source_failure(repo, source.source_id(), &e).await;
                    }
                }
            }
            if statuses.is_empty() { continue; }

            let reconciled = reconcile(&statuses, policy);
            let previous = repo.latest_statuses(&part.id).await.ok().and_then(|v| v.first().cloned());
            repo.insert_status(&reconciled).await?;

            let alternates = repo.alternates_for(&part.id).await.unwrap_or_default();
            let risk = score_risk(RiskInputs {
                reconciled_status: &reconciled,
                source_count: statuses.len(),
                alternates_available: alternates.len(),
                days_to_last_time_buy: reconciled.last_time_buy_date
                    .map(|d| (d - chrono::Utc::now().date_naive()).num_days()),
            }, weights);

            if risk_band_increased(previous.as_ref(), &reconciled, &risk) {
                for user in repo.watchers_of(&part.id).await.unwrap_or_default() {
                    let _ = notifier.send_risk_alert(user, part, risk, previous.as_ref().map(|_| RiskBand::Low)).await;
                }
            }
        }
        cursor = batch.last().map(|p| p.id.clone());
    }
    Ok(())
}
```

### 6.2 Enrich mode

Triggered synchronously (via a lightweight internal HTTP call from the server, or a queue message) when a user searches/uploads a BOM containing a part with no existing lifecycle data — fetches from the fastest source only (Mouser/DigiKey, skip the slower PCN parser) so the UI isn't empty, then schedules a full background sweep for that part.

### 6.3 Source health tracking

```rust
pub async fn record_source_failure(
    repo: &std::sync::Arc<dyn PartRepository>,
    source: SourceId,
    error: &ConnectorError,
) {
    tracing::warn!(?source, ?error, "source fetch failed");
    // increments consecutive_failures in `source_health`; a separate
    // low-frequency check alerts (via NotificationSender to an internal
    // channel) if any source exceeds a failure threshold, so a dead adapter
    // doesn't silently zero out data for months.
}
```

### 6.4 Scheduling

Railway Cron triggers the sweep binary on a schedule (e.g., daily at 03:00 UTC) rather than running a perpetual `tokio::time::interval` loop — cheaper (no idle compute between runs) and each run's failure is independently visible in Railway's deployment history.

---

## 7. Database schema (Supabase Postgres)

```sql
-- 0001_init.sql
create extension if not exists pg_trgm;
create extension if not exists "uuid-ossp";

create table sources (
    id serial primary key,
    name text not null unique,        -- 'digikey', 'mouser', 'octopart', 'manufacturer_pcn'
    trust_weight real not null default 0.5
);

create table parts (
    id uuid primary key default gen_random_uuid(),
    mpn text not null,
    manufacturer text not null,
    description text,
    category text,
    created_at timestamptz not null default now(),
    unique (mpn, manufacturer)
);
create index parts_mpn_trgm on parts using gin (mpn gin_trgm_ops);
create index parts_description_trgm on parts using gin (description gin_trgm_ops);

create table lifecycle_statuses (
    id bigserial primary key,
    part_id uuid not null references parts(id) on delete cascade,
    source_id int not null references sources(id),
    stage text not null check (stage in ('active','nrnd','last_time_buy','obsolete','unknown')),
    last_time_buy_date date,
    confidence real not null check (confidence between 0 and 1),
    reported_at timestamptz not null,
    raw_payload_ref text
);
create index lifecycle_part_idx on lifecycle_statuses (part_id, reported_at desc);

create table alternates (
    original_id uuid not null references parts(id) on delete cascade,
    alternate_id uuid not null references parts(id) on delete cascade,
    match_kind text not null check (match_kind in ('manufacturer_cross_ref','form_fit_function','same_family')),
    similarity real not null check (similarity between 0 and 1),
    primary key (original_id, alternate_id)
);

create table watchlist (
    user_id uuid not null references auth.users(id) on delete cascade,
    part_id uuid not null references parts(id) on delete cascade,
    created_at timestamptz not null default now(),
    primary key (user_id, part_id)
);

create table boms (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    filename text,
    uploaded_at timestamptz not null default now()
);

create table bom_lines (
    bom_id uuid not null references boms(id) on delete cascade,
    line_no int not null,
    mpn_raw text not null,
    manufacturer_raw text,
    matched_part_id uuid references parts(id),
    primary key (bom_id, line_no)
);

create table api_keys (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    key_hash text not null unique,
    scopes text[] not null default '{}',
    created_at timestamptz not null default now()
);

create table source_health (
    source_id int primary key references sources(id),
    last_success_at timestamptz,
    consecutive_failures int not null default 0
);
```

```sql
-- 0003_rls_policies.sql
alter table watchlist enable row level security;
alter table boms enable row level security;
alter table bom_lines enable row level security;
alter table api_keys enable row level security;

create policy "users manage own watchlist" on watchlist
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "users manage own boms" on boms
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "users read own bom lines" on bom_lines
    for select using (
        exists (select 1 from boms where boms.id = bom_lines.bom_id and boms.user_id = auth.uid())
    );

create policy "users manage own api keys" on api_keys
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- parts, lifecycle_statuses, alternates, sources: public read, writes via
-- service role only (server/worker connect with the service role key, which
-- bypasses RLS by design — never expose the service role key to the client).
alter table parts enable row level security;
create policy "public read parts" on parts for select using (true);

alter table lifecycle_statuses enable row level security;
create policy "public read lifecycle" on lifecycle_statuses for select using (true);

alter table alternates enable row level security;
create policy "public read alternates" on alternates for select using (true);
```

Migrations run via the Supabase CLI from files checked into `supabase/migrations/` as the single source of truth for schema. Use `supabase db push` for linked projects and never hand-edit the schema through the Supabase dashboard in a way that isn't captured in a migration file.

---

## 8. `partpilot-client`

- **Auth**: Supabase JS client handles login/session/token refresh only. All part/BOM/watchlist data goes through the axum API.
- **API layer** (`src/api/client.ts`): thin `fetch` wrapper that reads the current Supabase session, attaches `Authorization: Bearer <access_token>`, and normalizes error responses into a typed `ApiError`.
- **State**: React Query for all server state — part search results, BOM reports, watchlist. Caching matters here specifically because lifecycle data changes slowly (daily sweep cadence), so aggressive refetch-on-navigation would be wasted requests; a `staleTime` of several hours is reasonable for part detail queries.
- **Pages**:
  - `Search.tsx` — MPN/description search, debounced input against `/v1/parts/search`.
  - `PartDetail.tsx` — reconciled status, risk badge, per-source history table (collapsed by default), alternates list.
  - `BomUpload.tsx` — CSV/Excel drop zone, POST to `/v1/boms`, then a sortable-by-risk-band results table.
  - `Watchlist.tsx` — dashboard of watched parts with current risk band, add/remove controls.
- Reuse the `ThemedIcon.jsx` pattern and existing sky-blue Material theme for visual consistency with prior work.

---

## 9. `partpilot-kicad-plugin`

- Standard `pcbnew.ActionPlugin` subclass, packaged as a `.kicad_pcm` for the KiCad Plugin and Content Manager.
- **Flow**: read the current board's BOM (via `pcbnew` footprint fields, or an exported BOM CSV) → batch the MPNs → call `GET /v1/kicad/lookup` per part (or a batch variant added to the server if the plugin's part counts get large) → render results in a simple `wx`/Tk dialog with inline risk flags.
- **Auth**: a long-lived API key generated from the client's account settings page (`api_keys` table), pasted once into `config_dialog.py` and stored in KiCad's plugin config directory. No interactive login flow inside KiCad.
- Keep the plugin thin — no reconciliation or risk-scoring logic duplicated here; it only renders what the server returns. This keeps the plugin's surface area small enough to plausibly get external contributors later (see ADR-001's revisit condition).

---

## 10. CI/CD

`.github/workflows/rust-ci.yml` (path-filtered to `crates/**`):
```yaml
name: rust-ci
on:
  pull_request:
    paths: ['crates/**']
  push:
    branches: [main]
    paths: ['crates/**']
jobs:
  check:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env: { POSTGRES_PASSWORD: postgres }
        ports: ['5432:5432']
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
      - run: supabase db push --db-url postgres://postgres:postgres@localhost/postgres
      - run: cargo check --workspace
      - run: cargo clippy --workspace -- -D warnings
      - run: cargo test --workspace
      - name: enforce engine has no adapter dependencies
        run: |
          if cargo tree -i partpilot-engine -p 'adapter-*' 2>/dev/null | grep -q .; then
            echo "engine crate must not be depended on by adapters in the wrong direction" && exit 1
          fi
```

`.github/workflows/client-ci.yml` (path-filtered to `client/**`): `npm ci`, `npm run lint`, `npm run build`.

`.github/workflows/deploy.yml`: on push to `main`, trigger Railway deploys for `partpilot-server` and `partpilot-worker` via Railway's GitHub integration (auto-deploy per service, scoped to its own root directory — no custom script needed beyond configuring each Railway service's source directory in the Railway dashboard).

---

## 11. Deployment (Railway + Supabase)

| Service | Source dir | Trigger | Key env vars |
|---|---|---|---|
| `partpilot-server` | `/` (bin: `partpilot-server`) | always-on, auto-deploy on push to `main` | `DATABASE_URL` (pooled), `SUPABASE_JWKS_URL`, `NOTIFY_API_KEY`, `CORS_ALLOWED_ORIGIN` |
| `partpilot-worker-sweep` | `/` (bin: `partpilot-worker --mode sweep`) | Railway Cron, daily 03:00 UTC | `DATABASE_URL` (direct), `DIGIKEY_CLIENT_ID/SECRET`, `MOUSER_API_KEY`, `OCTOPART_API_TOKEN`, `NOTIFY_API_KEY` |
| Supabase project | external | n/a | Postgres, Auth, Storage — not hosted on Railway |
| Client | `client/` | static host (Vercel/Netlify/Cloudflare Pages), separate from Railway | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_BASE_URL` |

Use Supabase's pooled (pgbouncer) connection string for the server's many short-lived request-scoped connections, and the direct connection string for the worker's longer batch transactions to avoid pgbouncer's transaction-mode limitations with long-running writes.

---

## 12. Testing strategy summary

| Layer | Approach |
|---|---|
| `partpilot-engine` | Pure unit tests, table-driven, no DB/network — this is where correctness matters most and is cheapest to verify |
| Adapters | Contract tests against recorded fixtures (`wiremock` or checked-in JSON responses) rather than live API calls in CI; a small manual/scheduled smoke test against real APIs, separate from the main CI run |
| `partpilot-server` | Integration tests spinning up the router with a test Postgres (via `sqlx::test` or a Docker service in CI), hitting routes with `axum::body::Body` requests |
| `partpilot-worker` | Unit tests on `sweep`/`enrich` logic with mock `DataSourceConnector`/`PartRepository` implementations (trivial thanks to the port traits) |
| Client | Component tests for risk-band rendering logic; light end-to-end smoke test against a staging server |
| KiCad plugin | Manual test matrix across KiCad versions before each PCM release; the plugin's logic is thin enough that automated testing has limited payoff relative to its Python/GUI surface |

---

## 13. Build order

1. `partpilot-engine`: domain types + `normalize` + `risk` — pure, fully unit-testable with no DB.
2. Supabase repository + schema (section 7); minimal axum server exposing just `GET /v1/parts/:id` against seeded data.
3. `adapter-mouser` (simplest auth) + `partpilot-worker` sweep mode end-to-end for a handful of seeded parts.
4. `reconcile` once ≥2 real sources disagree on a real part — tune the policy against real data rather than imagined cases.
5. React client search + detail view against the now-working API.
6. BOM upload + risk report.
7. `adapter-digikey`, `adapter-octopart`, `adapter-pcn-parser` — expand source coverage.
8. `match_alt` + alternates UI.
9. KiCad plugin — smallest surface area, depends on an API that should be stable by this point.
