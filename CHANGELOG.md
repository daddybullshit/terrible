# Changelog

All notable changes to this project will be documented in this file. This format follows the Keep a Changelog convention with an `Unreleased` section for work on `main`.

## Unreleased

### Added
- Multi-parent class inheritance with ordered merges, cycle detection, and resolved hierarchy metadata in canonical outputs.
- Inheritance- and schema-aware template helpers (for example, `inherits`, `inherits_any/all`, `filter_inherits`, `class_lineage`, `schema_required`, `schema_props`) to make templates multi-inheritance friendly.
- Validation and canonical exports now include merged class definitions and schemas to aid debugging.

### Changed
- Documentation refreshed for the new inheritance model and helper set (README, build/CLI guide, data model, validation, template syntax).
