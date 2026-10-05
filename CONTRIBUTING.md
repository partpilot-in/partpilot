# Contributing to PartPilot

PartPilot is building component intelligence for hardware engineering. Contributions that improve source coverage, component data quality, developer experience, and real-world engineering usefulness are welcome.

## Good places to help

- manufacturer and distributor adapters
- PCN and lifecycle parsing
- component / manufacturer normalization edge cases
- datasheet ingestion
- alternate-part matching
- KiCad integration
- test BOMs and regression cases
- engineering-community source connectors
- documentation

## Before opening a PR

1. Search existing issues and pull requests.
2. For large changes, open an issue first so the approach can be discussed.
3. Keep changes focused.
4. Add or update tests when behavior changes.
5. Update documentation when the public API, configuration, or architecture changes.

## Development

Requirements:

- Rust toolchain
- Node.js 20.19+
- pnpm 12.5.1
- Supabase CLI when working on database migrations

Install dependencies:

```bash
pnpm install
```

Useful checks:

```bash
cargo fmt --all -- --check
cargo test --workspace
pnpm format:check
pnpm lint
pnpm build
```

Run the client:

```bash
pnpm dev:client
```

Run the website:

```bash
pnpm dev:website
```

## Pull requests

A useful PR description should explain:

- what changed
- why it matters
- how it was tested
- any follow-up work or known limitations

Small, reviewable PRs are preferred over unrelated changes bundled together.

## Data-source contributions

When adding an external source:

- keep source-specific behavior inside its adapter
- map responses into engine-owned domain models
- document required credentials and rate limits
- avoid committing secrets, tokens, or customer data
- add fixtures/tests for unusual lifecycle or manufacturer cases where possible

## Reporting component-data problems

Good bug reports include:

- manufacturer
- MPN
- observed result
- expected result
- source/evidence when available
- whether the problem affects one part or a broader component family

Real edge cases are especially useful because they help improve normalization, reconciliation, and scoring behavior.
