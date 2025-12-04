# Validation and schemas

Terrible validates instances against their class schemas after merging defaults and inheritance. Validation is strict enough to catch bad data but configurable so you can decide which findings are fatal.

## Schemas
- Each class may define a sidecar `<class>.schema.json`. Embedded schemas inside class JSON are disallowed; missing sidecars are treated as empty schemas and emitted to `meta/class-schemas/`.
- Schemas merge in the same deterministic order as class data and stack order. Multi-parent inheritance merges parent schemas first, then the child.
- `global.class_schemas` (written under `build/<stack>-<hash>/meta/`) captures the effective schema per class for downstream consumers.

## Validation behavior
- Instances validate against the resolved schema for their class.
- Warnings by default:
  - Schema violations (missing required fields, type mismatches, etc.).
  - Extra fields when `--warn-extra-fields` is enabled (respects `additionalProperties` and traverses nested combinators).
  - Unknown classes (instance references a class that was not loaded).
- Errors (always fatal): malformed JSON, unreadable paths, template compilation failures, output path violations, inheritance cycles.

## Tuning strictness
- `--warnings-as-errors`: promote all warnings to fatal errors.
- `--warn-extra-fields`: surface fields not declared in the schema (useful for drift detection).
- `--fail-on-collisions`: treat duplicate output paths as fatal (planned outputs and helper-emitted files).

## Reports and diagnostics
- `build/<stack>-<hash>/meta/validation.json` records all warnings and errors.
- `build/<stack>-<hash>/meta/class-definitions/` and `meta/class-schemas/` store the merged definitions and schemas that were used for validation.
- Canonical snapshots (`canonical.json`) include class metadata and the class hierarchy so templates and downstream tools can reason about inheritance.
