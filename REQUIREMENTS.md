# System Requirements Specification (SRS)  
## Unified Declarative Object Model, Build Engine, and Template-Driven Code Generator

---

## 1. Overview

The system is a **general-purpose build and templating engine** that consolidates distributed JSON-based definitions into a single canonical data model (“Single Source of Truth”), which is then used to generate arbitrary static outputs (e.g., infrastructure manifests, documentation, configuration files, code artifacts).

It supports:

- Hierarchical class and instance definitions  
- Recursive directory traversal  
- Deep merge semantics for JSON objects  
- A flexible template engine (Mustache/Handlebars-like)  
- A system of build triggers per instance  
- A script execution model enabling dynamic modification of the data model  
- Export of scripts for browser use, template use, or deployment to remote systems  
- Extensible event hooks that run at specific pipeline stages  

The system is intentionally domain-agnostic and can be applied to infrastructure provisioning, documentation generation, analytics, inventory systems, etc.

### Implementation Status (current code)
- Implemented: JSON loader (depth-first then alphabetical), defaults-overrides-stack merge, class inheritance with array de-duplication, tag aggregation, reserved indices (`_tags`, `_objects`, `_classes`, `_reserved`), build execution via Handlebars templates, canonical export to `build/<stack-hash>/canonical.json`.
- Partially implemented: validation is limited to structural checks (bad JSON, missing directories) with warnings for unknown classes and invalid tags/build fields.
- Not yet implemented: script discovery/attachment, hook execution, script bundling (runtime/template/remote), remote packaging, mutation APIs, and sandbox/validation policies beyond the basic merge/templating pipeline.

---

## 2. Data Model Requirements

### 2.1 Class Definitions

- Classes are represented as JSON objects stored in a recursive directory structure.
- Each class is identified by a `class` field.
- A class defines:
  - A set of **properties**.
  - Optional **default values** for those properties.
- Class definitions may exist across multiple files in different subdirectories.
- All files sharing the same `class` must be **deep-merged**, producing a unified class object.
- Class inheritance behavior:
  - Instances referencing a class automatically inherit the merged properties.
  - Instance-level properties override class defaults.

### 2.2 Instance Definitions

- Instances represent concrete object definitions.
- Each instance is identified by an `id` value contained within the JSON file.
- Instance files may reside in nested subdirectories.
- If several files share the same instance ID, their JSON objects must be **deep-merged**.
- Instances must support:
  - A `class` field referencing a class definition.
  - Arbitrary additional fields beyond the class schema.
  - A `build` field (array) listing template names to execute for this instance.
- Files without an `id` must be merged into a special global object named `_globals`.

### 2.3 Defaults and Stacks

- The system must support:
  - A **default directory** with baseline definitions.
  - A **stack directory** chosen at runtime.
- Load order:
  1. Load and merge default classes, then stack classes, then resolve inheritance.
  2. Load and merge default instances, then stack instances, merging by `id`.
  3. Merge `_globals` from defaults (`globals.json` and `_globals` entries) and stacks.
  4. Apply resolved class defaults to instances.
- Both `defaults` and `stack` directories may be recursively traversed and merged like classes/instances.

### 2.4 Final Canonical Data Structure

- The build system must produce a **single, complete JSON object** that contains:
  - Fully merged class definitions  
  - Fully merged instance definitions  
  - Global object data  
  - User-supplied overrides  
  - Script-derived modifications (if any)  

This object is the canonical “Single Source of Truth” for all subsequent processing.

---

## 3. Template Engine Requirements

### 3.1 Template Processing

- The engine uses Mustache/Handlebars-like syntax to generate static output files.
- Rendering input is the **final canonical JSON object**.
- Templates may live in arbitrary directories, including stack-specific or default directories.
- The engine must be agnostic to output format (e.g., JSON, YAML, HTML, JS, Markdown, INI).

### 3.2 Build Triggers

