# Terrible

Terrible turns JSON-defined stacks into real outputs. Provide classes, instances, and templates and the CLI will merge them into a canonical object, validate it, and render any text-based artifacts you need (HTML, configs, docs, code).

## Quick start
- Prerequisite: Node.js 18+.
- Install once: `npm install` (or `npm ci`).
- Build a stack: `./bin/terrible build stacks/axiom` (override defaults with `-d path/to/defaults`). Run the binary from any directory; outputs land in `build/<stack>-<hash>/` with a `canonical.json` snapshot.
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
- `js/`: build pipeline, loaders, helpers.
- `defaults/`: baseline classes/instances/templates.
- `stacks/`: stack-specific classes/instances/templates.
- `docs/`: end-user documentation.
- `build/`: generated outputs (safe to regenerate).
