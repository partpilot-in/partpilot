# Public / Private Boundary

PartPilot is separating the product's public integration surface from its proprietary decision-intelligence engine.

This document describes the **target architecture**. The migration is in progress; the current repository may still contain legacy engine code while dependencies are being removed.

## Public repository

The public side should contain code that makes PartPilot easy to inspect, integrate with, and build around:

- CLI and developer tooling
- KiCad and future EDA integrations
- API clients and SDKs
- BOM parsing and import/export utilities
- public schemas and component-data contracts
- integration adapters where licensing permits
- examples and test fixtures
- public API documentation
- UI and product surfaces intended to be public

## Private engine

New proprietary decision intelligence belongs outside this repository, including:

- risk and confidence models
- source weighting and evidence ranking
- reconciliation strategy
- alternate-part decision logic beyond public contracts
- engineering change-impact reasoning
- proprietary signal correlation
- customer-specific decision context
- future agent/reasoning systems

The public code should call the engine through a stable API or contract rather than compiling proprietary implementation details directly into public packages.

## Design rule

**Interfaces can be public. Intelligence stays private.**

A public integration should know the shape of a request and response, but should not need the implementation that produced the decision.

For example:

```text
KiCad / CLI / Web / SDK
          |
          v
    PartPilot API
          |
          v
  Private intelligence
          |
          v
 evidence + decision
```

## Contribution rule

Do not add new proprietary scoring weights, ranking heuristics, decision rules, customer-specific data, or private source credentials to this repository.

If a change appears to cross the boundary, discuss the architecture with a maintainer before implementing it.