- Each instance may declare a `build` array specifying one or more templates to execute.
- The `_globals` object may also trigger global templates (e.g., index pages, overview documents).
- The build pipeline must:
  - Resolve the list of templates from `build` arrays.
  - Execute the corresponding templates with access to the canonical JSON object and the relevant instance context.

### 3.3 Nested Rendering & File Generation

- Templates must support defining **blocks** that emit **additional output files**.
- Blocks may:
  - Loop over subsets of the canonical JSON object.
  - Emit multiple files in dynamically computed file paths (e.g., one file per instance).
- The engine must:
  - Support specifying the target file path from within templates (e.g., via parameters to a “block” helper).
  - Construct full output directory trees based on template logic.
- It must not be limited to a single output file; it must be able to construct an entire directory hierarchy in the output folder.

### 3.4 Dynamic JSON Injection into Templates

- Templates may optionally receive:
  - The full canonical JSON object (e.g., serialized into an embedded `<script>` block).
  - Script-generated auxiliary data structures.
- This enables:
  - Single-page dynamic UIs that load all data client-side.
  - Generated JavaScript code that can query and render subsets of the canonical object at runtime.
- Example patterns:
  - One HTML file that contains the full JSON and JavaScript logic to “view any object” based on user interaction.
  - Documentation pages that are partly static but driven by embedded JSON and client-side scripts.

---

## 4. Script Integration Requirements

Scripts extend the system with dynamic behavior, enabling data enrichment, validation, runtime computations, and integration with external systems.

> Status: Script discovery, attachment, and execution are not implemented in the current codebase; this section captures planned capabilities.

### 4.1 Script Sources

- Scripts are JavaScript files found in:
  - A dedicated `code` (or similar) directory, **and/or**
  - The same directories as class and instance JSON files.
- The system must allow flexible layout:
  - Scripts can be colocated with JSON or stored in a separate hierarchy.
  - Some default script files may define baseline functions or hooks.

### 4.2 Script Attachment

- Class and instance JSON definitions may reference associated scripts via one or more fields (e.g., `scripts`, `hooks`, or `code`).
- At configuration assembly time:
  - The system must read referenced script files.
  - Script code must be attached into the canonical JSON object in a standardized way (e.g., as strings or compiled representations).
- These scripts must be available for:
  - Build-time execution.
  - Embedding into template outputs.
  - Distribution to remote machines.

### 4.3 Script Execution Domains

#### 4.3.1 Build-Time Script Domain (Node.js)

Scripts may run during the build pipeline within a Node.js environment to:

- Modify the canonical JSON object.
- Add computed fields or derived structures.
- Validate the structure and report errors or warnings.
- Fetch external data from APIs, databases, or other services.
- Perform transformations before the template engine runs.

Execution requirements:

- Scripts must receive:
  - The current canonical JSON object.
  - Context (e.g., the class or instance they belong to).
  - A well-defined API for reading and modifying data.
- Execution order must be clearly defined (see hook sections).

#### 4.3.2 Template-Time Hooks

Scripts may run during template rendering, for example:

- **Pre-render hooks** for a template or group of templates.
- **Per-instance render hooks** executed when rendering a specific object.
- **Post-render hooks** invoked after a specific file has been generated.

These scripts can:

- Enrich the data passed into the template.
- Compute view-specific projections.
- Perform additional checks or logging.

#### 4.3.3 Runtime (Browser) Scripts

- During the build process, scripts may be bundled and emitted as JavaScript files referenced by generated HTML.
- In the browser, scripts may:
  - Read the serialized canonical JSON object (or a subset of it).
  - Render views dynamically (e.g., SPA-style documentation views).
  - Fetch live data from endpoints generated or configured by the system.
- The build system must be able to:
  - Generate at least one JS bundle appropriate for inclusion in HTML output.
  - Optionally expose a stable API on the client side for interacting with the data.

#### 4.3.4 Remote Execution Domain (Distributed to Servers)

