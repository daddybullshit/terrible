# Templates and helpers

Templates are standard Handlebars files with a `resolve` helper that understands stack data. Every file under a `templates/` directory in any stack is treated as a template key; later stacks override earlier ones when the relative path matches.

## Discovery and overrides
- Template roots: every `templates/**` under the ordered stack list.
- Any extension is allowed; later stacks replace earlier ones with the same relative path.
- All template outputs must stay under the build root; leading `/` paths are interpreted as “inside build root.”

## Context and placeholder resolution
- Raw `{{key}}`/`{{key|default}}` are rewritten to `{{resolve ...}}`.
- Resolution order: helper/block context → current object → `global` → environment variables (raw then uppercased) → provided default → unresolved (warn).
- Context aliases available in templates: `global`, `objects` (`global.objects`), `classes` (`global.classes`), `instances`/`instancesById` (plain map of all objects, including `global`), and `canonical` on global builds.
- Cross-object lookups work with dotted keys: `{{otherId.field}}` warns if missing.

## Build items and output paths
- String item: `"templates/page.html"` renders that template for the current object; filename defaults to `<id><ext>`, directory defaults to the first path segment of the template key (or build root if none).
- Object item: `{ "<templateKey>": "<outputPath>" }` writes to a specific path under the build root. Paths must not be absolute or contain `..`; violations are fatal.
- `{{#file "path"}}...{{/file}}` emits extra files from inside a template using the same safety checks.

## Helper reference (built-ins)
- Resolution and logic: `resolve`, `eq`, `and`, `or`, `default`, `concat`, `identity`, `length`.
- Collections: `values`, `group_by`, `sort_by`, `where`, `where_includes`, `where_includes_any`, `where_includes_all`, `includes_any`, `includes_all`, `default_list`, `compact`, `uniq`, `array`, `reverse`.
- Inheritance-aware: `inherits`, `inherits_any`, `inherits_all`, `filter_inherits`.
- Schema-aware: `schema_required`, `schema_has`, `schema_props`, `schema_prop_source`, `class_lineage`, `schema_required_by_source`.
- String utilities: `slugify`, `title_case`, `json`.
- Partials and files: `partial_exists`, `file`.

## Tips
- Keep JSON keys `snake_case` and reference them verbatim in templates.
- Use `partial_exists` plus device- or class-specific partials to avoid `if/else` ladders.
- When composing grids or lists, prefer helper-based filtering (for example, `filter_inherits`) instead of hard-coded ids.
