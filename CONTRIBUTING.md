# Contributing to PartPilot

Thanks for helping improve PartPilot.

PartPilot is still early, so small, focused changes are easier to review than large rewrites.

## Before you start

For a bug fix, documentation improvement, test, or small integration improvement, a pull request is welcome.

For a new feature or architectural change, open an issue first so the direction can be agreed on before substantial work begins.

Please read the [Public / Private Boundary](docs/architecture/public-private-boundary.md). Do not add proprietary scoring, reasoning, ranking, customer data, or secrets to the public repository.

## Development checks

Before submitting a pull request, run the checks relevant to your change.

Rust:

```bash
cargo check --workspace
cargo test --workspace
cargo clippy --workspace -- -D warnings
```

Web applications:

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm build
```

If a command is not applicable to the area you changed, note that in the pull request.

## Pull requests

Keep pull requests focused and explain:

- what changed
- why it changed
- how you tested it
- any behavior or API contract that changed

Never commit API keys, tokens, customer BOMs, customer procurement data, private datasheets, or other confidential material.

## Licensing status

A software license has not yet been published for this repository. The maintainers are reviewing the licensing model as the public/private architecture is separated.