- Scripts may be packaged and delivered to remote hosts (e.g., via Ansible).
- On remote hosts, scripts may:
  - Run under Node.js (optionally as `root`) to collect system metrics:
    - Disk usage
    - CPU temperature and load
    - Container status
    - Other local system data
  - Write locally collected data into JSON files or similar.
- Transport of collected data back to the central system is out-of-scope for the core requirements, but the system must:
  - Make it easy to embed and distribute the scripts needed for remote execution.
  - Optionally expose configuration for where and how those scripts should be deployed.

---

## 5. Hook / Event Handler Requirements

Scripts may define event handlers (hooks) that the system triggers at specific phases of the pipeline.

> Status: Hook discovery and execution are not implemented in the current codebase; this section documents intended future behavior.

### 5.1 Hook Types

The system must support, at minimum, the following hook categories:

1. **`onLoadComplete`**
   - Triggered after all JSON files (defaults, stacks, classes, instances) have been read and deeply merged.
   - Receives the fully assembled canonical JSON object.
   - Use cases:
     - Global validation (schema checks).
     - Global enrichment (adding computed indexes).
     - Resolving references (e.g., linking “backend” instances to a reverse-proxy configuration).

2. **`onPreRender`**
   - Triggered before the template engine starts rendering any template.
   - Can operate on the canonical JSON and prepare view-specific structures.
   - Use cases:
     - Creating precomputed lists used by templates.
     - Pre-sorting objects for documentation generation.
     - Tagging instances with additional metadata.

3. **`onRenderInstance(instanceId)`**
   - Triggered before rendering templates associated with a given instance.
   - Receives:
     - `instanceId`
     - The instance object and possibly the global canonical object.
   - Use cases:
     - Fetching live status for that instance.
     - Generating per-instance derived data for template rendering.

4. **`onPostRenderFile(filePath)`**
   - Triggered after each file is generated and written to disk.
   - Receives:
     - The path to the generated file.
   - Use cases:
     - File post-processing (minification, compression).
     - Checksum or hash computation.
     - Asset registration or indexing.

5. **`onFinalizeBuild`**
   - Triggered after all templates have been rendered and the output tree is complete.
   - Use cases:
     - Packaging the output (e.g., tarball, ZIP).
     - Triggering deployment steps.
     - Generating summary reports or logs.

### 5.2 Hook Scope and Binding

- Hooks may be bound at:
  - Global level (via `_globals` object).
  - Class level (affecting all instances of a class).
  - Instance level (affecting only a particular object).
- Resolution order must be clearly defined, for example:
  - Global hook → Class-level hook → Instance-level hook.
- The system must define whether hooks stack (all are executed) or override each other; a stacking behavior is generally preferred.

---

## 6. Script Bundling Requirements

During the build phase, the system must:

> Status: Bundling and packaging are not implemented in the current codebase; this section represents future work.

- Enumerate all scripts attached to:
  - Classes
  - Instances
  - Global object
  - Default or stack-level configuration if applicable
- Produce one or more bundles:

1. **Runtime Bundle (Browser)**  
   - Intended for inclusion in generated HTML.
   - Contains code that:
     - Knows how to access the embedded canonical JSON.
     - Provides utility functions for rendering or querying.

2. **Template-Time Bundle**  
   - Contains helper code that may be invoked from within templates or during render hooks.

3. **Deployment Bundle (Remote)**  
   - Optionally produced for distribution to external machines.
   - Collected scripts that should be executed in remote Node.js environments (e.g., for status collection).

Transformation requirements:

- Optionally support:
  - Minification / compression.
  - Namespacing to avoid global collisions.
- Bundling must preserve:
  - Execution order where relevant.
  - Hook registrations.

---

## 7. Extensibility Requirements

### 7.1 Arbitrary Domains

The system must remain domain-neutral and support a broad range of use cases, including but not limited to:

- Infrastructure-as-code generation:
  - Proxmox/LXC/VM configurations
  - Terraform, Ansible, or other IaC tools
- Documentation generation:
  - Static HTML sites
  - Single-page applications embedding canonical JSON
