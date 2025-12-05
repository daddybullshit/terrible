# Architecture and Internal APIs

This document describes the internal architecture of Terrible, including the services layer, canonical API, and template engine structure. This is primarily for contributors and advanced users who need to understand how the system works internally or want to extend it.

## Overview

Terrible is organized into three main layers:

1. **Core utilities** (`js/core/`) — pure data manipulation, merge logic, error handling, and canonical data services
2. **Template engine** (`js/templates/`) — Handlebars integration, helper registration, and template rendering
3. **Build orchestration** (`js/*.js`) — CLI, loaders, validation, and build pipeline coordination

## Services Layer (`js/core/services.js`)

The services layer provides a unified interface for accessing canonical data and helpers throughout the system. It creates read-only views of the canonical snapshot and provides bound helper functions that operate on that snapshot.

### Purpose

- Decouple template renderers and hooks from direct canonical data manipulation
- Enable multiple templating engines to consume a stable, frozen view
- Provide a controlled mutation API for hooks that need to modify canonical data
- Ensure deterministic ordering and prevent accidental mutations

### Service Provider API

#### `createServices(canonical)`

Creates a service provider from a canonical snapshot. Returns an object with:

- **`snapshot`** — A deeply frozen copy of the canonical data
- **`view`** — Read-only view API (see Canonical API below)
- **`helpers`** — Bound helper functions that operate on the snapshot:
  - `classLineage(classId)` — Returns ordered array of class inheritance chain
  - `classInheritsFrom(childId, ancestorId)` — Tests inheritance relationship
  - `filterInstancesByClass(classId)` — Returns instances that inherit from the class
  - `filterEntriesByInheritance(entries, classId)` — Filters arbitrary entries by class
  - `mergedSchemaFor(classId)` — Returns merged schema from inheritance chain
  - `requiredProps(classId)` — Returns required properties from merged schema
- **`createHookContext(options)`** — Creates a hook execution context with optional mutation support

#### Hook Context

Hook contexts provide isolated environments for hook execution. Options:

- `log` — Logger instance for the hook
- `buildDir` — Build directory path
- `stackDirs` — Array of stack directories
- `classDirs` — Array of class source directories
- `instanceDirs` — Array of instance source directories  
- `hookOptions` — Custom options passed to the hook
- `allowMutation` — Boolean; if true, context includes a mutator API
- `validate` — Optional validation function called before committing mutations

Context structure:

```javascript
{
  canonical: snapshot,           // Frozen canonical data
  services: {
    snapshot,                     // Same as canonical
    view,                         // Read-only view API
    helpers: boundHelpers         // Pre-bound helper functions
  },
  log,                            // Logger
  buildDir,                       // Build directory
  stackDirs,                      // Stack directories
  classDirs,                      // Class directories
  instanceDirs,                   // Instance directories
  options,                        // Custom hook options
  mutator                         // Only if allowMutation=true
}
```

### Usage

Template engines receive services through the render context:

```javascript
const services = createServices(canonical);
const context = {
  obj: currentObject,
  global: canonical.global,
  instances: canonical.instances,
  instancesById: canonical.instancesById,
  canonical: services.snapshot,
  services: services
};
```

Hooks receive services through their context:

```javascript
const context = services.createHookContext({
  log,
  buildDir,
  stackDirs,
  classDirs,
  instanceDirs,
  allowMutation: true,  // Only for onLoadComplete
  validate: validateCanonical
});

// Hook can access:
// context.canonical — read-only snapshot
// context.services.helpers.classLineage('myClass')
// context.mutator.upsertInstance({...}) — if allowMutation=true
```

## Canonical API (`js/core/canonical_api.js`)

The canonical API provides read-only and mutable interfaces for working with the canonical data structure. It ensures data integrity through freezing and cloning.

### Read-Only View

#### `createReadOnlyView(canonical)`

Creates a read-only view of the canonical snapshot. All data is deeply frozen to prevent mutation. Returns an object with:

- **`getCanonicalSnapshot()`** — Returns the frozen canonical object
- **Query methods** (all return defensive copies):
  - `listInstances()` — Array of all instances
  - `listClasses()` — Array of all classes
  - `getInstance(id)` — Get instance by ID
  - `getClass(id)` — Get class definition by ID
  - `findByClass(classId)` — Find instances of a class (including subclasses)
  - `lineage(classId)` — Get class inheritance chain
  - `schemaProps(classId)` — Get merged schema properties
  - `requiredProps(classId)` — Get required properties from merged schema

