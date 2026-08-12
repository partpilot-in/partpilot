# Component metadata and datasheet ingestion

PartPilot represents category-aware component data with the twelve-section
document defined by [`component-cdd.schema.json`](component-cdd.schema.json):

1. Identification
2. Electrical
3. Mechanical
4. Thermal
5. Material
6. Environmental
7. Reliability
8. Regulatory
9. Manufacturing
10. Commercial
11. Packaging
12. Documentation

The API property is `component_metadata`. It is stored as `jsonb` on catalog
parts, user-owned parts, and BOM lines. JSONB is deliberate: a CDD property is
not just a scalar. It can carry a value, unit, data type, tolerance, minimum,
typical and maximum values, condition of application, definition, IRDI, and
source. Flattening those properties into database columns would discard that
context and require a migration whenever a category gains another property.

This document is the single source of truth for component characteristics.
Lifecycle status lives at `commercial.lifecycleStatus`, country of origin at
`regulatory.countryOfOrigin`, RoHS/REACH results under `environmental`, package
and dimensional data under `mechanical`, and reference pricing under
`commercial.priceBreaks`. These values are not duplicated as top-level part
columns or API properties. PartPilot score stays separate because it is a
PartPilot-derived assessment rather than a component characteristic. BOM
quantity and BOM line price also stay separate because they describe a project
and procurement context, not the component itself.

`{}` is the valid application-level empty state until enrichment is available.
The client expands that empty document into the category-applicable fields and
renders an em dash for each missing value. A BOM line's nonempty metadata takes
precedence over matched catalog metadata; otherwise the API view falls back to
the catalog document.

## Category applicability

The component category is inferred from the reference designator by the server
when the uploaded BOM has no explicit category. The client uses the same
resolved category label to choose applicable electrical fields. For example,
`C` exposes capacitance, dielectric, polarization, and insulation properties;
`RN` exposes resistance-network ratings and pin count; `U` exposes supply,
logic, switching, pin-count, and ESD properties. All categories retain the
shared CDD sections so new data can be added without changing the API shape.

The component schema remains the canonical definition of field names and value
wrappers. Category applicability is presentation and extraction guidance, not
a second incompatible data model.

## Future datasheet ingestion flow

The future enrichment path will be asynchronous and evidence-preserving:

1. **Discover documents.** Manufacturer and distributor adapters locate the
   authoritative datasheet, revision, application notes, qualification files,
   compliance certificates, and PCNs for the normalized MPN and manufacturer.
2. **Acquire and fingerprint.** The worker downloads each document through the
   relevant adapter, records the source URL, MIME type, retrieval time, content
   hash, and document revision, then stores the immutable raw artifact.
3. **Extract structure.** A datasheet parser extracts text, tables, headings,
   footnotes, diagrams, and page coordinates. OCR is used only for image-only
   pages, and the original page reference is retained.
4. **Generate candidates.** Adapter output contains candidate facts with raw
   value, raw unit, source page/table, surrounding condition text, and extraction
   confidence. Adapters do not decide the final CDD field.
5. **Normalize in the engine.** `partpilot-engine` maps candidates to the CDD
   field applicable to the component category, normalizes units, preserves
   min/typ/max and tolerance, and writes the condition of application and source.
6. **Validate.** The engine validates the document against
   `component-cdd.schema.json`, rejects unknown fields, checks category
   applicability and unit compatibility, and keeps rejected candidates in an
   audit record rather than silently publishing them.
7. **Reconcile evidence.** When sources disagree, the engine ranks manufacturer
   datasheets and certificates above distributor copies, considers document
   revision and freshness, and retains provenance for the selected value.
8. **Persist atomically.** The worker writes the validated
   `component_metadata` document together with source hashes and enrichment
   timestamps. A document hash makes retries idempotent.
9. **Serve unchanged.** `partpilot-server` reads and returns the stored document.
   It does not scrape datasheets or reproduce extraction rules.

## Ownership boundaries

- **Adapters** fetch documents and translate source-specific formats into
  evidence-bearing candidates.
- **partpilot-worker** schedules enrichment, retries failures, and persists the
  accepted result.
- **partpilot-engine** owns category applicability, semantic field mapping, unit
  normalization, validation, and reconciliation.
- **partpilot-server** exposes the persisted contract and applies catalog/BOM
  fallback rules.
- **client** renders the schema and never invents metadata values.

## Example enriched property

```json
{
  "electrical": {
    "capacitance": {
      "value": 100,
      "unit": "nF",
      "dataType": "REAL_MEASURE",
      "tolerance": "±10%",
      "conditionOfApplication": "1 kHz, 1 Vrms, 25 degC",
      "source": "datasheet, page 3"
    }
  }
}
```

No extraction or engine enrichment is implemented yet; the current contract,
storage, API, and UI are the foundation for that later work.
