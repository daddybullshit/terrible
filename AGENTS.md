# Repository Guidelines

## Structure
- `js/`: core tooling (`build.js` for rendering, `stack_paths.js` for hashed build directories, shared utilities and template helpers).
- `defaults/templates/`: base templates; stack overrides live under `<stack>/templates/**`.
- `defaults/instances/`: default object instance files loaded recursively (depth-first then alphabetical); ids deep-merge with deeper paths winning before stack-specific files.
- `defaults/classes/`: default class definitions loaded recursively (depth-first then alphabetical) and merged by `class` prior to inheritance.
- `defaults/global.json` and `defaults/instances/global.json`: shared globals merged ahead of stack-specific `global` entries.
- `stacks/`: stack definitions under `<stack>/instances/*.json` (recursive load, depth-first then alphabetical; shared ids deep-merge) plus optional `global.json`.
- `build/`: generated outputs (`<stack>-<hash>/...`); safe to delete and regenerate.
- `docs/`: public documentation for the repository.
- `.env.example`: template for a gitignored `.env` file containing secret values.

## Commands
- Build stack: `./js/build.js -s stacks/recipes` (renders into `build/<stack>-<hash>`; defaults via `-d`; omit `-s` to use the repo default stack). A thin wrapper exists at `./bin/terrible` with the same arguments.
- Compute build directory name: `node js/stack_paths.js stacks/recipes --build-dir-name`.

## Coding Conventions
- JavaScript: prefer modern syntax (`const`/`let`, strict error handling). Files in `js/` use CommonJS modules.
- Templates: use `{{ key }}` or `{{ key|default }}` placeholders (word characters only). Values resolve from merged object definitions (defaults overridden by stack files), then `global` (from defaults plus stack), then environment variables. Cross-object lookups use `{{otherId.field}}`. Helpers such as `values`, `group_by`, `sort_by`, `filter_inherits`, `where`, `where_includes*`, `includes_any/all`, `default_list`, `compact`, `uniq`, `slugify`, and `title_case` provide flexible search/filter support instead of reserved tag objects. Helper names are `snake_case`; implementation code remains `camelCase`.
- `global` is the shared object for workspace-wide values and drives placeholder resolution; its `objects` map lists every non-reserved stack object (id, class, resolved properties) for templates/diagnostics. There is no field normalization or class-level field injection—fields such as `tags` are plain user data.
- Output paths must remain within the build root; reject or warn on unsafe segments such as `..`.

## Testing Expectations
- No automated test suite is present. When changing build logic, run `./js/build.js -s <stack>` and validate the generated structure and contents.

## Contribution Expectations
- Use clear, action-oriented commit messages (for example, `fix path resolution for stack build`).
- Pull requests should describe the change, identify affected commands/templates, and note any manual test runs.
- Call out security-relevant changes when touching secrets handling, path validation, or execution safety.

## Security and Configuration
- Do not commit real secrets. Provide sensitive values through environment variables (or a gitignored `.env`) and reference them via the `resolve` helper in templates.
- CLI entrypoints source a root-level `.env` if present so environment-backed placeholders resolve consistently during builds.
- Verify stack paths before running destructive operations; hashed build directories reduce collision risk.
