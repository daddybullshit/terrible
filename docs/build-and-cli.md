# Build pipeline and CLI

The CLI is a thin wrapper over the build pipeline. It resolves paths, loads data, validates, and renders templates into the build directory.

## CLI usage
- Build: `./bin/terrible build stacks/recipes stacks/validation-suite` (positional stacks) or `./bin/terrible build --stack stacks/recipes --stack stacks/validation-suite` (repeatable flag). At least one stack is required.
- Tests: `./bin/terrible test` runs the regression suite.
- Optional sources: `--classes-from <stackDir>` and/or `--instances-from <stackDir>` to pull classes or instances/global from specific stacks (defaults to the `--stack` list and order).
- Output control: `--build-root <dir>` to change the root (default `<repo>/build`); `--build-name <name>` to set the build directory name; `--build-dir <path>` for a full path override; `--hash/--no-hash` toggles hash suffixing when auto-naming.
- Flags: `--warnings-as-errors`, `--warn-extra-fields`, `--fail-on-collisions`, `--quiet`.
- `.env` at the repo root is loaded automatically. Stack paths resolve from your current working directory; if missing there we fall back to the repo root (and its parent, for private stacks). Outputs always land in `build/<stack>-<hash>/` (multi-stack builds use a hash-based `stackset-<hash>` directory).

## Pipeline stages
1. **Templates**: load templates from each stack in declared order; later stacks override earlier ones (no alphabetical resorting).
2. **Data**: two-pass merge:
   - Classes/schemas: merge across stacks in declared order, normalize parents, resolve inheritance, merge schemas in the same order. Class roots must exist but may be empty (no defaults applied).
   - Instances/global: merge across stacks in declared order; for the same `id`, later stacks override earlier ones; objects deep-merge; arrays append unless `$reset` is present. Each supplied instances root must contain `global.json` or at least one file under `instances/`; empty roots are fatal.
3. **Prepare build**: clean/create `build/<stack>-<hash>/`; write `canonical.json`, merged class definitions, merged schemas, and `meta/validation.json`.
4. **Render**: execute build items from `global` and each instance; warn on duplicate output paths (fatal with `--fail-on-collisions`).
5. **Finish**: emit summary and any warnings (errors abort earlier).

## Outputs and metadata
- **Build root**: `build/<stack>-<hash>/`.
- **Canonical snapshot**: `canonical.json` (merged data, class map, class hierarchy). `instances` includes `global` at index 0; the keyed map is exposed as `instancesById`.
- **Meta**: `meta/validation.json`, `meta/class-definitions/`, `meta/class-schemas/`, plus any helper-emitted files.
- **Generated docs**: stacks may emit additional docs such as `canonical.html` viewers or inventory pages; all stay under the build root.

## Logging and failures
- Fatal: unreadable or non-directory paths, JSON parse errors, template compilation errors, invalid output paths, cycle detection failures, missing instance/global content for a supplied stack root.
- Warnings: missing placeholders, missing templates, unknown classes, schema violations, extra fields (when enabled), duplicate outputs (unless promoted to errors), class roots with no class or schema files (build continues without defaults for that root).
