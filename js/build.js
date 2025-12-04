const path = require('path');
const fs = require('fs');
const { resolveStackDir, buildDirNameFromPath, stackHashFromPath } = require('./stack_paths');
const { createLogger } = require('./logger');
const { loadStack } = require('./stack_loader');
const { loadTemplates, renderTemplate, resolveOutputPath } = require('./template_utils');
const { mapLikeToObject } = require('./object_utils');
const { parentsFor } = require('./template_resolution');
const { validateStack } = require('./validation');
const { createIssueCollector } = require('./issue_collector');

const repoRoot = path.join(__dirname, '..');
const CANONICAL_VERSION = '0.0.0-alpha';
const CANONICAL_STABILITY = 'experimental';
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  magenta: '\x1b[35m'
};
const ENABLE_COLOR = process.stdout && process.stdout.isTTY && process.env.NO_COLOR !== '1' && process.env.FORCE_COLOR !== '0';

function fmt(text, color) {
  if (!ENABLE_COLOR || !color || !colors[color]) return text;
  return `${colors[color]}${text}${colors.reset}`;
}

function step(label) {
  return fmt(label, 'bold');
}

// Build a DAG-style view of class inheritance, respecting declared parent order.
function buildClassHierarchy(resolvedClasses) {
  const names = Array.from(resolvedClasses.keys());
  const parentMap = new Map();
  const childMap = new Map();

  names.forEach(name => {
    const def = resolvedClasses.get(name) || {};
    const parents = parentsFor(def);
    parentMap.set(name, parents);
    parents.forEach(parent => {
      if (!childMap.has(parent)) {
        childMap.set(parent, new Set());
      }
      childMap.get(parent).add(name);
    });
  });

  const roots = names.filter(name => parentMap.get(name).length === 0).sort();

  function buildNode(name, seen = new Set()) {
    const parents = parentMap.get(name) || [];
    const cycle = seen.has(name);
    const nextSeen = new Set(seen).add(name);
    const children = Array.from(childMap.get(name) || []).sort().map(child => buildNode(child, nextSeen));
    return { class: name, parents, children, cycle };
  }

  return roots.map(root => buildNode(root));
}

// Load a .env file into process.env (best-effort; stays silent if missing).
function loadEnv(envPath) {
  const target = envPath || path.join(repoRoot, '.env');
  if (!target || !fs.existsSync(target)) {
    return;
  }
  try {
    const dotenv = require('dotenv');
    dotenv.config({ path: target });
    return;
  } catch (err) {
    if (err && err.code !== 'MODULE_NOT_FOUND') {
      console.warn(`Warning: failed to load .env from ${target}: ${err.message}`);
    }
  }

  // Fallback: minimal .env parser to avoid hard failure when dotenv is missing.
  const contents = fs.readFileSync(target, 'utf8');
  contents.split(/\r?\n/).forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      return;
    }
    const idx = trimmed.indexOf('=');
    if (idx === -1) {
      return;
    }
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (key && !Object.prototype.hasOwnProperty.call(process.env, key)) {
      process.env[key] = value;
    }
  });
}

function isReservedId(id) {
  return id === 'global';
}

// Resolve defaults dir relative to CWD, validating existence and type.
function resolveDefaultsDir(defaultsDirInput) {
  const base = defaultsDirInput || path.join(repoRoot, 'defaults');
  const abs = path.isAbsolute(base) ? base : path.resolve(process.cwd(), base);
  if (!fs.existsSync(abs)) {
    return abs;
  }
  const real = fs.realpathSync(abs);
  const stat = fs.statSync(real);
  if (!stat.isDirectory()) {
    throw new Error(`Defaults path is not a directory: ${defaultsDirInput || base}`);
  }
  return real;
}