### Mutator API

#### `createMutator(initialCanonical, options)`

Creates a mutator for controlled modification of canonical data. Used exclusively by hooks that need to enrich or modify the data model.

**Options:**
- `validate` — Optional function to validate canonical state before commit

**Methods:**

- **`upsertInstance(instance)`** — Add or update an instance (requires `id`)
- **`removeInstance(id)`** — Remove an instance by ID
- **`upsertClass(def)`** — Add or update a class definition (requires `id`)
- **`removeClass(id)`** — Remove a class by ID
- **`setGlobal(update)`** — Merge updates into the global object
- **`getWorkingCopy()`** — Get the current working copy (mutable)
- **`commit()`** — Finalize changes, rebuild indexes, validate, freeze, and return new snapshot

**Usage pattern:**

```javascript
const mutator = createMutator(canonical, { validate: myValidator });

// Make changes
mutator.upsertInstance({ id: 'newObj', class: 'Thing', data: {} });
mutator.setGlobal({ custom_field: 'value' });

// Commit atomically
const newCanonical = mutator.commit();
```

**Important notes:**

- Mutations are applied to a working copy; the original canonical is unchanged
- `commit()` rebuilds derived indexes (`instancesById`, `classesById`)
- If `validate` is provided, it's called before freezing
- The returned snapshot is deeply frozen
- Multiple mutations can be batched before committing

### Freezing and Cloning

**`deepFreeze(value)`** — Recursively freezes an object graph to prevent mutation.

**`cloneCanonical(canonical)`** — Creates a deep clone using `structuredClone` (or JSON fallback). Used to create working copies for mutation.

**`buildIndexes(state)`** — Rebuilds `instancesById` and `classesById` indexes after mutations. Called automatically by `commit()`.

## Canonical Helpers (`js/core/canonical_helpers.js`)

Pure helper functions for working with class inheritance and schemas. All helpers are deterministic and side-effect free.

### Inheritance Helpers

#### `parentsFor(def)`

Extracts parent class IDs from a class definition. Handles both `parent` (string/array) and `parents` (array) fields, deduplicates, and returns an ordered array.

#### `classLineage(classes, classId)`

Returns the complete inheritance chain for a class, from most distant ancestors to the class itself. Uses deterministic depth-first traversal with cycle detection.

**Returns:** Array of class IDs in merge order (parents before children)

**Example:**
```javascript
classLineage(classes, 'child')
// => ['grandparent', 'parent', 'child']
```

#### `classInheritsFrom(classes, childId, ancestorId)`

Tests whether a class inherits from another (directly or transitively). Returns `true` if `childId` equals `ancestorId` or if `ancestorId` appears in the lineage of `childId`.

#### `filterInstancesByClass(canonical, classId)`

Returns all instances that inherit from the specified class (including the class itself and all subclasses).

#### `filterEntriesByInheritance(entries, targetClass, classes)`

Filters an array of objects (each with a `class` field) by inheritance from `targetClass`.

### Schema Helpers

#### `mergedSchemaFor(classes, classId)`

Merges JSON schemas from the complete class lineage. Schemas are merged in inheritance order (parent schemas first), using the same deep merge rules as class data.

**Returns:** Merged schema object or `null` if class not found

#### `requiredProps(classes, classId)`

Extracts the `required` array from the merged schema for a class.

**Returns:** Array of required property names, or empty array if no schema

### Usage in Templates

These helpers are automatically bound and available in template contexts through the services API:

```handlebars
{{#each (services.helpers.filterInstancesByClass "Vehicle")}}
  {{this.id}}
{{/each}}

{{#if (services.helpers.classInheritsFrom this.class "BaseClass")}}
  <!-- render something -->
{{/if}}
```

## Template Engine (`js/templates/`)

The template engine layer wraps Handlebars and provides discovery, rendering, and output management.

### Components

#### `handlebars_engine.js`

**Handlebars engine adapter** — Main interface for template operations.

