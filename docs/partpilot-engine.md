# PartPilot engine

`partpilot-engine` owns PartPilot's domain rules: part-number normalization,
lifecycle reconciliation, alternate matching, risk scoring, and conversion from
risk to the public PartPilot rating. It is a Rust library, not a separate
service. `partpilot-server` calls it directly in the same process, as described
in [partpilot-component-protocols.md](partpilot-component-protocols.md).

## Public input and output

| Engine operation | Input | Output |
|---|---|---|
| `normalize_mpn` | Manufacturer part number text | `NormalizedMpn` |
| `normalize_manufacturer` | Manufacturer name text plus an `AliasTable` | `NormalizedManufacturer` |
| `reconcile` | Lifecycle statuses plus `ReconcilePolicy` | One reconciled `LifecycleStatus` |
| `find_alternates` | Target part and parameters plus a candidate pool | Ranked `MatchCandidate` values |
| `score_risk` | `RiskInputs` plus `RiskWeights` | `RiskScore { value, band }` |
| `rating_from_risk` | A `RiskScore` | Integer PartPilot rating from 0 through 100 |
| `base_rating` | No input | Integer baseline PartPilot rating (`72`) |

The two score scales run in opposite directions:

- `RiskScore.value` is a floating-point value from `0.0` through `1.0`, where
  higher means riskier. Its `band` is `Low`, `Medium`, `High`, or `Critical`.
- The public PartPilot rating is an integer from `0` through `100`, where higher
  is better. `rating_from_risk` calculates
  `round((1.0 - risk.value) * 100)` and clamps out-of-range risk values first.

## Rating without adapters

Adapter data is not available in the server yet, so the server cannot construct
the reconciled lifecycle and sourcing inputs required by `score_risk`. For a
request that does not provide a score, it calls the engine directly:

```rust
let score = partpilot_engine::base_rating();
```

`base_rating` uses the engine's baseline risk value of `0.28` and returns `72`.
This keeps the fallback policy inside the domain engine. The server only stores
or serializes the returned integer; it does not define its own default. An
explicit score supplied by a caller is still accepted and clamped to the API's
`0..=100` range.

When adapters are added, the calling flow becomes:

1. Fetch lifecycle observations through `DataSourceConnector` implementations.
2. Call `reconcile` with those observations and a `ReconcilePolicy`.
3. Call `score_risk` with the reconciled status, source count, alternate count,
   and last-time-buy timing.
4. Call `rating_from_risk` to produce the public `0..=100` rating.

All of these calls remain in-process Rust function or trait-method calls. Only
the adapter implementations perform network I/O.

## Planned component metadata enrichment

Parts now carry a `component_metadata` document shaped by
[`component-cdd.schema.json`](component-cdd.schema.json). It contains the CDD
Identification, Electrical, Mechanical, Thermal, Material, Environmental,
Reliability, Regulatory, Manufacturing, Commercial, Packaging, and
Documentation sections. The field is currently `{}` because datasheet
ingestion is not implemented.

`component_metadata` is canonical for component facts such as lifecycle,
origin, compliance, package, electrical parameters, and reference pricing.
PartPilot score is intentionally separate because it is engine-native output;
BOM quantity and line price are also separate because they are contextual.

The future engine operation will accept the normalized part identity,
designator category, and evidence-bearing candidates extracted by adapters. It
will return a schema-valid component document plus rejected candidates and
diagnostics. The engine will own category applicability, unit normalization,
min/typ/max handling, test conditions, provenance, and conflict resolution. It
will not download or parse source-specific documents itself.

The complete planned pipeline and ownership boundaries are documented in
[`component-metadata-ingestion.md`](component-metadata-ingestion.md).

## Risk-scoring contract

`score_risk` accepts:

```rust
pub struct RiskInputs<'a> {
    pub reconciled_status: &'a LifecycleStatus,
    pub source_count: usize,
    pub alternates_available: usize,
    pub days_to_last_time_buy: Option<i64>,
}
```

The accompanying `RiskWeights` controls the single-source, no-alternates, and
imminent-last-time-buy penalties. The output is:

```rust
pub struct RiskScore {
    pub value: f32,
    pub band: RiskBand,
}
```

The engine clamps `value` to `0.0..=1.0`. Risk bands are low below `0.30`,
medium from `0.30`, high from `0.60`, and critical from `0.85`.