// Render a template for a single build entry and write outputs (including nested file helper outputs).
function writeTemplate(templateKey, filename, templates, buildDir, obj, stackById, log, seenOutputs, options = {}) {
  const { failOnCollisions = false, collisionState, canonical } = options;
  const collision = (message) => {
    if (failOnCollisions) {
      if (collisionState) collisionState.fatal = true;
      log.error(message);
    } else {
      log.warn(message);
    }
  };

  const templateContent = templates[templateKey];
  if (templateContent === undefined) {
    log.warn(`Template '${templateKey}' not found for ${filename}`);
    return;
  }

  const outPath = resolveOutputPath(templateKey, filename, buildDir, log);
  if (!outPath) {
    return;
  }

  const outputs = [];
  const rendered = renderTemplate(
    templateKey,
    templateContent,
    obj,
    stackById,
    log,
    { buildDir, outputs, canonical }
  );
  if (seenOutputs) {
    if (seenOutputs.has(outPath)) {
      collision(`Duplicate output path '${outPath}' from template '${templateKey}'`);
      if (failOnCollisions) {
        return;
      }
    }
    seenOutputs.add(outPath);
  }
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, rendered, 'utf8');
  outputs.forEach(extra => {
    if (seenOutputs) {
      if (seenOutputs.has(extra.path)) {
        collision(`Duplicate output path '${extra.path}' emitted from helper inside '${templateKey}'`);
        if (failOnCollisions) {
          return;
        }
      }
      seenOutputs.add(extra.path);
    }
    fs.mkdirSync(path.dirname(extra.path), { recursive: true });
    fs.writeFileSync(extra.path, extra.content, 'utf8');
  });
}

// Remove and recreate a build directory, ensuring it stays inside build root.
function cleanBuildDir(buildDir, buildRoot) {
  const buildDirRelative = path.relative(buildRoot, buildDir);
  if (buildDirRelative.startsWith('..') || path.isAbsolute(buildDirRelative)) {
    throw new Error(`Refusing to delete build directory outside build root: ${buildDir}`);
  }
  if (fs.existsSync(buildDir)) {
    fs.rmSync(buildDir, { recursive: true, force: true });
  }
}