- **`createHandlebarsEngine(options)`** — Factory function; returns engine with:
  - `prepare()` — Loads templates from stack directories
  - `planOutputs(instances, buildDir, collisionLog)` — Pre-validates output paths
  - `render(instances, buildDir, options)` — Renders all templates
  
- **`writeTemplate(templateKey, filename, ...)`** — Renders and writes a single template with collision detection

**Key features:**
- Tracks seen output paths to detect collisions
- Supports `--fail-on-collisions` mode
- Handles both string build items (`"templates/page.html"`) and object items (`{ "template": "path" }`)

#### `template_utils.js`

**Template loading and rendering** — Core utilities for template management.

- **`loadTemplates(stackDirs, log)`** — Recursively discovers templates from `templates/` directories
  - Later stacks override earlier ones (same relative path wins)
  - Returns `{ templates, stats }` with loaded content and metadata
  
- **`renderTemplate(key, content, obj, instancesById, log, options)`** — Renders a template with context
  - Compiles Handlebars template
  - Injects context (obj, global, instances, services)
  - Captures outputs from `{{#file}}` helper
  - Returns rendered string
  
- **`resolveOutputPath(templateKey, filename, buildDir, log)`** — Resolves and validates output paths
  - Templates must stay under build root
  - Leading `/` means "inside build root"
  - Rejects `..` and absolute paths
  - Returns normalized absolute path or `null` on error

#### `template_helpers.js`

**Built-in Handlebars helpers** — See `docs/template-syntax.md` for full helper reference. Includes:

- Resolution and logic: `resolve`, `eq`, `and`, `or`, `default`, `concat`
- Collections: `values`, `group_by`, `sort_by`, `where*`, `includes*`, `compact`, `uniq`
- Inheritance: `inherits`, `inherits_any`, `filter_inherits`
- Schema: `schema_required`, `schema_has`, `schema_props`, `class_lineage`
- String utilities: `slugify`, `title_case`, `json`
- Output: `file` (block helper for additional outputs), `partial_exists`

#### `template_resolution.js`

**Placeholder resolution logic** — Handles variable resolution in templates.

- **`resolveTagValue(tag, defaultValue, obj, instancesById, log, context)`**
  - Resolution order: context → current object → global → env vars → default
  - Supports cross-object lookups (`{{otherId.field}}`)
  - Logs warnings for missing values

- **`metaFromOptions(options)`** — Extracts renderer metadata from Handlebars options

- **`envValueForTag(tag)`** — Case-insensitive environment variable lookup

- **`globalsFromInstances(instancesById)`** — Extracts global object from instance map

### Template Discovery

Templates are discovered recursively from `templates/` directories in stack order:

1. Walk each stack directory in order
2. Find all `templates/**/*` files
3. Use relative path as template key
4. Later stacks override earlier stacks (same key)
5. All extensions allowed; no filtering

### Template Context

Every template receives a context object:

```javascript
{
  obj: currentObject,              // The instance being rendered
  global: canonical.global,        // The global object
  instances: canonical.instances,  // Array of all instances
  instancesById: canonical.instancesById,  // Instance map
  classes: canonical.classes,      // Array of all classes
  classesById: canonical.classesById,  // Class map
  canonical: services.snapshot,    // Frozen canonical snapshot
  services: services               // Service provider
}
```

### Output Path Resolution

Output paths follow strict rules:

- **String build items:** `"templates/page.html"` → `<id><ext>` in first path segment
- **Object build items:** `{ "template": "custom/path.html" }` → exact path under build root
- **Helper-emitted files:** `{{#file "path"}}` → path under build root
- **Safety checks:**
  - Must stay under build root
  - No `..` allowed
  - Leading `/` treated as "inside build root"
  - Absolute paths rejected
  - Collisions logged (error with `--fail-on-collisions`, warning otherwise)

## Data Flow

### Build Pipeline

1. **Load phase** — CLI → `stack_loader.js` and `class_loader.js`
   - Discover and load classes, schemas, instances
   - Merge in deterministic order
   - Resolve inheritance
   
2. **Validation phase** — `validation.js`
   - Compile schemas with Ajv
   - Validate instances against class schemas
   - Collect warnings/errors
   
3. **Services phase** — `services.js`
   - Create frozen canonical snapshot
   - Build service provider
   - Bind helpers to snapshot
   
