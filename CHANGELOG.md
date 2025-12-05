# Changelog

All notable changes to this project will be documented in this file. This format follows the Keep a Changelog convention with an `Unreleased` section for work on `main`.

## Unreleased

### Added
- Structured error types (`TerribleError`, `ConfigError`, `PathError`, `ParseError`, `ValidationError`, `MergeError`, `TemplateError`) in `js/core/errors.js` for better debugging and programmatic error handling.
- Centralized terminal formatting utilities in `js/core/format.js` (`fmt`, `step`, `error`, `warning`, `dim`, `success`).
- Unit test suite (`tests/core.test.js`) with 77 tests covering `merge_utils`, `object_utils`, `data_utils`, `errors`, `fs_utils`, `format`, `build_helpers`, `issue_collector`, and `stack_paths` modules.
- Regression test suite (`tests/regression.test.js`) with 14 tests covering build modes, path resolution, golden outputs, `$reset` merging, and validation flags.
- Golden output fixtures (`tests/fixtures/ordered/golden-*.json`) with subset-matching assertions for regression coverage.
- `logSourceDirs` helper in `build_helpers.js` for consistent source directory logging.
- `validateDirs()` function in `stack_paths.js` for early batch path validation with rich error context.
- Issue collector now supports `TerribleError` instances directly, with `addAll()`, `count()`, `errorCount()`, `warnCount()` helpers.
- CLI help now includes usage examples and docs reference epilogue.
- Separate npm scripts: `test:core` and `test:regression` for targeted test runs.

### Changed
- `fs_utils.js` now throws `ParseError` and `PathError` with rich context (file path, line/column for JSON errors, resolved paths).
- `PathError` now includes resolution attempts in context (`input`, `cwd`, `attempts`, `tried`).
- Logger now uses centralized `format.js` and provides `summarize()` method that returns status instead of calling `process.exit()`. Added `silent` option for test scenarios where expected warnings should not appear in output.
- Centralized reserved key constants (`RESERVED_IDS`, `RESERVED_INSTANCE_KEYS`, `RESERVED_CLASS_KEYS`) in `build_helpers.js` with corresponding helper functions.
- Centralized `asArray` helper in `core/object_utils.js` (previously duplicated across files).
- Moved output writers (`writeCanonical`, `writeValidation`, `writeClassDefinitions`, `writeSchemas`, `writeInstances`) and constants (`CANONICAL`, `OUTPUT_TYPES`) from `build.js` to `core/build_helpers.js`.
- Refactored `build.js`, `stack_loader.js`, `class_loader.js`, and `terrible.js` for reduced complexity (~23% code reduction, improved modularity).

### Fixed
- `$reset` objects are now correctly unwrapped for first-occurrence instances (not just during merges). Added `unwrapResets()` function to recursively process `$reset` wrappers.
- Eliminated duplicate `buildCanonicalBase` calls in build commands.
- Removed duplicated color/formatting code between `logger.js` and `build_helpers.js`.

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
