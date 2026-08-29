# ADR-001: Monorepo over polyrepo

**Decision**: one Git repository containing all crates, the client, and the KiCad plugin.

**Reasoning**: the domain types in `engine` are a contract shared by the server, the client (via generated/mirrored TypeScript types), and indirectly the KiCad plugin (via the API's JSON shape). With a single contributor, cross-repo PRs to keep three repos in sync add coordination overhead with no corresponding benefit — polyrepo pays off when independent teams need independent release cadences and access control, which doesn't apply here. Cargo workspaces already give crate-level modularity (independent build/test/versioning) without a git-boundary tax. Railway deploys per-service from subdirectories of one repo without friction.

**Revisit when**: the KiCad plugin is published to the official PCM registry and gains outside contributors — it shares no code with the Rust side, so splitting it out then is cheap.