4. **Render phase** — `handlebars_engine.js` + `template_utils.js`
   - Load templates
   - Plan outputs (collision detection)
   - Render each instance with services context
   - Write files
   
5. **Output phase** — `build.js`
   - Write `canonical.json`
   - Write metadata (`validation.json`, class definitions, schemas)
   - Write rendered templates

## Loaders and Path Resolution

### Stack Path Resolution (`stack_paths.js`)

**Purpose:** Normalize and resolve stack directory paths with consistent fallback behavior.

#### `normalizeStackDir(stackDirInput)`

Resolves a stack directory path using these candidates (in order):

1. **Absolute path:** If input is absolute, use as-is
2. **CWD-relative:** Resolve from current working directory (like `mv`/`cp`)
3. **Repo-root relative:** Fall back to repo root for convenience
4. **Parent directory:** Check repo parent (for private stacks)

Returns the first existing directory or throws `PathError` with all attempted paths.

**Important:** CWD is always tried first; repo root is a fallback for convenience only. This matches standard Unix tool behavior.

#### `stackHashFromPath(stackDir)` / `stackHashFromDirs(stackDirs)`

Generates a deterministic 12-character hash from stack path(s). Used for build directory naming.

#### `buildDirNameFromPath(stackDir, options)` / `buildDirNameFromDirs(stackDirs, options)`

Creates build directory names:
- Single stack: `<basename>-<hash>` (or just `<basename>` with `--no-hash`)
- Multiple stacks: `stackset-<hash>` (or just `stackset` with `--no-hash`)

**Options:**
- `includeHash` — Include hash suffix (default: `true`)

### Class Loader (`class_loader.js`)

**Purpose:** Load and merge class definitions and schemas from ordered directories.

#### Class File Discovery

Recursively scans directories for:
- **Class definitions:** `<name>.json` with required `class` field
- **Schema files:** `<name>.schema.json` (sidecar only; embedded schemas are forbidden)

File names are arbitrary; the `class` field controls merging.

#### `loadRawClassEntries(dirPath, log, sourceLabel)`

Loads all class and schema files from a directory. Returns an array of entries:

```javascript
{
  type: 'class' | 'schema',
  class: 'className',
  data: { ... },         // For class entries
  schema: { ... },       // For schema entries
  __file: '/path/to/file.json',
  __source: 'stack_0001'
}
```

**Validations:**
- Class files must have `class` field (string)
- Class files must NOT have embedded `schema` key (fatal error)
- Schema files derive class name from filename if `class` field is missing

#### `mergeClassDefinitions(classDirs, log)`

Merges classes from multiple directories:

1. Load entries from all directories with source labels (`stack_0000`, `stack_0001`, ...)
2. Sort by source then filename (deterministic)
3. Merge by class name:
   - Class data merges deeply (later overrides)
   - Schemas merge deeply (parent schemas first)
   - `$reset` arrays work in both class data and schemas

Returns:
```javascript
{
  definitions: Map<className, mergedData>,
  schemas: Map<className, mergedSchema>
}
```

#### `applyClassDefaults(instances, resolvedClasses)`

Applies resolved class defaults to instances. For each instance:

1. Resolve full class lineage (parents before children)
2. Merge class data in lineage order
3. Deep merge instance data on top
4. Arrays append unless `$reset` is used
5. Unwrap `$reset` wrappers in final output

Returns array of enriched instances.

#### Parent Normalization

The `normalizeParents(def)` function:
- Collects both `parent` and `parents` fields
- Deduplicates and orders
- Outputs single `parent` field (string or array)
- Maintains declaration order

#### Inheritance Resolution

The `resolveInheritance(classMap, log)` function:
- Detects cycles (fatal error)
- Resolves parents recursively
- Merges parent data before child data
- Processes schemas in parallel (same order)

### Instance Loader (`stack_loader.js`)

**Purpose:** Load and merge instance files from ordered directories.

#### Instance File Discovery

Recursively scans directories for `*.json` files.

**ID rules:**
- Files with `id` field become instances
- Files without `id` merge into `global`
- Multiple files with same `id` merge deeply

#### `readStackObject(filePath, log)`

Reads an instance file:
- Parses JSON
- Defaults `id` to `'global'` if missing
- Normalizes `build` field to array (warns if not array)

