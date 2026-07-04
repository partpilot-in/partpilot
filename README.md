# PartPilot

Electronic component obsolescence intelligence platform.

**Stack**: Rust (engine/server/worker), React (client), Supabase (Postgres + Auth + Storage), Railway (hosting), Python (KiCad plugin). Single monorepo, Cargo workspace for the Rust side.

## Documentation

- [Implementation plan](docs/implementation.md)
- [ADR-001: Monorepo over polyrepo](docs/architecture-decisions/001-monorepo-over-polyrepo.md)
- [ADR-002: Supabase over plain Postgres on Railway](docs/architecture-decisions/002-supabase-over-plain-postgres-on-railway.md)

## Repository Status

The repository skeleton has been created from the implementation plan. Source, workflow, migration, script, client, and KiCad plugin files are intentionally empty placeholders until implementation begins.
