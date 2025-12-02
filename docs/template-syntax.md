# Template Syntax and Build Rules

The build system renders text templates using Handlebars with a custom `resolve` helper. Stack definitions load from JSON files (defaults merged before stack files), and `_globals` is treated as a stack object (`id: "_globals"`). Plain placeholders such as `{{ foo }}` are automatically rewritten to `{{resolve "foo"}}` to preserve compatibility while enabling additional Handlebars logic. The loader aggregates `tags` into a `_tags` object for template use.

## Placeholders
- Format: `{{ key }}` or `{{ key|default }}` (automatically routed through the `resolve` helper).
- Resolution order: object value (stack definitions overriding `defaults/instances`) → `_globals` stack object (merged from `defaults/globals.json` plus any files whose `id` is `_globals`) → environment variables (key, then uppercase) → provided default → leave placeholder intact and emit a warning.
- Block/context values passed via helpers (e.g., hash args to `{{#file}}`) are checked before the current stack object to honor explicitly supplied values.
- Cross-object references: `{{otherId.field}}` pulls `field` from another stack object with `id` of `otherId`; logs a warning if the object or field is missing.
- Keys are simple word characters (`\w`); defaults are used verbatim and are passed as strings to the helper.

## Handlebars features
- The renderer disables HTML escaping (`noEscape`) and exposes the standard Handlebars surface (block helpers, conditionals, partials).
- Template context merges `_globals` first, then the current stack object. `_globals` is also available as `_globals`, and all stack objects are accessible under `stack` (for example, `{{stack.someId.foo}}`).
- Environment variables resolve through `resolve`; use `{{resolve "ENV_VAR"}}` for explicit lookups when bypassing automatic rewriting.

## Stack JSON structure
- Location: default objects live in `defaults/instances/` (all `.json` files loaded recursively, sorted by depth then alphabetically); stack-specific objects belong in `<stack>/instances/` (also loaded recursively/depth-first). Filenames are arbitrary; the `id` inside each file uniquely identifies the object and controls overrides. When multiple files share an `id`, they deep-merge with deeper paths winning. The repo ships an empty scaffold in `defaults/` so real defaults can be provided via `-d <path>`; missing defaults directories are allowed.
- Each object instance file must define:
  - `id`: identifier for logging and default filenames.
- Optional fields:
  - `build`: array of build items. If omitted or invalid, it defaults to an empty array (no files rendered for that object).
  - `tags`: string or array of strings. Each tag collects the object’s `id` into `_tags.<tag>` for template use.
  - `class`: string. If provided, the loader applies defaults from that class definition (see Classes below).
- `_globals` entries are optional; if present, they must be valid JSON. Parse errors (in any file with `id` `_globals`, `defaults/globals.json`, or `defaults/instances/_globals.json`) abort the build. Put `_globals` data in stack instances or defaults instances as needed; files without an `id` are treated as `_globals`.
- Default instance files in `defaults/instances/` load first; stack-local instance files override entries with the same `id` and add new ones.
- `_globals` is a reserved stack object id used for global values; it may include `build` entries to render global outputs. Files that omit an `id` are treated as `_globals`.
- `_tags` is a reserved stack object automatically generated; its `build` is empty and each key is a tag name pointing to an array of object ids. For iteration-friendly access, `_tags._entries` is an array of `{ tag, ids }`.
- `_objects` is a reserved stack object automatically generated; its `build` is empty and `_objects._entries` is a sorted array of `{ id, tags, class, properties }` for non-internal objects. `properties` includes the resolved values for non-reserved keys (object values win; class defaults fill gaps).
- `_classes` is a reserved stack object automatically generated; its `build` is empty. Class definitions come from `defaults/classes/` (override with `<stack>/classes/`). Each class file must include `class` (string) and may include `parent` to inherit another class. All other keys are treated as default properties applied to objects declaring that class (object values win).
- `_reserved` is a reserved stack object automatically generated; its `build` is empty and `_reserved._entries` is a sorted array of `{ id, data }` containing every reserved object (e.g., `_globals`, `_tags`, `_objects`, `_classes`) to support documentation or diagnostics.
- Reserved overrides: add JSON files with reserved ids (e.g., `_objects`, `_globals`) under `defaults/instances/` or `<stack>/instances/`; their properties deep-merge into the generated reserved object. Generated fields like `_entries`, `id`, and `build` always come from the pipeline to keep them accurate, and files are loaded recursively with deeper paths overriding shallower ones (then alphabetically).