#### `mergeInstances(instanceDirs, log)`

Merges instances from multiple directories:

1. Load files from all directories
2. Sort deterministically (source then filename)
3. Group by `id`
4. Merge each group deeply (later files override)
5. Unwrap `$reset` wrappers

Returns `Map<id, mergedInstance>` with `global` at the start.

#### Global Metadata Attachment

The `attachGlobalMetadataToStack` function enriches the `global` object with:

- **`objects`** — Map of `{ id, class, properties }` for all non-reserved instances, sorted by ID
- **`classesById`** — Map of class names to class data
- **`classEntries`** — Array of `{ class, parent, properties }` sorted by class name

This happens after instance merging and class default application.

#### Object Map Construction

The `buildObjectMap` function:
- Filters out reserved IDs (`global`, etc.)
- For each instance:
  - Collects all property keys from class and instance
  - Merges resolved values (instance overrides class)
  - Sorts properties alphabetically
- Returns sorted map by ID

#### Class Metadata Collection

The `collectClasses` function:
- Extracts all resolved classes
- Strips `class` field from data
- Preserves `parent` field
- Returns both map and sorted array views

### Path Resolution Strategy

Terrible uses **CWD-first semantics** like standard Unix tools:

1. **Try CWD first:** `./stacks/demo` resolves from current directory
2. **Fall back to repo root:** Convenience for running from anywhere in repo
3. **Check parent directory:** Support for private stacks outside repo
4. **Fail with context:** If none exist, list all attempted paths

This matches `mv`/`cp` behavior and avoids surprising path resolution.

**CLI behavior:**
```bash
# From repo root
./bin/terrible build stacks/demo    # Uses ./stacks/demo

# From subdirectory (if stacks/demo doesn't exist in CWD)
cd tests
../bin/terrible build stacks/demo   # Falls back to repo root's stacks/demo

# Absolute paths always work
./bin/terrible build /abs/path/to/stacks/demo
```

### Discovery Order Guarantees

All discovery is deterministic and repeatable:

**Within a directory:**
1. Recursive directory traversal (depth-first)
2. Alphabetical filename order at each level
3. Deeper paths processed after shallower ones

**Across directories:**
1. Stack order is exactly CLI order (no resorting)
2. Source labels preserve order (`stack_0000`, `stack_0001`, ...)
3. Merge order honors source labels

**File naming:**
- File names can be arbitrary
- The `id` or `class` field controls identity and merging
- Schemas derive class name from filename if needed

**Example:**
```
stacks/
  base/
    classes/
      vehicle.json         # Loaded first
      vehicle.schema.json
    instances/
      car.json             # Loaded first
  override/
    classes/
      vehicle.json         # Merged second (overrides)
    instances/
      car.json             # Merged second (overrides)
```

Results in deterministic merge: base → override for both classes and instances.

## Build Orchestration (`build.js`)

The build orchestrator coordinates the entire pipeline, providing multiple build modes and output options.

### Build Modes

#### `runBuild(options)` — Full pipeline

Executes the complete build pipeline in deterministic order:

1. **Initialize** — Load `.env`, create logger
2. **Resolve paths** — Validate and normalize all directory inputs
3. **Load templates** — Discover templates from template directories
4. **Load stack** — Load classes, resolve inheritance, load instances, apply defaults
5. **Validate** — Compile schemas, validate instances, collect issues
6. **Create services** — Build frozen canonical snapshot with service provider
7. **Prepare build directory** — Clean and create build directory
8. **Plan outputs** — Pre-validate output paths for collisions
9. **Render templates** — Render all templates with canonical context
10. **Write metadata** — Write canonical.json and metadata files
11. **Summarize** — Log results and exit if errors

**Options:**
- `classDirs` — Array of class source directories (required)
- `instanceDirs` — Array of instance source directories (required)
- `templateDirs` — Array of template source directories (defaults to union of class/instance dirs)
- `outputs` — Set of output types to generate (default: all)
- `buildRoot` — Build root directory (default: `<repo>/build`)
- `buildDir` — Full build directory path (overrides buildRoot/buildName)
- `buildName` — Build directory name (default: derived from stacks)
- `includeHash` — Include hash in build directory name (default: `true`)
- `warningsAsErrors` — Treat warnings as fatal (default: `false`)
- `warnExtraFields` — Warn about undeclared instance fields (default: `false`)
- `failOnCollisions` — Treat output path collisions as fatal (default: `false`)
- `quiet` — Suppress info/warning output (default: `false`)
- `silent` — Suppress all output except errors (default: `false`)

