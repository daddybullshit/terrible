# Template Syntax and Build Rules

The build system renders text templates using Handlebars with a custom `resolve` helper. Stack definitions load from JSON files (defaults merged before stack files), and `global` is treated as a stack object (`id: "global"`). The loader also generates `global.objects`, a keyed map of every non-reserved stack object (id, class, resolved properties) for template use. Helpers such as `values`, `group_by`, `sort_by`, and `where` let templates derive ordered views, tag clouds, or other aggregations from that map. Every file under a `templates/` directory (defaults or stack) is treated as a template key (extension-agnostic); stack templates override defaults when the relative path matches. The `canonical.json` emitted in each build is marked `canonicalVersion: 0.0.0-alpha` and `canonicalStability: experimental`—the structure may change without version bumps during early development.

## Placeholders
- Prefer `{{resolve "key"}}` or `{{resolve "key" "default"}}` for stack-aware lookups.
- Resolution order: object value (stack definitions overriding `defaults/instances`) → `global` stack object (merged from `defaults/global.json` plus any files whose `id` is `global`) → environment variables (key, then uppercase) → provided default → leave placeholder intact and emit a warning.
- Block/context values passed via helpers (e.g., hash args to `{{#file}}`) are checked before the current stack object to honor explicitly supplied values.
- Cross-object references: `{{otherId.field}}` pulls `field` from another stack object with `id` of `otherId`; logs a warning if the object or field is missing.
- Keys are simple word characters (`\w`); defaults are used verbatim and are passed as strings to the helper.

## Handlebars features
- The renderer disables HTML escaping (`noEscape`) and exposes the standard Handlebars surface (block helpers, conditionals, partials).
- Template context merges `global` first, then the current stack object. `global` is also available explicitly (for example, `{{global.site_name}}`), and all stack objects are accessible under `stack` (for example, `{{stack.someId.foo}}`). Helpers such as `values`, `group_by`, `sort_by`, `where`, and `where_includes` operate on these plain objects so templates can assemble their own derived structures without relying on special reserved ids.
- Environment variables resolve through `resolve`; use `{{resolve "ENV_VAR"}}` for explicit lookups when bypassing automatic rewriting.

## Stack JSON structure
- Location: default objects live in `defaults/instances/` (all `.json` files loaded recursively, sorted by depth then alphabetically); stack-specific objects belong in `<stack>/instances/` (also loaded recursively/depth-first). Filenames are arbitrary; when present, the `id` inside each file uniquely identifies the object and controls overrides, and files without `id` merge into `global`. When multiple files share an `id`, they deep-merge with deeper paths winning. The repo ships an empty scaffold in `defaults/` so real defaults can be provided via `-d <path>`; missing defaults directories are allowed.
- Each object instance file may define:
  - `id`: identifier for logging and default filenames. Files that omit `id` are treated as `global`.
- Optional fields:
  - `build`: array of build items. If omitted or invalid, it defaults to an empty array (no files rendered for that object).
- Any other fields you need (for example, `tags`): stored verbatim on the object and visible to templates; the core does not normalize or special-case them.
  - `class`: string. If provided, the loader applies defaults from that class definition (see Classes below).
- `global` entries are optional; if present, they must be valid JSON. Parse errors (in any file with `id` `global`, `defaults/global.json`, or `defaults/instances/global.json`) abort the build. Put `global` data in stack instances or defaults instances as needed; files without an `id` are treated as `global`.
- Default instance files in `defaults/instances/` load first; stack-local instance files override entries with the same `id` and add new ones.
- `global` is a reserved stack object id used for shared values; it may include `build` entries to render global outputs. Files that omit an `id` are treated as `global`. The pipeline automatically attaches `global.objects`, a keyed map of `{ id, class, properties }` entries for every non-reserved stack object (object properties win; class defaults fill gaps), plus `global.classes` (map keyed by class name) and `global.classEntries` (array of `{ class, parent, properties }`). Use helpers such as `values`, `group_by`, `sort_by`, `where`, `where_includes`, or `filter_inherits` to slice those lists inside templates.
- No additional reserved objects are generated. All metadata (objects, classes, and any diagnostic data) is attached to `global`, so stacks can freely name their own objects without colliding with the pipeline.

