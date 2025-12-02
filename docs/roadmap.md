# Roadmap

This roadmap summarizes the planned evolution of the build system and template tooling for public consumption. Detailed working notes and internal design discussions are maintained separately.

## Current State
- Deterministic loader and renderer: depth-first then alphabetical merge, class inheritance with tag propagation, reserved indices (`_tags`, `_objects`, `_classes`, `_reserved`), canonical export to `build/<stack-hash>/canonical.json`.
- `_globals` supports `build` entries and can trigger outputs.
- Defaults are intentionally minimal; stacks are expected to be self-contained, with `-d` allowing an alternate defaults path.
- Templates use a stable context (`obj`, `_globals`, `stack`, resolved `classes`); `{{#file}}` emits files from the current context without side effects.
- Demo coverage includes `stacks/recipes` (HTML site with tag and difficulty pages that mirror template/output paths).

## Near-Term Focus
1) **Core data model hardening**: finalize canonical object shape, tighten merge and ordering rules, add validation/lint with fatal vs warning tiers, and improve logging context.
2) **Templating safety and ergonomics**: confirm placeholder resolution and cross-object lookup rules, document merge visibility in `_objects`, and add optional template-level checks for missing or unsafe values.
3) **Build orchestration**: clarify build triggers (per-object and global) and output path rules; ensure multi-file emission via `{{#file}}` has defined guarantees.
4) **Hook and scripting design (spec-first)**: define hook types, execution order (global → class → instance), script discovery/attachment, canonical representation, and safety controls for filesystem/env/network access.
5) **Hook runtime (Phase A)**: implement build-time hooks (`onLoadComplete`, `onPreRender`, `onRenderInstance`, `onPostRenderFile`, `onFinalizeBuild`) with controlled mutation APIs and reserved index rebuilds before writing `canonical.json`.
6) **Bundles and helpers (Phase B/C)**: add template-time helpers and produce runtime/template/remote bundles with a minimal toolchain and optional minification/namespacing.
7) **Remote packaging (Phase D)**: opt-in packaging for remote execution targets, including deployment metadata and documentation.
8) **Performance and determinism**: introduce caches for scanning/merging, determinism guardrails (logging external calls, seeding randomness), and optional debugging artifacts.
9) **Documentation and UX**: keep README and template syntax docs aligned with finalized behavior; add examples for hooks, bundles, and reserved overrides.

## Milestones and Exit Criteria
- **M1 – Core stable**: canonical export locked, validation/lint in place, merge rules documented, logging upgraded, template/path safety checks defined.
- **M2 – Build ergonomics**: build trigger contract documented, multi-file emission rules defined, documentation reflects canonical object shape.
- **M3 – Hook contract**: hook API/spec documented, script discovery and safety model agreed.
- **M4 – Hook runtime (Phase A)**: build-time hooks implemented with deterministic order and mutation support; regression checks updated.
- **M5 – Bundles and helpers (Phase B/C)**: template-time helpers available; runtime/template/remote bundles produced with opt-in minify/namespacing.
- **M6 – Remote packaging (Phase D)**: remote bundles are opt-in, packaged with deployment metadata and guidance.
- **M7 – Performance and determinism**: caching and determinism aids implemented; non-deterministic sources surfaced in logs; documentation updated accordingly.

## Ordering Principles
- Execute scripting features only after core stability (M1/M2) is complete.
- Complete hook design before implementation to reduce churn.
- Defer bundling and remote packaging until after the hook contract is stable to avoid coupling to early tooling choices.