**Output types:**
- `CANONICAL` — `canonical.json` in build root
- `CLASS_DEFINITIONS` — `meta/class-definitions/*.json`
- `SCHEMAS` — `meta/class-schemas/*.schema.json`
- `INSTANCES` — `meta/instances/*.json`
- `VALIDATION` — `meta/validation.json`
- `TEMPLATES` — Rendered template outputs

#### `runClassesOnly(options)` — Classes and schemas only

Loads and merges class definitions and schemas without processing instances or rendering templates.

**Use cases:**
- Validating class inheritance
- Generating schema documentation
- Preparing class sets for later instance validation

**Options:** Same as `runBuild` but only `classDirs`, `buildRoot`, `buildDir`, `buildName`, `includeHash`, `quiet`, `silent`

**Outputs:**
- `canonical.json` with classes only
- `meta/class-definitions/*.json`
- `meta/class-schemas/*.schema.json`

#### `runInstancesOnly(options)` — Instances without rendering

Loads classes and instances, validates, but skips template rendering.

**Use cases:**
- Data validation without output generation
- Testing instance configurations
- Generating canonical snapshots for external tools

**Options:** Same as `runBuild` but omits template-related options

**Outputs:**
- `canonical.json` with full data
- `meta/validation.json`
- `meta/instances/*.json` (optional)

#### `runValidateOnly(options)` — Validation only

Validates instances against class schemas without writing any outputs except validation report.

**Use cases:**
- CI validation checks
- Pre-commit hooks
- Schema compliance testing

**Options:** Same as `runBuild` but all outputs are suppressed except validation

**Outputs:**
- Exit code 0 (success) or 1 (failure)
- Validation messages to stderr

### Build Directory Management

#### Path Resolution

Build directory is determined by (in priority order):

1. **`--build-dir`** — Full path override (absolute or relative to CWD)
2. **`--build-root` + `--build-name`** — Combine root + name
3. **Default:** `<repo>/build/<stack>-<hash>` (or `stackset-<hash>` for multiple stacks)

#### Hash Generation

Stack hash is computed from normalized source directories:
- Single stack: hash of normalized stack path
- Multiple stacks: hash of `stack1|stack2|...` (deterministic order)
- 12-character hex prefix for directory naming

#### Directory Cleanup

Before each build:
- If build directory exists and is under build root, it's deleted
- All parent directories are created recursively
- Safety check: only directories under build root can be cleaned

### Canonical Output Structure

Every build produces a canonical snapshot with metadata:

```json
{
  "canonicalVersion": 1,
  "canonicalStability": "alpha",
  "breakingChangesWithoutVersionBump": "note",
  "buildMeta": {
    "generatedAt": "2025-12-05T...",
    "mode": "build",
    "stackHash": "7c1b0eca6f29",
    "buildDirName": "demo-7c1b0eca6f29",
    "buildRoot": "/path/to/build"
  },
  "global": { ... },
  "classes": [ ... ],
  "classesById": { ... },
  "instances": [ ... ],
  "instancesById": { ... }
}
```

### Metadata Outputs

Under `meta/` directory:

#### `validation.json`

Complete validation report:
```json
{
  "issues": [
    {
      "level": "error" | "warn",
      "message": "...",
      "code": "...",
      "instanceId": "...",
      "classId": "..."
    }
  ],
  "summary": {
    "errors": 0,
    "warnings": 2,
    "validated": 15
  }
}
```

#### `class-definitions/<class>.json`

Individual merged class definitions (one per class).

#### `class-schemas/<class>.schema.json`

Individual merged schemas (one per class). Empty schema `{}` for classes without schemas.

#### `instances/<id>.json`

Individual instance files (one per instance, including `global.json`).

### Error Handling and Exit Codes

**Exit codes:**
- `0` — Success (no errors)
- `1` — Build failed (errors or `--warnings-as-errors` with warnings)