- Application configuration and environment definition:
  - Multi-environment setups (dev/test/prod)
  - Service discovery and registry configs
- Inventory and asset management:
  - Lists of devices, services, or resources
- Code generation:
  - Boilerplate source files
  - Configuration wrappers, client libraries, etc.

### 7.2 Plugin Architecture (Future)

The system should be designed so that future extensions can be added without breaking the core architecture. Examples:

- Additional script languages beyond JavaScript.
- Custom merge strategies for specific paths (e.g., array concatenation vs override).
- Pluggable schema validators.
- Asset pipelines for CSS/JS/image handling.
- Web-based configuration UI on top of the existing JSON and script model.

---

## 8. Non-Functional Requirements

### 8.1 Portability

- The build engine must run on Node.js.
- Dependencies should be kept minimal and well-defined.
- Generated outputs must be static files that do not require Node.js at runtime unless explicitly chosen (e.g., for server-side execution scripts).

### 8.2 Performance

- Recursive scanning and deep merging must be efficient even for large directory trees.
- Caching strategies may be used to avoid redundant parsing and merging.
- Template rendering should support:
  - Parallelism where safe.
  - Incremental builds (future extension).

### 8.3 Safety and Security

- When executing scripts:
  - The system must allow configuration of trust boundaries.
  - Potential sandboxing or restricted environments should be considered for untrusted code.
- Remote execution scripts (e.g., Node.js running as root) must:
  - Be explicitly enabled and configured.
  - Not be assumed to be safe by default.

### 8.4 Determinism and Reproducibility

- When scripts do not call external systems or time-dependent APIs, builds must be deterministic:
  - Same inputs (JSON, scripts, templates) produce identical outputs.
- The system should optionally support:
  - Locking versions of external dependencies.
  - Logging of external calls or randomness sources for debugging.

---

## 9. Example Use Cases Supported by the Requirements

The specified system should support, among others, the following scenarios:

1. **Proxmox / LXC Infrastructure Generation**
   - Instances represent containers or VMs.
   - Classes represent different machine or service types.
   - Templates generate Terraform configs, Proxmox configs, and Ansible playbooks.
   - Scripts enrich data or collect current state from Proxmox APIs.

2. **Reverse Proxy Configuration (e.g., NGINX)**
   - Instances are tagged as “backends”.
   - A reverse proxy instance declares a role (e.g., `reverse_proxy`).
   - A script or hook discovers all instances with a backend tag.
   - Templates generate NGINX config files per backend or per virtual host.

3. **HTML Documentation Generator**
   - Instances are generic “objects” (e.g., services, modules, components).
   - Global templates generate an `index.html`.
   - Nested templates generate one HTML file per instance.
   - A script bundle is included to allow dynamic browsing of the canonical JSON.

4. **Runtime Status Dashboard**
   - Scripts are distributed to remote machines via Ansible.
   - Remote Node.js scripts collect local metrics into JSON files.
   - Another build run ingests those metrics, merges them into the canonical JSON, and regenerates a dashboard site.

5. **Generic Config and Code Generation**
   - Classes and instances define arbitrary objects (e.g., feature toggles, tenants, microservices).
   - Templates generate:
     - JSON/YAML app configs.
     - Static documentation pages.
     - Boilerplate client code for interacting with services.

---

## 10. Summary

This specification defines a **unified, extensible system** that:

- Builds a canonical JSON model from distributed hierarchical JSON files using deep merge semantics.
- Uses that model to drive a flexible template engine capable of generating complete file trees.
- Introduces script integration and hook-based event handling to dynamically modify data, integrate external systems, and run the same logic:
  - At build time
  - During template rendering
  - At runtime in the browser
  - On remote machines via deployment tools

The system is **deliberately general-purpose** and designed to act as a **preprocessor and single source of truth** for more specialized tools (Terraform, Ansible, etc.), as well as for arbitrary documentation and configuration generation workflows.
