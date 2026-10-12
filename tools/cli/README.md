# PartPilot CLI

Inspect part lifecycle, RoHS, REACH and component data from the PartPilot API.

Install from the repository root (requires Rust with edition 2024 support):

```sh
cargo install --path tools/cli --locked
partpilot scan ams1117
partpilot analyse bom.xlsx
partpilot analyse bom.csv
```

Or run without installing:

```sh
cargo run -p cli -- scan ams1117
```

`scan` groups each part into readable overview, specifications, compliance, availability and packaging tables. Distributor offers and price breaks have dedicated tables. Nested properties use readable labels and units; duplicate identity fields and schema bookkeeping are omitted. Document links are deduplicated and kept intact for copying. Multiple results also get a comparison table. Search can return multiple variants; use `--manufacturer AMS` to filter and `--limit 5` to change the result count (default 10, maximum 100).

`analyse` reads comma-, semicolon- or tab-separated CSV, or the first worksheet of XLSX. It recognizes common MPN, manufacturer, quantity and reference/designator headers within the first ten rows. MPN is required on every nonempty data row. Quantity defaults to 1 and must otherwise be a positive whole number. Duplicate mapped headers and invalid rows are rejected before requests are sent.

The BOM table preserves every input row and shows matched MPN/manufacturer, lifecycle, RoHS, REACH and lookup status. Identical MPN/manufacturer lookups are cached within each run. Only a unique normalized MPN or alternate-part-number match is accepted; ambiguous and similar-only search results remain unresolved. Add a manufacturer column to disambiguate manufacturers. Unknown compliance is shown as `Unknown`, never as `No`. Use `scan` for full properties or to investigate unresolved rows.

Both commands call the public `GET /v1/parts/search` endpoint at `https://api.bestpartpilot.com`. No login is required and no saved BOM is created. Search results already contain the part metadata exposed by the detail endpoint.

```sh
partpilot --api-url http://localhost:8080 scan AMS1117
PARTPILOT_API_URL=http://localhost:8080 partpilot analyse bom.csv
partpilot --timeout 120 analyse bom.xlsx
```

The per-request timeout defaults to 60 seconds. `analyze` is also accepted. Tables wrap to terminal width (100 columns when redirected), and progress/errors go to stderr. Exit status is 0 on success, 1 for API/input failures, no search results or unresolved BOM rows, and 2 for invalid command syntax. Individual API failures do not prevent remaining BOM rows from being processed.

Run tests with `cargo test -p cli`.