**Error collection:**
- All errors collected before exit
- Path resolution errors show all attempted paths
- Validation errors show instance ID, class ID, and schema path
- Template errors show template key and instance ID

**Logging behavior:**
- `--quiet`: Suppress info/warnings, show errors
- `--silent`: Suppress everything except errors
- Warnings logged even in quiet mode unless silent
- Error summary always printed before exit

### Build Hooks (Future)

The build pipeline is intentionally linear to support future hook integration:

**Hook points (planned):**
1. After template discovery
2. After stack loading (`onLoadComplete` — mutation allowed)
3. Before validation
4. After validation (`onPreRender`)
5. Per-instance during render (`onRenderInstance`)
6. After each file written (`onPostRenderFile`)
7. After all outputs written (`onFinalizeBuild`)

Only `onLoadComplete` will receive a mutator; all other hooks will be read-only.

The current pipeline preserves these integration points by maintaining strict ordering and passing the canonical snapshot through services.

## Hook Integration Points (Planned)

Future hook phases will integrate at specific points:

- **`onLoadComplete`** — After merge, before validation (mutation allowed)
- **`onPreRender`** — Before template rendering (read-only)
- **`onRenderInstance`** — Per-instance during rendering (read-only)
- **`onPostRenderFile`** — After each file written (read-only)
- **`onFinalizeBuild`** — After all outputs written (read-only)

Only `onLoadComplete` receives a mutator; all other hooks are read-only.

## Determinism Guarantees

Terrible maintains strict determinism:

- **Load order:** Stack order from CLI; within stacks, depth-first then alphabetical
- **Merge order:** Stacks left-to-right; later stacks win for same ID
- **Inheritance order:** Parents before children; multiple parents in declared order
- **Index order:** `instances` array preserves merge order with `global` at index 0
- **Template order:** Stack order for discovery; later stacks override earlier ones
- **Frozen data:** Canonical snapshots are deeply frozen after creation
- **No implicit injection:** No tags, timestamps, or other fields added by the system

## Core Utilities (`js/core/`)

Terrible's core utilities are pure, side-effect-free functions organized by responsibility.

### Merge Utilities (`merge_utils.js`)

**Deep merge with array semantics** — Core merge logic used throughout the system.

#### `deepMerge(base, override)`

Recursively merges two objects/arrays with special array handling:

