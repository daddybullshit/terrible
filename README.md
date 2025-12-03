# Terrible

Terrible converts structured data into real outputs: provide a stack (a folder of JSON classes, object instances, and templates), and the CLI generates text, static HTML pages, configuration files, or code—anything you can imagine. A stack stays flexible by mixing instance definitions (`instances/*.json`), optional class defaults (`classes/*.json`), and templates (`templates/**`) that consume them, making the system a general-purpose generator for any text-based artifacts.

## Installation
- Prerequisite: Node.js (v18+ recommended).
- Install dependencies: `npm install` (or `npm ci` if using the lockfile).
- Make the CLI executable (optional): `chmod +x bin/terrible` (or `js/build.js` if you prefer invoking Node directly).

## Usage
- Build a stack: `./bin/terrible build stacks/recipes` (override defaults with `-d path/to/defaults`; omit the positional argument to use the default of `stacks/recipes`). Invoking `node js/terrible.js ...` uses the same arguments. Running `./bin/terrible` with no args prints usage.
- `.env` loading is handled inside the Node entrypoint; if a `.env` exists at the repo root it will be applied automatically.
- Flags:
  - `--warnings-as-errors`: treat validation warnings as fatal.
  - `--warn-extra-fields`: warn when instances contain fields not declared in their class schema (recursive, respects `additionalProperties: false`).
  - `--fail-on-collisions`: treat duplicate output paths as fatal (covers planned outputs and helper-emitted files).
  - `--quiet`: suppress informational output and warning messages (errors still printed).

Commands may be run from any directory. Stack/defaults paths supplied to the positional `<stack>` and `-d` flags are resolved relative to your current working directory (unless absolute). Build outputs are still written to the repository’s `build/<stack>-<hash>/...` (including a `canonical.json` snapshot of the merged data).

## Repository Layout
- `js/`: build pipeline (`build.js`), stack hashing (`stack_paths.js`), shared utilities and template helpers.
- `defaults/templates/`: base templates; stacks may override via `<stack>/templates/**`.
- `defaults/instances/`: baseline object instances merged before `<stack>/instances/` (recursive load, depth-first then alphabetical).
- `defaults/classes/`: default class definitions (recursive load, depth-first then alphabetical) merged by `class` before inheritance.
- `defaults/global.json`: shared global values applied before stack-specific `global` entries.
- `stacks/`: stack definitions under `<stack>/instances/` (recursive load, depth-first then alphabetical); files without an `id` are treated as `global`.
- `docs/`: public documentation for this repository (e.g., `docs/template-syntax.md`, `docs/roadmap.md`).
- `build/`: generated outputs (`<stack>-<hash>/...`); safe to regenerate.

## Behavior Notes
- Template outputs remain within the build root; destinations starting with `/` are interpreted relative to the build root.
- Every file under a `templates/` directory (defaults or stack) is treated as a template, regardless of extension. Stack templates override defaults when the relative path matches.
- Duplicate output paths warn by default; pass `--fail-on-collisions` to make collisions fatal (both planned template outputs and helper-emitted files).
- Templates render through Handlebars (HTML escaping disabled) using a `resolve` helper. `{{ key }}` and `{{ key|default }}` are rewritten to `resolve` with resolution order: stack object → `global` (from defaults and stack) → environment variables → provided default; unresolved keys emit a warning. Cross-object lookups use `{{otherId.field}}`.
- `global` is the shared stack object for workspace-wide values. Files without an explicit `id` merge into it, and it may include `build` entries to emit pages (for example, landing pages). Its `objects` map lists every non-reserved stack object (id, class, resolved properties) for templates and diagnostics.
- Stack objects may declare whatever fields they need (for example, `tags`), and those values surface directly on `global.objects.<id>.properties` without any special treatment. Treat `global.objects` as a keyed map and use helpers such as `values`, `group_by`, `sort_by`, `where`, `where_includes`, `where_includes_any`, `where_includes_all`, `includes_any`, `includes_all`, `default_list`, `compact`, `uniq`, `slugify`, and `title_case` to build filtered or ordered views. The core does not treat `tags` (or any other property) as first-class.
- Naming: JSON keys stay `snake_case`; template helpers/aliases use `snake_case` (`values`, `group_by`, `sort_by`, `objects`, `classes`); implementation JS stays `camelCase`; file/output paths prefer lowercase with hyphens or snake.
- Stack objects may declare a single `class` (string). Class definitions in `defaults/classes/` (overridable in `<stack>/classes/`) are merged by `class`, then inheritance merges parent before child via deep merge. Arrays append by default (no de-dupe); set `$reset: true` with a `value` array to replace instead of appending. Class defaults do not inject tags or any other special fields; objects own their data. Resolved class data is available via `global.classes` (map keyed by class name) and `global.classEntries` (array of `{ class, parent, properties }`), so templates can inspect inheritance without relying on reserved objects.
- Validation: classes may include an embedded JSON Schema under the `schema` key or a sidecar `<class>.schema.json` file; both merge to produce the effective schema, and instances of that class are validated with Ajv. Validation results are written to `build/<hash>/meta/validation.json`, and merged class definitions/schemas land in `build/<hash>/meta/class-definitions/` and `build/<hash>/meta/class-schemas/`. Extra fields are allowed by default; use `--warnings-as-errors` for stricter runs and `--warn-extra-fields` to surface fields not declared in the schema.
- Reserved bookkeeping is eliminated; all pipeline metadata (objects, classes, helper lists) lives under `global`. `global` is the only reserved id—other object names are free-form, and templates should rely on `global` plus helpers (`values`, `group_by`, `sort_by`, `filter_inherits`, `where`, `where_includes`, `where_includes_any`, `where_includes_all`) for any diagnostics. Builds delete and recreate the target build directory before writing files.
- File names under `instances/` are arbitrary; the `id` inside each JSON file controls merging. All `.json` files load recursively, ordered by depth (deeper wins) then alphabetically. Shared ids deep-merge with deeper paths taking precedence.
- Keep secrets out of object definition files. Provide sensitive values through environment variables (or a local `.env` loaded by the CLI) and reference them via the `resolve` helper in templates.
- `canonical.json` includes `canonicalVersion` (`0.0.0-alpha`), an explicit `canonicalStability` of `experimental`, and `breakingChangesWithoutVersionBump: true` to signal that the format may change during early development. `buildMeta` records the generation timestamp, stack/defaults paths, stack hash, and build directory name.

## Terminology (consistent wording)
- **Field**: a key/value on a stack object (instances and classes). Use “field” when referring to data in JSON files or canonical objects.
- **Schema property**: a key defined under `properties` in a JSON Schema. Use “schema property” when talking about validation rules.
- **Extra field**: a stack object field not declared as a schema property (when `--warn-extra-fields` is enabled).
This vocabulary is used consistently across README, docs, and console output to avoid mixing “field”/“property”.

## Build pipeline order (future hook boundaries)
1) Load templates (defaults then stack; override detection).
2) Load and validate stack data (merge defaults/stack, apply classes, run validation).
3) Prepare build directory and metadata (canonical.json, validation report, class defs/schemas under `meta/`).
4) Render outputs (with duplicate-path warnings).
5) Finalize (summary/logging). Keep this order stable; future hooks will attach between these steps.

## Documentation
- Template rules: `docs/template-syntax.md`.
- Roadmap: `docs/roadmap.md`.
- Demo stacks: `stacks/recipes` (HTML) and `stacks/validation-suite` (schema/validation-focused).
