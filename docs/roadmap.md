# Roadmap

This roadmap summarizes the planned evolution of the build system and template tooling for public consumption. Detailed working notes and internal design discussions are maintained separately.

## Current State
- Deterministic loader and renderer: depth-first then alphabetical merge, multi-parent class inheritance (with cycle detection), and canonical export to `build/<stack>-<hash>/canonical.json` with metadata attached to `global`.
- Canonical structure: consistent naming with both array and keyed forms (`classes`/`classesById`, `instances`/`instancesById`); `$reset` semantics work correctly in both instance and class inheritance merges. **Note:** keys are slated to move to snake_case (e.g., `classes_by_id`) with a migration or dual-publish path.
- Validation: class schemas live in sidecar `<class>.schema.json` files (embedded schemas are rejected), merge deterministically, and validate via Ajv. Results land in `build/<hash>/meta/validation.json`; merged class definitions/schemas are exported under `build/<hash>/meta/`. `--warnings-as-errors` flips warnings to fatal; `--warn-extra-fields` surfaces undeclared instance fields; `--quiet` suppresses printed info/warnings (errors still print).
- `global` supports `build` entries, drives placeholder resolution, and exposes `global.objects` (keyed map) and `global.classesById` for templates; helpers such as `values`, `group_by`, `sort_by`, `where`, `where_includes*`, `includes_any/all`, `default_list`, `compact`, `uniq`, `slugify`, and `title_case` handle ordering or aggregation without reserved tag objects.
- Defaults are intentionally minimal; stacks are expected to be self-contained, with `-d` allowing an alternate defaults path.
- Tags are plain user data: no normalization or class-level injection; objects own their `tags` (or any other fields) directly.
- Templates use a stable context (`obj`, `global`, `stack`, resolved classes via `classesById`); `{{#file}}` emits files from the current context without side effects.
- Demo coverage includes `stacks/recipes` (HTML site with tag and difficulty pages that mirror template/output paths).
- Build modes: full (`build`), classes-only (`classes`), instances-only (`instances`), and validate-only (`validate`) with flexible source directory options (`--classes-from`, `--instances-from`, `--templates-from`).

## Near-Term Focus
1) **Strict path resolution**: remove stack/class/instance path fallbacks; enforce cwd-only resolution and fail fast on missing paths (align CLI/docs/examples).
2) **Schema compatibility hardening**: validate instances against every ancestor schema and enforce parent/child schema compatibility over time; add regression coverage and consider schema diff tooling.
3) **Templating safety and ergonomics**: add optional template-level checks for missing or unsafe values; document cross-object lookup edge cases.
4) **Build orchestration**: clarify build triggers (per-object and global) and output path rules; ensure multi-file emission via `{{#file}}` has defined guarantees.
5) **Hook and scripting design (spec-first)**: define hook types, execution order (global → class → instance), script discovery/attachment, canonical representation, and safety controls for filesystem/env/network access.
6) **Hook runtime (Phase A)**: implement build-time hooks (`onLoadComplete`, `onPreRender`, `onRenderInstance`, `onPostRenderFile`, `onFinalizeBuild`) with controlled mutation APIs and reserved index rebuilds before writing `canonical.json`.
7) **Bundles and helpers (Phase B/C)**: add template-time helpers and produce runtime/template/remote bundles with a minimal toolchain and optional minification/namespacing.
8) **Remote packaging (Phase D)**: opt-in packaging for remote execution targets, including deployment metadata and documentation.
9) **Performance and determinism**: introduce caches for scanning/merging, determinism guardrails (logging external calls, seeding randomness), and optional debugging artifacts.
10) **Documentation and UX**: keep README and template syntax docs aligned with finalized behavior; add examples for hooks, bundles, reserved overrides, and canonical key casing changes.

## Milestones and Exit Criteria
- **M1 – Core stable** ✅: canonical export locked with consistent naming (`classes`/`classesById`, `instances`/`instancesById`), validation/lint in place with `--warn-extra-fields` and `--warnings-as-errors`, merge rules documented, `$reset` semantics correct, logging upgraded with `--quiet`/`--silent`. **Note:** canonical key casing will migrate to snake_case in the next milestone; dual-publish/deprecation plan required.
- **M2 – Build ergonomics**: build trigger contract documented, multi-file emission rules defined, documentation reflects canonical object shape, strict path resolution enforced, and schema compatibility/lineage validation integrated (with regression coverage).
- **M3 – Hook contract**: hook API/spec documented, script discovery and safety model agreed.
- **M4 – Hook runtime (Phase A)**: build-time hooks implemented with deterministic order and mutation support; regression checks updated.
- **M5 – Bundles and helpers (Phase B/C)**: template-time helpers available; runtime/template/remote bundles produced with opt-in minify/namespacing.
- **M6 – Remote packaging (Phase D)**: remote bundles are opt-in, packaged with deployment metadata and guidance.
- **M7 – Performance and determinism**: caching and determinism aids implemented; non-deterministic sources surfaced in logs; documentation updated accordingly.

## Ordering Principles
- Execute scripting features only after core stability (M1/M2) is complete.
- Complete hook design before implementation to reduce churn.
- Defer bundling and remote packaging until after the hook contract is stable to avoid coupling to early tooling choices.