- **Objects:** Shallow copy base, recursively merge override keys
- **Arrays:** Append by default; support `$reset` convention
- **Primitives:** Override value wins
- **`undefined`:** Skipped (doesn't delete keys)

#### Array Reset Convention

Arrays append by default, but can be replaced using:

```json
{
  "items": {
    "$reset": true,
    "value": ["new", "list"]
  }
}
```

This replaces the base array entirely instead of appending. Used in both class inheritance and instance merging.

#### `mergeArrays(base, override)`

Merges arrays with append-or-reset semantics. Used internally by `deepMerge`.

#### `isPlainObject(value)`

Type guard for plain objects (excludes arrays, functions, null).

### Object Utilities (`object_utils.js`)

**Type coercion and transformation** — Helpers for normalizing data shapes.

#### `asArray(value)`

Coerces a value to an array:
- Arrays pass through
- `undefined`/`null` → `[]`
- Other values → `[value]`

#### `mapLikeToObject(mapLike)`

Converts a Map or object to a plain object. Handles both ES6 Maps and plain objects uniformly.

### Data Utilities (`data_utils.js`)

**Path access and list operations** — Query and filter utilities.

#### `getByPath(obj, path)`

Safely retrieves a nested value using dot-notation path string. Returns `undefined` if path doesn't exist.

```javascript
getByPath({ a: { b: { c: 42 } } }, 'a.b.c')  // 42
```

#### `toArray(value)`

Similar to `asArray` but with slightly different semantics for filtering operations.

#### `entriesFrom(obj)`

Converts an object or Map to `[key, value]` pairs array.

#### `filterList(list, predicate)`

Filters an array with a predicate function.

#### `targetIncludes(target, searchValue)`

Tests if `target` (string/array) includes `searchValue`. Case-insensitive for strings.

### File System Utilities (`fs_utils.js`)

**Structured file I/O** — File operations with rich error context.

#### `readJsonFile(filePath)`

Reads and parses a JSON file. Throws `FileSystemError` with context on failure:
- File not found
- Invalid JSON syntax
- Read permissions issues

Returns parsed object.

#### `writeJsonFile(filePath, data, options)`

Writes an object as formatted JSON. Creates parent directories if needed. Throws `FileSystemError` on write failure.

#### `ensureDir(dirPath)`

Recursively creates a directory (like `mkdir -p`). Throws `FileSystemError` on failure.

#### Error Context

All file system errors include:
- Original error message
- File path
- Operation type (read/write/mkdir)
- Stack trace

### Build Helpers (`build_helpers.js`)

**Build constants and output writers** — Shared build utilities.

#### Reserved Keys

Defines system-reserved field names that have special meaning:

- `id` — Object identifier
- `class` — Class reference
- `parent`, `parents` — Class inheritance
- `build` — Template list
- `schema` — (Forbidden in JSON; must be sidecar)

#### Output Writers

Helpers for writing canonical outputs:
- `writeCanonicalJson(path, data)` — Formatted JSON output
- `writeMeta(buildDir, filename, data)` — Metadata outputs
- `ensureBuildDir(path)` — Build directory setup

#### Build Directory Structure

Enforces standard layout:
```
build/<stack>-<hash>/
  canonical.json
  meta/
    validation.json
    class-definitions/
      <class>.json
    class-schemas/
      <class>.schema.json
    instances/
      <id>.json
  <rendered templates>
```

### Canonical Helpers (`canonical_helpers.js`)

**Inheritance and schema queries** — See "Canonical Helpers" section above for full details.

### Error Types (`errors.js`)

**Structured error hierarchy** — All errors extend `TerribleError` base class.

#### `TerribleError`

Base error class with:
- `code` — Error code (string)
- `context` — Additional context object
- `message` — Human-readable message

#### `ValidationError`

Schema validation failures. Context includes:
- `instanceId` — Which instance failed
- `classId` — Which class schema was violated
- `errors` — Array of Ajv error objects

#### `FileSystemError`

File I/O failures. Context includes:
- `filePath` — Which file
- `operation` — What operation (read/write/mkdir)
- `originalError` — Underlying Node.js error

#### `TemplateError`

Template compilation/rendering failures. Context includes:
- `templateKey` — Which template
- `instanceId` — Which instance was being rendered
- `originalError` — Underlying Handlebars error

### Formatting (`format.js`)

**Terminal output formatting** — Color and style utilities.

#### Color Functions

- `red(text)` — Error messages
- `yellow(text)` — Warnings
- `green(text)` — Success
- `blue(text)` — Info
- `gray(text)` — Muted text
- `bold(text)` — Emphasis

#### Conditional Formatting

Colors are disabled when:
- `NO_COLOR` environment variable is set
- Output is not a TTY (piped/redirected)
- `--no-color` CLI flag is used

#### Usage

```javascript
const { red, yellow, bold } = require('./core/format');
console.error(red('Error:'), bold(message));
```

## Extension Points

### Adding Template Helpers

Register helpers in `template_helpers.js`:

```javascript
Handlebars.registerHelper('myHelper', function(...) {
  // Implementation
});
```

### Adding Services

Extend the service provider in `services.js`:

```javascript
const boundHelpers = {
  ...existingHelpers,
  myNewHelper: (arg) => myLogic(snapshot, arg)
};
```

### Adding Validation Rules

Extend the validation pipeline in `validation.js`:

```javascript
function validateCustomRules(canonical, log) {
  // Custom validation logic
}
```

## Error Handling

All modules use structured errors from `js/core/errors.js`:

- **`TerribleError`** — Base error class with code and context
- **`ValidationError`** — Schema/validation failures
- **`FileSystemError`** — File I/O failures
- **`TemplateError`** — Template compilation/rendering failures

Errors propagate to the CLI, which formats them with color and context before exiting.

## Logging

The logger (`js/logger.js`) tracks warnings and errors:

- **`log.info(message)`** — Informational output
- **`log.warn(message)`** — Warning (tracked for `--warnings-as-errors`)
- **`log.error(message)`** — Error (always fatal)
- **`log.hasWarnings()`** — Check if warnings were logged
- **`log.hasErrors()`** — Check if errors were logged

Use `--quiet` to suppress info/warning output; errors always print.
