# Data model and stack layout

Terrible treats every build as a **stack set**: an ordered list of stack directories that contain JSON classes, instances, and templates. Everything is merged into a single canonical object before rendering.

## Directories and load order
- **Stacks**: each stack may include `classes/`, `instances/`, `templates/`, and optional `global.json`. You must supply at least one stack via the CLI; later stacks override earlier ones (order is exactly what you pass).
- Ordering rules (strict/deterministic):
  - Stack order is exactly the CLI order; no alphabetical resorting.
  - Within each stack: files load recursively depth-first then alphabetically.
  - Classes/schemas merge first across the ordered stack list; parents are ordered as declared; schemas merge in the same order.
  - Instances/global merge second across the ordered stack list; for the same `id`, later stacks override earlier ones; nested objects deep-merge; arrays append unless `$reset` is used.
  - Build outputs: default build directory names derive from the ordered stack list (`<stack>-<hash>` or `stackset-<hash>`); flags allow overriding name/root (`--build-root`, `--build-name`, `--build-dir`, `--hash/--no-hash`).

## Instances and `global`
- Each instance file must include an `id`; files without an `id` are merged into the reserved `global` object.
- `build` (array) controls which templates render for an object; invalid or missing values default to `[]`.
- Any other fields you add stay verbatim on the object. The engine never injects tags or other special data.
- After merging class defaults, `global.objects` is populated with `{ id, class, properties }` entries for every non-reserved object. `global.classesById` and `global.classEntries` expose resolved class metadata for templates. The canonical `instances` array includes `global` at index 0, followed by all instances in deterministic merge order; the map is exposed as `instancesById`. Classes are available both as an array (`classes`) and keyed lookup (`classesById`).

## Classes and inheritance
- Class files live under `classes/` and must declare `class`. Parents can be a string or an array (`parent` is normalized into `parents`). Multiple parents are merged deterministically with cycle detection.
- Deep merge rules: parent → child; nested objects merge; arrays append unless `$reset: true` with a `value` array is present.
- Only data you define is added; classes do not inject tags or other reserved fields.

## Schemas
- Each class may provide a sidecar `<class>.schema.json`. Embedded schemas inside class JSON are disallowed; missing sidecars are replaced with an empty schema during the build.
- Schemas merge in the same deterministic order as class data and stack order. Effective schemas for every class are written to `build/<stack>-<hash>/meta/class-schemas/`.
- Instances validate against their class schema. Enable `--warn-extra-fields` to surface fields not declared in the schema (respects `additionalProperties`).

## Naming and conventions
- JSON keys stay `snake_case`. Helpers and template aliases are also `snake_case`. Implementation code uses `camelCase`.
- File names inside `instances/` are arbitrary; the `id` controls merging and logging.
- Keep secrets out of JSON; resolve them from the environment via the `resolve` helper.
