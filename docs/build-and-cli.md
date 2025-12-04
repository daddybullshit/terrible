# Build pipeline and CLI

The CLI is a thin wrapper over the build pipeline. It resolves paths, loads data, validates, and renders templates into the build directory.

## CLI usage
- Build: `./bin/terrible build <stack>` (defaults to `stacks/recipes` if omitted). Override defaults with `-d <defaultsDir>`.
- Flags: `--warnings-as-errors`, `--warn-extra-fields`, `--fail-on-collisions`, `--quiet`.
- `.env` at the repo root is loaded automatically. Stack/default paths are resolved from your current working directory; outputs always land in the repository’s `build/<stack>-<hash>/`.

## Pipeline stages
1. **Templates**: load defaults then stack templates; detect overrides.
2. **Data**: load/merge classes and instances, apply inheritance, validate against schemas.
3. **Prepare build**: clean/create `build/<stack>-<hash>/`; write `canonical.json`, merged class definitions, merged schemas, and `meta/validation.json`.
4. **Render**: execute build items from `global` and each instance; warn on duplicate output paths (fatal with `--fail-on-collisions`).
5. **Finish**: emit summary and any warnings (errors abort earlier).

## Outputs and metadata
- **Build root**: `build/<stack>-<hash>/`.
- **Canonical snapshot**: `canonical.json` (merged data, class map, class hierarchy).
- **Meta**: `meta/validation.json`, `meta/class-definitions/`, `meta/class-schemas/`, plus any helper-emitted files.
- **Generated docs**: stacks may emit additional docs such as `canonical.html` viewers or inventory pages; all stay under the build root.

## Logging and failures
- Fatal: unreadable paths, JSON parse errors, template compilation errors, invalid output paths, cycle detection failures.
- Warnings: missing placeholders, missing templates, unknown classes, schema violations, extra fields (when enabled), duplicate outputs (unless promoted to errors).
