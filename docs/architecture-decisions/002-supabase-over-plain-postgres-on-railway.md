# ADR-002: Supabase over plain Postgres on Railway

**Decision**: use Supabase for Postgres, Auth, and Storage. Railway hosts only the two Rust binaries (server, worker).

**Reasoning**: PartPilot needs real per-user accounts (Important parts and BOM uploads are user-scoped) and Row Level Security tied to those accounts, plus file storage for uploaded BOMs and cached raw source payloads. Supabase bundles Auth (JWT issuance, OAuth, password reset), Storage, and RLS-integrated Postgres for a predictable $25/month base (Pro plan) once past the free tier's auto-pause behavior. Building the equivalent (JWT issuance, password reset flows, S3-compatible storage) on plain Railway Postgres is real, ongoing engineering work that doesn't advance the product's core value. Railway's usage-based Postgres is cheaper in isolation but doesn't include Auth/Storage, so the honest cost comparison is roughly a wash once those are accounted for.

**Revisit when**: PartPilot drops multi-user access entirely (e.g., becomes a single-operator tool where the KiCad plugin's API-key scheme is the only auth surface) — at that point Supabase Auth is unused weight and a lone Postgres instance on Railway with a hand-rolled API-key table is simpler and keeps billing on one platform.
