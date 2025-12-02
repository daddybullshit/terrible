# Terrible

Terrible converts structured data into real outputs: provide a stack (a folder of JSON classes, object instances, and templates), and the CLI generates text, static HTML pages, configuration files, or code—anything you can imagine. A stack stays flexible by mixing instance definitions (`instances/*.json`), optional class defaults (`classes/*.json`), and templates (`templates/**`) that consume them, making the system a general-purpose generator for any text-based artifacts.

## Installation
- Prerequisite: Node.js (v18+ recommended).
- Install dependencies: `npm install` (or `npm ci` if using the lockfile).
- Make the CLI executable: `chmod +x bin/terrible`.

## Usage
- Build a stack: `./bin/terrible build -s stacks/recipes` (optional defaults override: `-d path/to/defaults`)

Commands may be run from any directory; stack paths are resolved relative to the repository root. Outputs are written to `build/<stack>-<hash>/...`.

## Repository Layout
- `scripts/terrible.sh`: entrypoint for the build command in `scripts/`.
- `js/`: build pipeline (`build.js`), stack hashing (`stack_paths.js`), shared utilities.
- `defaults/templates/`: base templates; stacks may override via `<stack>/templates/**`.
- `defaults/instances/`: baseline object instances merged before `<stack>/instances/` (recursive load, depth-first then alphabetical).
- `defaults/classes/`: default class definitions (recursive load, depth-first then alphabetical) merged by `class` before inheritance.
- `defaults/globals.json`: shared global values applied before stack-specific `_globals` entries.
- `stacks/`: stack definitions under `<stack>/instances/` (recursive load, depth-first then alphabetical); files without an `id` are treated as `_globals`.
- `docs/`: public documentation for this repository (e.g., `docs/template-syntax.md`, `docs/roadmap.md`).
- `build/`: generated outputs (`<stack>-<hash>/...`); safe to regenerate.

## Behavior Notes
- Template outputs remain within the build root; destinations starting with `/` are interpreted relative to the build root.
- Templates render through Handlebars (HTML escaping disabled) using a `resolve` helper. `{{ key }}` and `{{ key|default }}` are rewritten to `resolve` with resolution order: stack object → `_globals` (from defaults and stack) → environment variables → provided default; unresolved keys emit a warning. Cross-object lookups use `{{otherId.field}}`.
- `_globals` is a reserved stack object for shared values. It participates in placeholder resolution but is not rendered directly. Data without an explicit `id` also maps to `_globals`. All stack objects are exposed under `stack` for helper-driven templates.
- Stack objects may declare `tags` (string or array); the loader aggregates ids into `_tags.<tag>` and `_tags._entries` for iteration. `_objects._entries` lists non-reserved objects with their tags.
- Stack objects may declare a single `class` (string). Class definitions in `defaults/classes/` (overridable in `<stack>/classes/`) are merged by `class`, then inheritance merges parent before child via deep merge (arrays concatenate with de-duplication). Class tags merge into object tags. Resolved class data is available via the `_classes` reserved object.
- Reserved overrides: JSON files with reserved ids (e.g., `_objects`, `_globals`) under `defaults/instances/` or `<stack>/instances/` deep-merge into generated reserved objects while pipeline-owned fields (`id`, `build`, `_entries`) remain authoritative. Files load recursively with deterministic ordering.
- File names under `instances/` are arbitrary; the `id` inside each JSON file controls merging. All `.json` files load recursively, ordered by depth (deeper wins) then alphabetically. Shared ids deep-merge with deeper paths taking precedence.
- Keep secrets out of object definition files. Provide sensitive values through environment variables (or a local `.env` loaded by the CLI) and reference them via the `resolve` helper in templates.

## Documentation
- Template rules: `docs/template-syntax.md`.
- Roadmap: `docs/roadmap.md`.
