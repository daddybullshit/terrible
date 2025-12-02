# Repository Guidelines

## Structure
- `scripts/terrible.sh`: entrypoint that dispatches to the build command in `scripts/`.
- `js/`: core tooling (`build.js` for rendering, `stack_paths.js` for hashed build directories, shared utilities).
- `scripts/`: shell wrappers for lifecycle operations (`build.sh`).
- `defaults/templates/`: base templates; stack overrides live under `<stack>/templates/**`.
- `defaults/instances/`: default object instance files loaded recursively (depth-first then alphabetical); ids deep-merge with deeper paths winning before stack-specific files.
- `defaults/classes/`: default class definitions loaded recursively (depth-first then alphabetical) and merged by `class` prior to inheritance.
- `defaults/globals.json` and `defaults/instances/_globals.json`: shared globals merged ahead of stack-specific `_globals` entries.
- `stacks/`: stack definitions under `<stack>/instances/*.json` (recursive load, depth-first then alphabetical; shared ids deep-merge) plus optional `_globals.json`.
- `build/`: generated outputs (`<stack>-<hash>/...`); safe to delete and regenerate.
- `docs/`: public documentation for the repository.
- `.env.example`: template for a gitignored `.env` file containing secret values.

## Commands
- Build stack: `./scripts/terrible.sh build -s stacks/recipes` (renders into `build/<stack>-<hash>`; defaults via `-d`).
- Compute build directory name: `node js/stack_paths.js stacks/recipes --build-dir-name`.

## Coding Conventions
- JavaScript: prefer modern syntax (`const`/`let`, strict error handling). Files in `js/` use CommonJS modules.
- Shell: `bash`, `set -euo pipefail`, two-space indentation; maintain consistent argument parsing across scripts.
- Templates: use `{{ key }}` or `{{ key|default }}` placeholders (word characters only). Values resolve from merged object definitions (defaults overridden by stack files), then `_globals` (from defaults plus stack), then environment variables. Cross-object lookups use `{{otherId.field}}`.
- `_globals` is reserved for shared values and is not rendered directly into outputs.
- Output paths must remain within the build root; reject or warn on unsafe segments such as `..`.

## Testing Expectations
- No automated test suite is present. When changing build logic, run `./scripts/terrible.sh build -s <stack>` and validate the generated structure and contents.

## Contribution Expectations
- Use clear, action-oriented commit messages (for example, `fix path resolution for stack build`).
- Pull requests should describe the change, identify affected commands/templates, and note any manual test runs.
- Call out security-relevant changes when touching secrets handling, path validation, or execution safety.

## Security and Configuration
- Do not commit real secrets. Provide sensitive values through environment variables (or a gitignored `.env`) and reference them via the `resolve` helper in templates.
- Verify stack paths before running destructive operations; hashed build directories reduce collision risk.