## Built-in templates and example stacks
- The repository only ships empty scaffolding under `defaults/`; stacks are expected to provide their own templates.
- Recipe demo (`stacks/recipes`) illustrates the pattern: `templates/index.html`, `templates/styles.css`, and `templates/recipes/recipe.html` render to `index.html`, `assets/styles.css`, `recipes/*.html`, plus generated `tags/*.html` and `difficulty/*.html` via the `file` helper. Template folder structure mirrors the output folder structure.
- Templates render with a stable context: `obj` (current stack object), `stack` (plain object map, including `global`), `global`, and resolved `classes`. Convenience aliases: `objects` for `global.objects` and `classes` for `global.classes`. Treat these maps as keyed objects; use helpers such as `values`, `group_by`, `sort_by`, `includes_any`, `filter_inherits`, `where`, or `where_includes` to iterate or filter. The `{{#file}}` helper renders using the current context only and does not mutate the canonical object.

## Helper reference
- `values(mapOrArray)`: convert a keyed map such as `global.objects` into a deterministically sorted array for iteration.
- `group_by(list, path)`: group entries by the value(s) at `path` (array values produce one group per entry) and return `{ key, items }` objects sorted by key.
- `sort_by(list, path)`: sort a list ascending by the value at `path` (locale/number aware; entries with missing values sort last).
- `filter_inherits(list, className, classesObj)`: keep entries whose `class` inherits from `className`.
- `where(list, path, value)`: filter `list` to entries whose `path` equals `value` (omit `value` to keep truthy entries).
- `where_includes(list, path, needle)`: filter `list` to entries whose `path` (string or array) includes `needle`.
- `where_includes_any(list, path, ...needles)`: keep entries whose `path` includes at least one of the provided needles.
- `where_includes_all(list, path, ...needles)`: keep entries whose `path` includes all provided needles.
- `includes_any(list, ...needles)`: true if any `needle` is found in `list` (array).
- `includes_all(list, ...needles)`: true if all `needles` are found in `list` (array).
- `default_list(value)`: return `value` if it is an array; if it is an object, return its values; otherwise return `[]`.
- `compact(list)`: remove falsy entries from a list-like value.
- `uniq(list)`: de-duplicate entries while preserving order.
- `slugify(value)`: lowercases and hyphenates text (`"Hello World"` → `hello-world`).
- `title_case(value)`: lowercases then capitalizes words, converting separators to spaces.
- `eq(a, b)`, `and(a, b, ...)`, `default(value, fallback)`, `identity(value)`, `length(value)`: small utilities for comparisons and truthiness checks.
- `concat(...args)`: concatenate arguments into a string (null/undefined drop to empty string).
- `json(value)`: stringify a value with indentation.
- `array(...args)`: build an array from arguments (useful for quick lists in templates).
- `file(filename, hash?)`: block helper that writes an additional file at `filename` (resolved relative to the build root using the same safety checks as top-level build items); collects outputs in memory and writes after the parent template renders. Hash values become additional context fields.

## Naming conventions
- JSON data (instances/classes) uses `snake_case` keys and templates should reference them verbatim.
- Helpers exposed to templates are `snake_case` (`values`, `group_by`, `sort_by`, `where`, `where_includes`, etc.).
- Template context aliases use `snake_case` (`objects`, `classes`); file/output paths prefer lowercase with hyphens or snake.
- JS implementation code remains `camelCase` internally for functions/variables.

## Build items
- String item: `"templates/page.html"`
  - Uses `templateKey` as lookup.
  - Output filename defaults to `<id><ext>` where `<ext>` comes from the template key (`page.html` → `.html`).
  - Output directory defaults to the first segment of the template key (`templates/` in this example), under the build root; if the template key has no directory segment, outputs land directly in the build root.
- Object item: `{ "<templateKey>": "<outputPath>" }`
  - `templateKey`: path into `defaults/templates/` (for example, `site/index.html` or `config/service.conf`).
  - `outputPath`: destination relative to the build root.
    - Leading `/` means “relative to build root” (e.g., `"/foo.txt"` → `build/.../foo.txt`, `"/docs/bar.md"` → `build/.../docs/bar.md`).
    - Subdirectories are allowed (e.g., `"folder/foo.txt"`).
    - Must not be absolute or contain `..`; violations log an error and skip writing.

