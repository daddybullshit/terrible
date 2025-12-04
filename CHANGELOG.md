# Changelog

All notable changes to this project will be documented in this file. This format follows the Keep a Changelog convention with an `Unreleased` section for work on `main`.

## Unreleased

### Added
- Multi-parent class inheritance with ordered merges, cycle detection, and resolved hierarchy metadata in canonical outputs.
- Inheritance- and schema-aware template helpers (for example, `inherits`, `inherits_any/all`, `filter_inherits`, `class_lineage`, `schema_required`, `schema_props`) to make templates multi-inheritance friendly.
- Validation and canonical exports now include merged class definitions and schemas to aid debugging.
- CLI can compose multiple stacks (positional stacks or repeatable `--stack`) with optional `--classes-from`/`--instances-from` sources; templates/classes/instances load in declared order (no alphabetical resorting).
- Build output controls: `--build-root`, `--build-name`, `--build-dir`, and `--hash/--no-hash` to customize build directory location/name and hash suffixing.

### Changed
- Documentation refreshed for the new inheritance model, helper set, and deterministic multi-stack CLI (README, build/CLI guide, data model, validation, template syntax).
- Defaults stack requirement removed; multi-stack builds use a hash-based build directory name (configurable via new build-dir flags); ordering is strict by CLI position.
