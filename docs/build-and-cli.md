# Build pipeline and CLI

The CLI is a thin wrapper over the build pipeline. It resolves paths, loads data, validates, and renders templates into the build directory.

## CLI commands

### `build` — Full pipeline (default)
Build one or more stacks through the complete pipeline: load templates, merge classes, merge instances, validate, and render outputs. Fully flexible — mix and match sources as needed.

```bash
# Shorthand: --stack sets both class and instance sources
./bin/terrible build stacks/recipes stacks/validation-suite
./bin/terrible build --stack stacks/recipes --stack stacks/validation-suite

# Explicit sources (no --stack required)
./bin/terrible build --classes-from stacks/schemas --instances-from stacks/data

# Mix: classes from one place, instances from another
./bin/terrible build --classes-from stacks/shared-schemas --instances-from stacks/project-a

# Separate template source
./bin/terrible build --classes-from stacks/schemas --instances-from stacks/data --templates-from stacks/custom-templates
```

**Options:**
- `--stack`, `-s` — Shorthand: sets both `--classes-from` and `--instances-from`
- `--classes-from <dir>` — Directories to source classes from (repeatable)
- `--instances-from <dir>` — Directories to source instances from (repeatable)
- `--templates-from <dir>` — Directories to source templates from (defaults to union of class/instance sources)
- `--output <types>` — Comma-separated list of output types to generate (default: all). Valid types: `canonical`, `class-definitions`, `schemas`, `instances`, `validation`, `templates`
- `--build-root <dir>` — Build root directory (default `<repo>/build`)
- `--build-name <name>` — Build directory name under the build root
- `--build-dir <path>` — Full build directory path (overrides build-root/name)
- `--hash/--no-hash` — Toggle hash suffix in auto-naming (default: `--hash`)
- `--warnings-as-errors` — Treat validation warnings as errors
- `--warn-extra-fields` — Warn when instances carry undeclared fields
- `--fail-on-collisions` — Treat duplicate output paths as fatal
- `--quiet` — Suppress non-error output

**Output types:**
- `canonical` — `canonical.json` in build root
- `class-definitions` — `meta/class-definitions/*.json`
- `schemas` — `meta/class-schemas/*.schema.json`
- `instances` — `meta/instances/*.json` (individual instance files)
- `validation` — `meta/validation.json`
- `templates` — Rendered template outputs

### `classes` — Classes/schemas only
Merge and output class definitions and schemas without loading instances or rendering templates. Useful for validating class inheritance, generating schema documentation, or preparing a class set for later instance validation.

```bash
# Using --stack (shorthand)
./bin/terrible classes stacks/recipes --no-hash --build-name my-classes

# Using --classes-from (explicit, no --stack required)
./bin/terrible classes --classes-from stacks/schemas --build-name schema-docs

# Multiple sources
./bin/terrible classes --classes-from stacks/base --classes-from stacks/overlay
```

**Options:**
- `--stack`, `-s` — Stack directory (repeatable, shorthand for `--classes-from`)
- `--classes-from <dir>` — Directories to source classes from (repeatable)
- `--output <types>` — Comma-separated list of output types to generate (default: all). Valid types: `canonical`, `class-definitions`, `schemas`
- `--build-root <dir>` — Build root directory
- `--build-name <name>` — Build directory name
- `--build-dir <path>` — Full build directory path
- `--hash/--no-hash` — Toggle hash suffix
- `--quiet` — Suppress non-error output

**Outputs:** `canonical.json` (classes only), `meta/class-definitions/`, `meta/class-schemas/`.

### `instances` — Instances only (no classes, no validation)
Merge instances without class resolution or validation. Outputs raw merged instance data for external processing, feeding to other tools, or custom validation pipelines.

```bash
# Using --stack (shorthand)
./bin/terrible instances stacks/recipes --no-hash --build-name my-instances

# Using --instances-from (explicit, no --stack required)
./bin/terrible instances --instances-from stacks/data --build-name raw-instances

# Multiple sources
./bin/terrible instances --instances-from stacks/base --instances-from stacks/overlay
```

**Options:**
- `--stack`, `-s` — Stack directory (repeatable, shorthand for `--instances-from`)
- `--instances-from <dir>` — Directories to source instances from (repeatable)
- `--output <types>` — Comma-separated list of output types to generate (default: `canonical`). Valid types: `canonical`, `instances`
- `--build-root <dir>` — Build root directory
- `--build-name <name>` — Build directory name
- `--build-dir <path>` — Full build directory path
- `--hash/--no-hash` — Toggle hash suffix
- `--quiet` — Suppress non-error output

**Outputs:** `canonical.json` (instances only, no classes). With `--output instances`: also `meta/instances/*.json`.

### `validate` — Validation only
Load classes and instances, run validation, and report results without writing files. Fully flexible — mix and match sources as needed.

```bash
# Validate a single stack (shorthand: --stack sets both sources)
./bin/terrible validate stacks/recipes

# Explicit sources (no --stack required)
./bin/terrible validate --classes-from stacks/schemas --instances-from stacks/data

# Mix: classes from one place, instances from another
./bin/terrible validate --classes-from stacks/shared-schemas --instances-from stacks/project-a

# Multiple sources for each
./bin/terrible validate --classes-from stacks/base stacks/overlay --instances-from stacks/data
```

**Options:**
- `--stack`, `-s` — Shorthand: sets both `--classes-from` and `--instances-from`
- `--classes-from <dir>` — Directories to source classes from (repeatable)
- `--instances-from <dir>` — Directories to source instances from (repeatable)
- `--output <types>` — Output format: `json` (structured JSON to stdout) or `summary` (human-readable, default)
- `--warnings-as-errors` — Treat validation warnings as errors
- `--warn-extra-fields` — Warn when instances carry undeclared fields
- `--quiet` — Suppress non-error output

### `test` — Run regression tests
```bash
./bin/terrible test
```

## Path resolution
- Stack paths resolve from your current working directory first
- If missing there, falls back to the repo root (and its parent, for private stacks)
- `.env` at the repo root is loaded automatically

## Pipeline stages (build command)
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
