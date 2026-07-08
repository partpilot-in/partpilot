# PartPilot

Electronic component obsolescence intelligence platform.

**Stack**: Rust (engine/server/worker), React (client), Supabase (Postgres + Auth + Storage), Railway (hosting), Python (KiCad plugin). Single monorepo, Cargo workspace for the Rust side.

## Components

### 1. client

The React frontend (Vite). Everything the user actually sees and clicks — Dashboard, Part Search, Projects/BOM tabs, all built from the shared DataTable, ScoreRing, and other reusable UI components.

The client talks to partpilot-server over HTTP and directly to Supabase only for authentication and session management.

It contains no business logic. Reconciliation, risk scoring, and BOM diffing all happen server-side; the client simply renders the results.

### 2. adapters

The outward-facing edges of the system — one crate per external integration:

* adapter-digikey
* adapter-mouser
* adapter-octopart
* adapter-pcn-parser
* adapter-postgres
* adapter-notify

Each adapter implements a trait defined in partpilot-engine such as:

* DataSourceConnector
* PartRepository
* NotificationSender

Adapters translate between external APIs, authentication methods, and response formats and the engine’s clean domain models.

This is where all source-specific complexity lives:

* Rate limiting
* OAuth flows
* PDF parsing
* API quirks
* Vendor-specific data mapping

Keeping these concerns isolated prevents them from leaking into the rest of the system.

### 3. partpilot-engine

The brain of the system.

Pure business logic with no HTTP server, database driver, or runtime dependencies beyond trait definitions.

Responsibilities include:

* MPN normalization
* Manufacturer normalization
* Lifecycle reconciliation across multiple sources
* Risk scoring
* Alternate part matching

partpilot-engine depends on nothing else in the workspace.

Everything else depends on it.

If Postgres, DigiKey, or any other external dependency changed, this crate would remain largely untouched.

### 4. partpilot-server

The API layer.

An Axum-based binary that wires concrete adapters into the engine’s traits (the composition root) and exposes HTTP endpoints for:

* Part search
* Part details
* BOM upload
* BOM comparison
* Watchlists
* Authentication
* Error handling

The server intentionally remains thin:

* Receive request
* Call engine and repositories
* Format response
* Return result

Very little business logic lives here.

### 5. partpilot-worker

The background processing service.

A separate binary with no HTTP surface that performs scheduled and asynchronous tasks such as:

* Pulling lifecycle updates from external sources
* Reconciling data
* Recomputing risk scores
* Sending notifications and alerts
* Performing on-demand enrichment for previously unseen parts

It runs as an independent Railway service so that slow, rate-limited, or failure-prone ingestion tasks never block the user-facing API.

## Documentation

- [Implementation plan](docs/implementation.md)
- [ADR-001: Monorepo over polyrepo](docs/architecture-decisions/001-monorepo-over-polyrepo.md)
- [ADR-002: Supabase over plain Postgres on Railway](docs/architecture-decisions/002-supabase-over-plain-postgres-on-railway.md)
