# Changelog

All notable changes to this project will be documented in this file. This format follows the Keep a Changelog convention with an `Unreleased` section for work on `main`.

## Unreleased

### Added
- Structured error types (`TerribleError`, `ConfigError`, `PathError`, `ParseError`, `ValidationError`, `MergeError`, `TemplateError`) in `js/core/errors.js` for better debugging and programmatic error handling.
- Unit test suite (`tests/core.test.js`) with 54 tests covering `merge_utils`, `object_utils`, `data_utils`, `errors`, and `fs_utils` modules.
- `logSourceDirs` helper in `build_helpers.js` for consistent source directory logging.
- Separate npm scripts: `test:core` and `test:regression` for targeted test runs.

### Changed
- `fs_utils.js` now throws `ParseError` and `PathError` with rich context (file path, line/column for JSON errors, resolved paths).
- Centralized `asArray` helper in `core/object_utils.js` (previously duplicated across files).
- Moved output writers (`writeCanonical`, `writeValidation`, `writeClassDefinitions`, `writeSchemas`, `writeInstances`) and constants (`CANONICAL`, `OUTPUT_TYPES`) from `build.js` to `core/build_helpers.js`.
- Refactored `build.js`, `stack_loader.js`, `class_loader.js`, and `terrible.js` for reduced complexity (~340 lines removed, 23% reduction).

### Fixed
- Eliminated duplicate `buildCanonicalBase` calls in build commands.

---

### Added (prior unreleased)
- Multi-parent class inheritance with ordered merges, cycle detection, and resolved hierarchy metadata in canonical outputs.
- Inheritance- and schema-aware template helpers (for example, `inherits`, `inherits_any/all`, `filter_inherits`, `class_lineage`, `schema_required`, `schema_props`) to make templates multi-inheritance friendly.
- Validation and canonical exports now include merged class definitions and schemas to aid debugging.
- CLI can compose multiple stacks (positional stacks or repeatable `--stack`) with optional `--classes-from`/`--instances-from` sources; templates/classes/instances load in declared order (no alphabetical resorting).
- Build output controls: `--build-root`, `--build-name`, `--build-dir`, and `--hash/--no-hash` to customize build directory location/name and hash suffixing.
- Shared helper layers split into `js/core/` (canonical/data/merge/fs helpers, services, build helpers) and `js/templates/` (templating engine/helpers), keeping templating-specific logic isolated from general utilities.

### Changed
- Documentation refreshed for the new inheritance model, helper set, and deterministic multi-stack CLI (README, build/CLI guide, data model, validation, template syntax).
- Defaults stack requirement removed; multi-stack builds use a hash-based build directory name (configurable via new build-dir flags); ordering is strict by CLI position.
- Canonical export now exposes `instancesById` (formerly `stackById`), includes `global` as the first entry in `instances`, and template contexts use `instances`/`instancesById` aliases (no legacy stack aliases).
- Stack path resolution prefers the current working directory and falls back to the repo root (and its parent for private stacks), with clearer error messages listing attempted paths.
