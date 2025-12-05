# Terrible

In everyday work we rarely build just one config or document. One team needs a `dev` variant, another needs `prod`, and ten more people need half-a-dozen permutations of the same thing. Without a clear system, that quickly turns into copy-pasta—every edit has to happen in every file, and it is almost impossible to keep everything aligned.

Terrible keeps those variant-heavy configs and docs from drifting. Describe reusable building blocks in JSON (classes, instances, templates) and the CLI deep-merges them with multi-parent inheritance, validates the result, and renders the text artifacts you actually ship (configs, docs, code, HTML). The magic happens in three parts: deep merging, inheritance, and canonical validation.

**What goes wrong without it**
- Every environment or customer ends up with a slightly different, hand-edited copy; nobody knows which one is right.
- Drift and missing edits creep in because the same change must be made in many places.
- Debugging and audits are guesswork because there is no canonical view of what was built.

**How Terrible helps**
- Deep, deterministic merge with multi-parent inheritance, so you compose behavior instead of duplicating it.
- JSON Schema validation to catch missing/extra/wrong-shaped fields before anything ships.
- Canonical outputs (`build/<stack>-<hash>/canonical.json` plus validation/meta) to prove what was built and why.
- Handlebars templating with safe output path handling to generate the actual text artifacts you need.

**Common scenarios**
- Multi-environment configs (dev/stage/prod) without separate hand-maintained files.
- Per-customer or per-tenant variants while keeping a single product baseline.
- Docs/runbooks that share a core but diverge by role, region, or release channel.
- Infrastructure bundles where you mix base settings with opt-in hardening, observability, or cost profiles.

## Quick start
- Prerequisite: Node.js 18+.
- Install once: `npm install` (or `npm ci`).
- Build: `./bin/terrible build stacks/recipes` (add more stacks positionally or via `--stack`; use `--classes-from`/`--instances-from` to source data from specific stacks). Control outputs with `--build-root`, `--build-name`, `--build-dir`, and `--hash/--no-hash`. Relative stack paths resolve from your current working directory; if missing there we fall back to the repo root (and its parent, for private stacks). Outputs land in `build/<stack>-<hash>/` by default with a `canonical.json` snapshot.
- Tests: `npm test` runs unit + regression tests; `./bin/terrible test` runs regression only.
- Helpful flags: `--warnings-as-errors`, `--warn-extra-fields`, `--fail-on-collisions`, `--quiet`. A root `.env` is loaded automatically if present.

## Usage examples
- Dev vs. prod rollouts: `./bin/terrible build stacks/app --classes-from stacks/app/common --instances-from stacks/app/dev` builds the app from shared base classes and layers on dev-specific settings; swap `dev` for `prod` to get the production variant from the same foundation.
- Regional APIs side by side: `./bin/terrible build stacks/api --instances-from stacks/api/eu stacks/api/us` combines the EU and US API definitions into one canonical build so you can directly compare how the regions differ.
- Per-customer bundles: `./bin/terrible build stacks/app --instances-from stacks/app/tenant-a stacks/app/tenant-b` produces configuration and template outputs for each customer, generating tenant-specific artifacts without separate code paths.
- Role-tuned runbooks: `./bin/terrible build stacks/runbook --instances-from stacks/runbook/oncall stacks/runbook/commander` creates role-tailored runbooks that share the same playbook but render different outputs for on-call staff and commanders.
- Security hardening add-on: `./bin/terrible build stacks/app --classes-from stacks/app/common stacks/app/hardened --instances-from stacks/app/prod` layers a hardened class set (TLS, timeouts, audit sinks) onto the production stack without forking it.
- Pricing/plan tiers: `./bin/terrible build stacks/app --instances-from stacks/app/free stacks/app/standard stacks/app/enterprise` renders per-plan outputs (entitlements/limits) from one product baseline in a single canonical build.
- Partner/white-label outputs: `./bin/terrible build stacks/app --instances-from stacks/app/partner-foo stacks/app/partner-bar` produces partner-branded configs and docs side by side from the same core definition.
- Validate data against classes (no rendering): `./bin/terrible validate stacks/app --classes-from stacks/app/common --instances-from stacks/app/dev --output summary --warnings-as-errors` checks the structure and fields of the dev data against the class definitions and reports issues without producing rendered files.
- CI-friendly outputs: `./bin/terrible build stacks/app --build-root tmp/out --build-name app --no-hash` writes build artifacts to stable, predictable paths that are easy for CI systems to upload or reference.
- Template regression check: `./bin/terrible test stacks/app` verifies that generated templates still match expected outputs, catching unintended changes via regression testing.

## What Terrible gives you
- **Stack model:** recursive classes and instances with deep-merge semantics, multi-parent inheritance, and sidecar JSON Schemas.
- **Templating:** Handlebars with a `resolve` helper, a rich helper set, override-able templates, and safe output path handling.
- **Canonical outputs:** every build writes `canonical.json`, validation reports, merged class definitions, and merged schemas to `build/<stack>-<hash>/meta/`.

## Documentation map
- Data model and stack layout: `docs/data-model.md`
- Build pipeline and CLI usage: `docs/build-and-cli.md`
- Templates, helpers, and output rules: `docs/template-syntax.md`
- Validation and schemas: `docs/validation.md`
- Architecture and internal APIs: `docs/architecture.md`
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