## Output placement rules
- Build root: `build/<stackName>-<hash>/`.
- If `outputPath` (object form) includes directories or starts with `/`, that path is used relative to the build root.
- If no path is specified (string form or object with bare filename), the first segment of `templateKey` becomes the subfolder (for example, `site/` or `config/`). If the template key has no folder, output goes in the build root. Output filenames must not be absolute, contain `..`, or include empty path segments; violations log an error and skip writing.
- Stack-specific template overrides: files in `<stackDir>/templates/**` override files of the same relative path under the global `defaults/templates/` directory.

## Classes
- Location: default definitions in `defaults/classes/` (all `.json` files loaded recursively, depth then alphabetical, merged by `class`); stack-specific overrides/additions in `<stack>/classes/` (same loading/merge rules).
- Shape: each JSON file must specify `class` (string) and may specify `parent` (string). Any other keys are treated as default properties for objects referencing that class.
- Validation: a class definition may embed a JSON Schema under the `schema` key or live in a sidecar file named `<class>.schema.json` (discovered with the same depth + alphabetical ordering as class definitions). Embedded and sidecar schemas merge to produce the effective schema. Instances that declare that class are validated with Ajv during the build; results are written to `build/<hash>/meta/validation.json`, and merged class definitions/schemas are exported to `build/<hash>/meta/class-definitions/` and `/meta/class-schemas/`. Extra fields are allowed by default; pass `--warnings-as-errors` to fail on warnings and `--warn-extra-fields` to flag properties not declared in the schema (recursive, obeys `additionalProperties: false`). Use `--quiet` to suppress printed warnings while still recording them in `validation.json`.

### Validation severity
- JSON parse errors, invalid paths, missing templates, or Handlebars compilation failures are fatal.
- Schema violations are warnings by default; `--warnings-as-errors` promotes all warnings (including extra-field findings) to errors.
- Extra-field detection is opt-in via `--warn-extra-fields`; it respects `additionalProperties` in schemas, follows arrays/combinators (`anyOf`/`oneOf`/`allOf`), and reports dotted paths for nested properties.
- Duplicate output path detections and template override notices are warnings by default; use `--fail-on-collisions` to make output collisions fatal (planned template outputs and helper-emitted files).

### Build pipeline order
- Templates: load defaults then stack, noting overrides.
- Stack data: load/merge objects and classes, apply inheritance, run validation.
- Prepare build dir: clean target, write `canonical.json`, `meta/validation.json`, and merged class definitions/schemas.
- Render outputs: process `build` entries, warn on duplicate paths.
- Finalize: log summary. This ordering is stable and forms the boundaries for future hook points.

### Terminology
- **Field**: a key/value on a stack object (instances/classes). Use this term for data in JSON files or canonical objects.
- **Schema property**: a key defined under `properties` in a JSON Schema; governs validation.
- **Extra field**: a stack field not declared as a schema property (only reported when `--warn-extra-fields` is enabled).
Console output and docs follow this wording to avoid mixing “field”/“property”.
- Merging: stack-level class files override default class files of the same `class` via deep merge (stack values win; nested objects merge recursively; arrays append by default). Inheritance still applies after merge.
- Inheritance: parent properties are merged first, then child overrides (with merged definitions) via deep merge (arrays append). Cycles throw an error; unknown parents emit a warning and merge only the known portions.
- Application: when an object declares `class: "<name>"`, the resolved class defaults are applied; object values win, arrays append by default (use `$reset: true` with a `value` array to replace), and plain objects are deep-merged.
- Tags are not inherited from classes; if you use tags, define them per object (no normalization is performed by the core).
- Null handling: `null` values in class definitions are treated as “no default” (they do not set a value on objects) but still surface on each `global.objects.<id>.properties` entry so you can see missing-but-expected fields.
- Exposure: the resolved class map is available via `global.classes` (map keyed by class name) and `global.classEntries` (array) for templates or documentation.

## Logging and failures
- Warnings: missing placeholder values, missing templates, cross-object lookups that cannot resolve, unsafe or invalid `build` entries (defaulted to empty), or class references that do not exist.
- Errors abort the build: unreadable stack dir, bad JSON, invalid defaults path, invalid output paths, template compilation failures, or attempts to delete outside the build root. Files that omit `id` are merged into `global` rather than failing the build.