// Main build routine (used by CLI).
// Execution order is intentionally linear and stable to support future hook points:
// 1) load templates, 2) load + validate stack, 3) prepare build dir and metadata,
// 4) render outputs, 5) finalize/log. Keep this sequencing unchanged unless
// explicitly coordinating a hook/breaking change.
function runBuild(options) {
  const {
    stackDir: stackDirInput,
    defaultsDir: defaultsDirInput,
    warningsAsErrors = false,
    warnExtraFields = false,
    failOnCollisions = false,
    quiet = false
  } = options || {};

  loadEnv(path.join(repoRoot, '.env'));
  const log = createLogger({ quiet });
  let stackDir;
  let defaultsDir;

  try {
    const stackPath = path.isAbsolute(stackDirInput) ? stackDirInput : path.resolve(process.cwd(), stackDirInput);
    stackDir = resolveStackDir(stackPath);
    defaultsDir = resolveDefaultsDir(defaultsDirInput);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }

  const buildRoot = path.join(repoRoot, 'build');
  const buildDir = path.join(buildRoot, buildDirNameFromPath(stackDir));

  try {
    if (!quiet) {
      console.log(`${step('Step 1/5')} ${fmt('Templates', 'cyan')}`);
      console.log(`  • defaults: ${fmt(path.join(defaultsDir, 'templates'), 'dim')}`);
      console.log(`  • stack:    ${fmt(path.join(stackDir, 'templates'), 'dim')}`);
    }
    const { templates, stats: templateStats } = loadTemplates(stackDir, defaultsDir, log);
    if (!quiet) {
      console.log(`  • loaded ${fmt(templateStats.totalCount, 'green')} (defaults ${templateStats.defaultsCount}, stack ${templateStats.stackCount}, overrides ${templateStats.overrideCount})`);
    }

    if (!quiet) {
      console.log(`${step('Step 2/5')} ${fmt('Stack data', 'cyan')}`);
      console.log(`  • defaults: ${fmt(defaultsDir, 'dim')}`);
      console.log(`  • stack:    ${fmt(stackDir, 'dim')}`);
    }
    const issues = createIssueCollector({ log, warningsAsErrors });
    const { stackObjects, stackById, resolvedClasses, global } = loadStack(stackDir, defaultsDir, log, { issues });
    const stack = stackObjects;
    const instanceCount = stackObjects.filter(obj => obj && obj.id && !isReservedId(obj.id)).length;
    if (!quiet) {
      console.log(`  • loaded ${fmt(instanceCount, 'green')} objects (+global)`);
      console.log(`  • loaded ${fmt(resolvedClasses.size, 'green')} classes`);
    }
    const validationResult = validateStack(stackObjects, resolvedClasses, { warningsAsErrors, warnExtraFields, log, issues });
    const allIssues = validationResult.issues;
    const warnCount = allIssues.filter(issue => issue.level === 'warn').length;
    const errorCount = allIssues.filter(issue => issue.level === 'error').length;
    if (!quiet) {
      console.log(`  • validation: ${fmt(warnCount, warnCount ? 'yellow' : 'dim')} warnings, ${fmt(errorCount, errorCount ? 'yellow' : 'dim')} errors`);
    }

    const buildHash = stackHashFromPath(stackDir);
    const buildItemCount = stack.reduce((sum, obj) => sum + (Array.isArray(obj.build) ? obj.build.length : 0), 0);
    const canonical = {
      canonicalVersion: CANONICAL_VERSION,
      canonicalStability: CANONICAL_STABILITY,
      breakingChangesWithoutVersionBump: true,
      buildMeta: {
        generatedAt: new Date().toISOString(),
        stackDir,
        defaultsDir,
        stackHash: buildHash,
        buildDirName: path.basename(buildDir)
      },
      global,
      classes: mapLikeToObject(resolvedClasses),
      classHierarchy: buildClassHierarchy(resolvedClasses),
      instances: stackObjects.filter(obj => obj && obj.id && !isReservedId(obj.id)),
      stackById: mapLikeToObject(stackById)
    };

    if (!quiet) {
      console.log(`${step('Step 3/5')} ${fmt('Prepare build dir', 'cyan')}`);
      console.log(`  • target: ${fmt(buildDir, 'dim')}`);
    }
    cleanBuildDir(buildDir, buildRoot);
    fs.mkdirSync(buildDir, { recursive: true });
    fs.writeFileSync(path.join(buildDir, 'canonical.json'), JSON.stringify(canonical, null, 2));
    const metaDir = path.join(buildDir, 'meta');
    fs.mkdirSync(metaDir, { recursive: true });
    const validationPath = path.join(metaDir, 'validation.json');
    fs.writeFileSync(validationPath, JSON.stringify({ issues: allIssues }, null, 2));
    const classSchemasDir = path.join(metaDir, 'class-schemas');
    const classDefsDir = path.join(metaDir, 'class-definitions');
    let classSchemaCount = 0;
    let classDefCount = 0;
    resolvedClasses.forEach((def, name) => {
      if (def) {
        if (classDefCount === 0) {
          fs.mkdirSync(classDefsDir, { recursive: true });
        }
        fs.writeFileSync(path.join(classDefsDir, `${name}.json`), JSON.stringify(def, null, 2));
        classDefCount += 1;
      }
      if (def) {
        if (classSchemaCount === 0) {
          fs.mkdirSync(classSchemasDir, { recursive: true });
        }
        const schemaContent = def.schema ? def.schema : {};
        fs.writeFileSync(path.join(classSchemasDir, `${name}.schema.json`), JSON.stringify(schemaContent, null, 2));
        classSchemaCount += 1;
      }
    });
    if (!quiet) {
      console.log(`  • validation report: ${fmt(validationPath, 'dim')}`);
      console.log(`  • class definitions: ${fmt(classDefCount, classDefCount ? 'green' : 'dim')} written to ${fmt(classDefsDir, 'dim')}`);
      if (classSchemaCount > 0) {
        console.log(`  • class schemas: ${fmt(classSchemaCount, 'green')} written to ${fmt(classSchemasDir, 'dim')}`);
      } else {
        console.log('  • class schemas: none (no schemas defined)');
      }
    }
    if (validationResult.hasErrors) {
      log.error('Validation failed; skipping render.');
      return;
    }

    if (!quiet) {
      console.log(`${step('Step 4/5')} ${fmt('Render outputs', 'cyan')}`);
      console.log(`  • items: ${fmt(buildItemCount, 'green')} across ${instanceCount} objects (+global)`);
      console.log(`  • root:  ${fmt(buildDir, 'dim')}`);
    }
    const outputPaths = new Set();
    const plannedPaths = new Map(); // path -> [templateKey, objId]
    let renderedCount = 0;
    const collisionState = { fatal: false };
    const collisionLog = (message) => {
      if (failOnCollisions) {
        collisionState.fatal = true;
        log.error(message);
      } else {
        log.warn(message);
      }
    };

    // Pre-flight planned outputs to spot collisions early (non-helper outputs only).
    stack
      .filter(obj => Array.isArray(obj.build) && obj.build.length > 0)
      .forEach(obj => {
        obj.build.forEach(buildItem => {
          if (typeof buildItem === 'string') {
            const ext = path.extname(buildItem);
            const filename = obj.id + ext;
            const outPath = resolveOutputPath(buildItem, filename, buildDir, log);
            if (outPath) {
              const prev = plannedPaths.get(outPath);
              if (prev && prev[0] !== buildItem) {
                collisionLog(`Planned output collision at '${outPath}' between templates '${prev[0]}' (object '${prev[1]}') and '${buildItem}' (object '${obj.id}').`);
              }
              plannedPaths.set(outPath, [buildItem, obj.id]);
            }
            return;
          }
          if (typeof buildItem === 'object' && buildItem !== null) {
            Object.entries(buildItem).forEach(([templateKey, filename]) => {
              const outPath = resolveOutputPath(templateKey, filename, buildDir, log);
              if (outPath) {
                const prev = plannedPaths.get(outPath);
                if (prev && (prev[0] !== templateKey || prev[1] !== obj.id)) {
                  collisionLog(`Planned output collision at '${outPath}' between templates '${prev[0]}' (object '${prev[1]}') and '${templateKey}' (object '${obj.id}').`);
                }
                plannedPaths.set(outPath, [templateKey, obj.id]);
              }
            });
            return;
          }
        });
      });

    if (collisionState.fatal) {
      log.error('Output collisions detected during planning; aborting render (--fail-on-collisions).');
      return;
    }

    stack
      .filter(obj => Array.isArray(obj.build) && obj.build.length > 0)
      .forEach(obj => {
        if (!quiet) {
          console.log(`  - ${fmt('process', 'magenta')} ${obj.id}`);
        }
        obj.build.forEach(buildItem => {
          if (typeof buildItem === 'string') {
            const ext = path.extname(buildItem);
            const filename = obj.id + ext;
            writeTemplate(buildItem, filename, templates, buildDir, obj, stackById, log, outputPaths, { failOnCollisions, collisionState, canonical });
            renderedCount += 1;
            return;
          }
          if (typeof buildItem === 'object' && buildItem !== null) {
            Object.entries(buildItem).forEach(([templateKey, filename]) => {
              writeTemplate(templateKey, filename, templates, buildDir, obj, stackById, log, outputPaths, { failOnCollisions, collisionState, canonical });
              renderedCount += 1;
            });
            return;
          }
          log.warn(`Skipping invalid build entry in ${obj.id}: ${JSON.stringify(buildItem)}`);
        });
      });

    if (collisionState.fatal) {
      log.error('Output collisions detected; build aborted due to --fail-on-collisions.');
      return;
    }

    if (!quiet) {
      console.log(`${step('Step 5/5')} ${fmt('Complete', 'cyan')}`);
      console.log(`  • rendered: ${fmt(renderedCount, 'green')} outputs`);
      console.log(`  • canonical: ${fmt(path.join(buildDir, 'canonical.json'), 'dim')}`);
      console.log(`${fmt('Build succeeded', 'green')}`);
    }
  } catch (e) {
    log.error(e.message);
  } finally {
    log.summarizeAndExitIfNeeded();
  }
}

module.exports = {
  runBuild
};
