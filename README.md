# Terrible

Terrible turns JSON-defined stacks into real outputs. Provide classes, instances, and templates and the CLI will merge them into a canonical object, validate it, and render any text-based artifacts you need (HTML, configs, docs, code).

## Quick start
- Prerequisite: Node.js 18+.
- Install once: `npm install` (or `npm ci`).
- Build: `./bin/terrible build stacks/recipes` (add more stacks positionally or via `--stack`; use `--classes-from`/`--instances-from` to source data from specific stacks). Control outputs with `--build-root`, `--build-name`, `--build-dir`, and `--hash/--no-hash`. Relative stack paths resolve from your current working directory; if missing there we fall back to the repo root (and its parent, for private stacks). Outputs land in `build/<stack>-<hash>/` by default with a `canonical.json` snapshot.
- Tests: `npm test` runs unit + regression tests; `./bin/terrible test` runs regression only.
- Helpful flags: `--warnings-as-errors`, `--warn-extra-fields`, `--fail-on-collisions`, `--quiet`. A root `.env` is loaded automatically if present.

## What Terrible gives you
- **Stack model:** recursive classes and instances with deep-merge semantics, multi-parent inheritance, and sidecar JSON Schemas.
- **Templating:** Handlebars with a `resolve` helper, a rich helper set, override-able templates, and safe output path handling.
- **Canonical outputs:** every build writes `canonical.json`, validation reports, merged class definitions, and merged schemas to `build/<stack>-<hash>/meta/`.

## Documentation map
- Data model and stack layout: `docs/data-model.md`
- Build pipeline and CLI usage: `docs/build-and-cli.md`
- Templates, helpers, and output rules: `docs/template-syntax.md`
- Validation and schemas: `docs/validation.md`
- Changelog: `CHANGELOG.md`
- Roadmap: `docs/roadmap.md`

## Repository layout
- `js/core/`: shared utilities organized by responsibility:
  - `errors.js` — structured error types with codes and context
  - `format.js` — terminal color/formatting utilities
  - `merge_utils.js` — deep merge with `$reset` array semantics
  - `object_utils.js` — array/object helpers (`asArray`, `mapLikeToObject`)
  - `data_utils.js` — path access and list operations
  - `fs_utils.js` — file I/O with structured errors
  - `build_helpers.js` — build constants, output writers, reserved keys
  - `canonical_helpers.js` — class lineage and schema helpers
  - `canonical_api.js` — read-only view and mutator for canonical data
  - `services.js` — service provider for hooks/templates
- `js/templates/`: template engine layer:
  - `handlebars_engine.js` — Handlebars wrapper with template discovery
  - `template_helpers.js` — built-in Handlebars helpers
  - `template_resolution.js` — placeholder/inheritance resolution
  - `template_utils.js` — template loading and rendering
- `js/`: build pipeline and CLI:
  - `terrible.js` — CLI entry point (yargs-based)
  - `build.js` — build orchestration and commands
  - `class_loader.js` — class/schema loading and inheritance resolution
  - `stack_loader.js` — instance loading and merging
  - `stack_paths.js` — path resolution and hashing
  - `validation.js` — Ajv-based schema validation
  - `logger.js` — logging with warning/error tracking
  - `issue_collector.js` — issue collection for validation
- `stacks/`: stack-specific classes/instances/templates.
- `tests/`: unit tests (`core.test.js`, 73 tests) and regression tests (`regression.test.js`, 11 tests).
- `docs/`: end-user documentation.
- `build/`: generated outputs (safe to regenerate).