## Built-in templates and example stacks
- The repository only ships empty scaffolding under `defaults/`; stacks are expected to provide their own templates.
- Recipe demo (`stacks/recipes`) illustrates the pattern: `templates/index.html`, `templates/styles.css`, and `templates/recipes/recipe.html` render to `index.html`, `assets/styles.css`, `recipes/*.html`, plus generated `tags/*.html` and `difficulty/*.html` via the `file` helper. Template folder structure mirrors the output folder structure.
- Templates render with a stable context: `obj` (current stack object), `stack` (plain object map, including reserved objects such as `_tags`, `_objects`, `_classes`), `_globals`, and resolved `classes`. Use `stack._objects._entries` to iterate all objects and filter with helpers such as `includes` and `eq`. The `{{#file}}` helper renders using the current context only and does not mutate the canonical object.

## Build items
- String item: `"templates/page.html"`
  - Uses `templateKey` as lookup.
  - Output filename defaults to `<id><ext>` where `<ext>` comes from the template key (`page.html` → `.html`).
  - Output directory defaults to the first segment of the template key (`templates/` in this example), under the build root.
- Object item: `{ "<templateKey>": "<outputPath>" }`
  - `templateKey`: path into `defaults/templates/` (for example, `site/index.html` or `config/service.conf`).
  - `outputPath`: destination relative to the build root.
    - Leading `/` means “relative to build root” (e.g., `"/foo.txt"` → `build/.../foo.txt`, `"/docs/bar.md"` → `build/.../docs/bar.md`).
    - Subdirectories are allowed (e.g., `"folder/foo.txt"`).
    - Must not be absolute or contain `..`; violations log an error and skip writing.

## Output placement rules
- Build root: `build/<stackName>-<hash>/`.
- If `outputPath` (object form) includes directories or starts with `/`, that path is used relative to the build root.
- If no path is specified (string form or object with bare filename), the first segment of `templateKey` becomes the subfolder (for example, `site/` or `config/`). If no safe segment exists, output goes in the build root with a warning.
- Stack-specific template overrides: files in `<stackDir>/templates/**` override files of the same relative path under the global `defaults/templates/` directory.

## Classes
- Location: default definitions in `defaults/classes/` (all `.json` files loaded recursively, depth then alphabetical, merged by `class`); stack-specific overrides/additions in `<stack>/classes/` (same loading/merge rules).
- Shape: each JSON file must specify `class` (string) and may specify `parent` (string). Any other keys are treated as default properties for objects referencing that class.
- Merging: stack-level class files override default class files of the same `class` via deep merge (stack values win; nested objects merge recursively; arrays concatenate with de-duplication). Inheritance still applies after merge.
- Inheritance: parent properties are merged first, then child overrides (with merged definitions) via deep merge (arrays concatenate/dedupe). Cycles throw an error; unknown parents emit a warning and merge only the known portions.
- Application: when an object declares `class: "<name>"`, the resolved class defaults are applied; object values win, arrays are merged (deduped), and plain objects are deep-merged.
- Null handling: `null` values in class definitions are treated as “no default” (they do not set a value on objects) but still surface in `_objects.properties` so you can see missing-but-expected fields.
- Tags via classes: class `tags` are merged (with de-duplication) through inheritance and applied to objects in addition to any tags the object already defines.
- Exposure: the resolved class map is available as reserved object `_classes` (also included in `_reserved`) for templates or documentation.

## Logging and failures
- Warnings: missing placeholder values, missing templates, unsafe template segments, non-array `build` fields (defaulted to empty), or invalid `tags` entries.
- Errors abort the build: unreadable stack dir, bad JSON, missing `id`, invalid output paths, or attempts to delete outside the build root.
