# Data model and stack layout

Terrible treats every build as a **stack**: a pair of recursive directories (defaults and stack) that contain JSON classes, instances, and templates. Everything is merged into a single canonical object before rendering.

## Directories and load order
- **Defaults**: optional baseline content under `defaults/classes/`, `defaults/instances/`, `defaults/templates/`, plus `defaults/global.json`.
- **Stack**: required content under `<stack>/classes/`, `<stack>/instances/`, `<stack>/templates/`, plus optional `<stack>/global.json`.
- All `.json` files load recursively, depth-first then alphabetically. Stack files override defaults. Files with the same `id` deep-merge, with deeper paths winning.

## Instances and `global`
- Each instance file must include an `id`; files without an `id` are merged into the reserved `global` object.
- `build` (array) controls which templates render for an object; invalid or missing values default to `[]`.
- Any other fields you add stay verbatim on the object. The engine never injects tags or other special data.
- After merging class defaults, `global.objects` is populated with `{ id, class, properties }` entries for every non-reserved object. `global.classes` and `global.classEntries` expose resolved class metadata for templates.

## Classes and inheritance
- Class files live under `classes/` and must declare `class`. Parents can be a string or an array (`parent` is normalized into `parents`). Multiple parents are merged deterministically with cycle detection.
- Deep merge rules: parent → child; nested objects merge; arrays append unless `$reset: true` with a `value` array is present.
- Only data you define is added; classes do not inject tags or other reserved fields.

## Schemas
- Each class may provide a sidecar `<class>.schema.json`. Embedded schemas inside class JSON are disallowed; missing sidecars are replaced with an empty schema during the build.
- Schemas merge in the same deterministic order as class data. Effective schemas for every class are written to `build/<stack>-<hash>/meta/class-schemas/`.
- Instances validate against their class schema. Enable `--warn-extra-fields` to surface fields not declared in the schema (respects `additionalProperties`).

## Naming and conventions
- JSON keys stay `snake_case`. Helpers and template aliases are also `snake_case`. Implementation code uses `camelCase`.
- File names inside `instances/` are arbitrary; the `id` controls merging and logging.
- Keep secrets out of JSON; resolve them from the environment via the `resolve` helper.
