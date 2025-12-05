const path = require('path');
const fs = require('fs');
const { stackHashFromDirs, resolveStackDirs, resolveDirs, resolveBuildPaths } = require('./stack_paths');
const { createLogger } = require('./logger');
const { loadStack, loadInstancesOnly } = require('./stack_loader');
const { mapLikeToObject } = require('./core/object_utils');
const { validateStack } = require('./validation');
const { createIssueCollector } = require('./issue_collector');
const { createHandlebarsEngine } = require('./templates/handlebars_engine');
const { createServices } = require('./core/services');
const { fmt, step, loadEnv, buildClassHierarchy, cleanBuildDir, isReservedId } = require('./core/build_helpers');

const repoRoot = path.join(__dirname, '..');
const CANONICAL_VERSION = '0.0.0-alpha';
const CANONICAL_STABILITY = 'experimental';

// --- Output writers (shared by build commands) ---

function writeCanonical(buildDir, data, log) {
  const filePath = path.join(buildDir, 'canonical.json');
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  log.info(`  • canonical: ${fmt(filePath, 'dim')}`);
}

function writeValidation(metaDir, issues, log) {
  fs.mkdirSync(metaDir, { recursive: true });
  const filePath = path.join(metaDir, 'validation.json');
  fs.writeFileSync(filePath, JSON.stringify({ issues }, null, 2));
  log.info(`  • validation report: ${fmt(filePath, 'dim')}`);
}

function writeClassDefinitions(metaDir, resolvedClasses, log) {
  const classDefsDir = path.join(metaDir, 'class-definitions');
  let count = 0;
  resolvedClasses.forEach((def, name) => {
    if (def) {
      if (count === 0) fs.mkdirSync(classDefsDir, { recursive: true });
      fs.writeFileSync(path.join(classDefsDir, `${name}.json`), JSON.stringify(def, null, 2));
      count += 1;
    }
  });
  log.info(`  • class definitions: ${fmt(count, count ? 'green' : 'dim')} written to ${fmt(classDefsDir, 'dim')}`);
  return count;
}

function writeSchemas(metaDir, resolvedClasses, log) {
  const schemasDir = path.join(metaDir, 'class-schemas');
  let count = 0;
  resolvedClasses.forEach((def, name) => {
    if (def) {
      if (count === 0) fs.mkdirSync(schemasDir, { recursive: true });
      const schemaContent = def.schema || {};
      fs.writeFileSync(path.join(schemasDir, `${name}.schema.json`), JSON.stringify(schemaContent, null, 2));
      count += 1;
    }
  });
  if (count > 0) {
    log.info(`  • class schemas: ${fmt(count, 'green')} written to ${fmt(schemasDir, 'dim')}`);
  } else {
    log.info('  • class schemas: none (no schemas defined)');
  }
  return count;
}

function writeInstances(metaDir, stackObjects, log) {
  const instancesDir = path.join(metaDir, 'instances');
  fs.mkdirSync(instancesDir, { recursive: true });
  let count = 0;
  stackObjects.filter(obj => obj && obj.id).forEach(obj => {
    fs.writeFileSync(path.join(instancesDir, `${obj.id}.json`), JSON.stringify(obj, null, 2));
    count += 1;
  });
  log.info(`  • instances: ${fmt(count, 'green')} written to ${fmt(instancesDir, 'dim')}`);
  return count;
}

// --- Build commands ---

// Main build routine (used by CLI).
// Execution order is intentionally linear and stable to support future hook points:
// 1) load templates, 2) load + validate stack, 3) prepare build dir and metadata,
// 4) render outputs, 5) finalize/log. Keep this sequencing unchanged unless
// explicitly coordinating a hook/breaking change.
function runBuild(options) {
  const {
    classDirs: classDirInputs,
    instanceDirs: instanceDirInputs,
    templateDirs: templateDirInputs,
    outputs = new Set(['canonical', 'class-definitions', 'schemas', 'validation', 'templates']),
    buildRoot: buildRootInput,
    buildDir: buildDirInput,
    buildName: buildNameInput,
    includeHash = true,
    warningsAsErrors = false,
    warnExtraFields = false,
    failOnCollisions = false,
    quiet = false
  } = options || {};

  loadEnv(path.join(repoRoot, '.env'));
  const log = createLogger({ quiet });
  let classDirs, instanceDirs;
  try {
    classDirs = resolveStackDirs(classDirInputs);
    instanceDirs = resolveStackDirs(instanceDirInputs);
  } catch (e) {
    log.error(e.message);
    log.summarizeAndExitIfNeeded();
    return;
  }

  if (!classDirs.length) {
    log.error('At least one class source is required.');
    return;
  }
  if (!instanceDirs.length) {
    log.error('At least one instance source is required.');
    return;
  }

  // Resolve template dirs: explicit --templates-from, or union of class/instance sources
  let templateDirs;
  if (templateDirInputs && templateDirInputs.length) {
    try {
      templateDirs = resolveStackDirs(templateDirInputs);
    } catch (e) {
      log.error(e.message);
      log.summarizeAndExitIfNeeded();
      return;
    }
  } else {
    templateDirs = [...new Set([...classDirs, ...instanceDirs])];
  }

  // stackDirs for hash computation uses all sources
  const stackDirs = [...new Set([...classDirs, ...instanceDirs, ...templateDirs])];

  const { buildRoot, buildDir } = resolveBuildPaths({
    buildRootInput,
    buildDirInput,
    buildNameInput,
    stackDirs,
    includeHash
  });

  try {
    const templateEngine = createHandlebarsEngine({ stackDirs: templateDirs, log, quiet });
    log.info(`${step('Step 1/5')} ${fmt('Templates', 'cyan')}`);
    templateDirs.forEach((dir, idx) => log.info(`  ${fmt(`${idx + 1}.`, 'dim')} templates:${fmt(path.join(dir, 'templates'), 'dim')}`));
    const prepared = templateEngine.prepare();
    const templateStats = prepared && prepared.templateStats ? prepared.templateStats : templateEngine.templateStats;
    if (templateStats) {
      log.info(`  • loaded ${fmt(templateStats.totalCount, 'green')} (overrides ${templateStats.overrideCount})`);
    }

    log.info(`${step('Step 2/5')} ${fmt('Stack data', 'cyan')}`);
    classDirs.forEach((dir, idx) => log.info(`  ${fmt(`${idx + 1}.`, 'dim')} classes:  ${fmt(path.join(dir, 'classes'), 'dim')}`));
    instanceDirs.forEach((dir, idx) => log.info(`  ${fmt(`${idx + 1}.`, 'dim')} instances:${fmt(path.join(dir, 'instances'), 'dim')}`));
    const issues = createIssueCollector({ log, warningsAsErrors });
    const { stackObjects, instancesById, resolvedClasses, global } = loadStack({ stackDirs, classDirs, instanceDirs, log, issues });
    const stack = stackObjects;
    const instanceCount = stackObjects.filter(obj => obj && obj.id && !isReservedId(obj.id)).length;
    log.info(`  • loaded ${fmt(instanceCount, 'green')} objects (+global)`);
    log.info(`  • loaded ${fmt(resolvedClasses.size, 'green')} classes`);
    const validationResult = validateStack(stackObjects, resolvedClasses, { warningsAsErrors, warnExtraFields, log, issues });
    const allIssues = validationResult.issues;
    const warnCount = allIssues.filter(issue => issue.level === 'warn').length;
    const errorCount = allIssues.filter(issue => issue.level === 'error').length;
    log.info(`  • validation: ${fmt(warnCount, warnCount ? 'yellow' : 'dim')} warnings, ${fmt(errorCount, errorCount ? 'yellow' : 'dim')} errors`);

    const buildHash = stackHashFromDirs(stackDirs);
    const buildItemCount = stack.reduce((sum, obj) => sum + (Array.isArray(obj.build) ? obj.build.length : 0), 0);
    const canonical = {
      canonicalVersion: CANONICAL_VERSION,
      canonicalStability: CANONICAL_STABILITY,
      breakingChangesWithoutVersionBump: true,
      buildMeta: {
        generatedAt: new Date().toISOString(),
        classDirs,
        instanceDirs,
        templateDirs,
        classOrder: classDirs,
        instanceOrder: instanceDirs,
        templateOrder: templateDirs,
        stackHash: buildHash,
        buildDirName: path.basename(buildDir),
        buildRoot
      },
      global,
      classes: mapLikeToObject(resolvedClasses),
      classHierarchy: buildClassHierarchy(resolvedClasses),
      instances: stackObjects.filter(Boolean),
      instancesById: mapLikeToObject(instancesById)
    };
    const services = createServices(canonical);
    const canonicalSnapshot = services.snapshot;

    log.info(`${step('Step 3/5')} ${fmt('Prepare build dir', 'cyan')}`);
    log.info(`  • target: ${fmt(buildDir, 'dim')}`);
    cleanBuildDir(buildDir, buildRoot);
    fs.mkdirSync(buildDir, { recursive: true });

    // Write outputs based on --output flags
    const metaDir = path.join(buildDir, 'meta');
    if (outputs.has('canonical')) writeCanonical(buildDir, canonicalSnapshot, log);
    if (outputs.has('validation')) writeValidation(metaDir, allIssues, log);
    if (outputs.has('class-definitions')) writeClassDefinitions(metaDir, resolvedClasses, log);
    if (outputs.has('schemas')) writeSchemas(metaDir, resolvedClasses, log);
    if (outputs.has('instances')) writeInstances(metaDir, stackObjects, log);

    if (validationResult.hasErrors) {
      log.error('Validation failed; skipping render.');
      return;
    }

    if (!outputs.has('templates')) {
      log.info(`${step('Step 4/5')} ${fmt('Render outputs', 'cyan')} (skipped, not in --output)`);
      log.info(`${step('Step 5/5')} ${fmt('Complete', 'cyan')}`);
      log.info(`${fmt('Build succeeded', 'green')}`);
      return;
    }

    log.info(`${step('Step 4/5')} ${fmt('Render outputs', 'cyan')}`);
    log.info(`  • items: ${fmt(buildItemCount, 'green')} across ${instanceCount} objects (+global)`);
    log.info(`  • root:  ${fmt(buildDir, 'dim')}`);
    const renderResult = templateEngine.renderAll({ snapshot: canonicalSnapshot, buildDir, failOnCollisions, canonical: canonicalSnapshot, services });
    if (renderResult.collisionFatal) {
      return;
    }
    const renderedCount = renderResult.renderedCount || 0;

    log.info(`${step('Step 5/5')} ${fmt('Complete', 'cyan')}`);
    log.info(`  • rendered: ${fmt(renderedCount, 'green')} outputs`);
    log.info(`  • canonical: ${fmt(path.join(buildDir, 'canonical.json'), 'dim')}`);
    log.info(`${fmt('Build succeeded', 'green')}`);
  } catch (e) {
    log.error(e.message);
  } finally {
    log.summarizeAndExitIfNeeded();
  }
}

// Classes-only build: merges and outputs class definitions and schemas without loading instances or rendering templates.
function runClassesBuild(options) {
  const {
    classDirs: classDirInputs,
    outputs = new Set(['canonical', 'class-definitions', 'schemas']),
    buildRoot: buildRootInput,
    buildDir: buildDirInput,
    buildName: buildNameInput,
    includeHash = true,
    quiet = false
  } = options || {};

  loadEnv(path.join(repoRoot, '.env'));
  const log = createLogger({ quiet });
  let classDirs;
  try {
    classDirs = resolveStackDirs(classDirInputs);
  } catch (e) {
    log.error(e.message);
    log.summarizeAndExitIfNeeded();
    return;
  }

  if (!classDirs.length) {
    log.error('At least one class source is required.');
    return;
  }

  const { buildRoot, buildDir } = resolveBuildPaths({
    buildRootInput,
    buildDirInput,
    buildNameInput,
    stackDirs: classDirs,
    includeHash
  });

  try {
    const { loadResolvedClasses } = require('./class_loader');

    log.info(`${step('Step 1/2')} ${fmt('Load classes', 'cyan')}`);
    classDirs.forEach((dir, idx) => log.info(`  ${fmt(`${idx + 1}.`, 'dim')} classes:  ${fmt(path.join(dir, 'classes'), 'dim')}`));

    const { resolvedClasses } = loadResolvedClasses(classDirs, log);
    log.info(`  • loaded ${fmt(resolvedClasses.size, 'green')} classes`);

    const buildHash = stackHashFromDirs(classDirs);
    const canonical = {
      canonicalVersion: CANONICAL_VERSION,
      canonicalStability: CANONICAL_STABILITY,
      breakingChangesWithoutVersionBump: true,
      buildMeta: {
        generatedAt: new Date().toISOString(),
        classDirs,
        classOrder: classDirs,
        mode: 'classes-only',
        stackHash: buildHash,
        buildDirName: path.basename(buildDir),
        buildRoot
      },
      classes: mapLikeToObject(resolvedClasses),
      classHierarchy: buildClassHierarchy(resolvedClasses)
    };

    log.info(`${step('Step 2/2')} ${fmt('Write outputs', 'cyan')}`);
    log.info(`  • target: ${fmt(buildDir, 'dim')}`);
    cleanBuildDir(buildDir, buildRoot);
    fs.mkdirSync(buildDir, { recursive: true });

    const metaDir = path.join(buildDir, 'meta');
    if (outputs.has('canonical')) writeCanonical(buildDir, canonical, log);
    if (outputs.has('class-definitions')) writeClassDefinitions(metaDir, resolvedClasses, log);
    if (outputs.has('schemas')) writeSchemas(metaDir, resolvedClasses, log);

    log.info(`${fmt('Classes build succeeded', 'green')}`);
  } catch (e) {
    log.error(e.message);
  } finally {
    log.summarizeAndExitIfNeeded();
  }
}

// Validate-only: loads classes and instances, runs validation, and reports results without rendering.
// Accepts classDirs and instanceDirs directly (no stackDirs required).
function runValidate(options) {
  const {
    classDirs: classDirInputs,
    instanceDirs: instanceDirInputs,
    outputs = new Set(['summary']),
    warningsAsErrors = false,
    warnExtraFields = false,
    quiet = false
  } = options || {};

  const outputJson = outputs.has('json');
  // If outputting JSON, suppress log output to keep stdout clean
  loadEnv(path.join(repoRoot, '.env'));
  const log = createLogger({ quiet: quiet || outputJson });

  let classDirs, instanceDirs;
  try {
    classDirs = resolveStackDirs(classDirInputs);
    instanceDirs = resolveStackDirs(instanceDirInputs);
  } catch (e) {
    if (outputJson) {
      console.log(JSON.stringify({ error: e.message, issues: [] }, null, 2));
    } else {
      log.error(e.message);
    }
    log.summarizeAndExitIfNeeded();
    return;
  }

  if (!classDirs.length) {
    const msg = 'At least one --classes-from directory is required.';
    if (outputJson) {
      console.log(JSON.stringify({ error: msg, issues: [] }, null, 2));
    } else {
      log.error(msg);
    }
    return;
  }
  if (!instanceDirs.length) {
    const msg = 'At least one --instances-from directory is required.';
    if (outputJson) {
      console.log(JSON.stringify({ error: msg, issues: [] }, null, 2));
    } else {
      log.error(msg);
    }
    return;
  }

  try {
    log.info(`${step('Step 1/3')} ${fmt('Load classes', 'cyan')}`);
    classDirs.forEach((dir, idx) => log.info(`  ${fmt(`${idx + 1}.`, 'dim')} classes:  ${fmt(path.join(dir, 'classes'), 'dim')}`));
    const issues = createIssueCollector({ log, warningsAsErrors });

    // Use a dummy stackDirs that covers both sources for loadStack compatibility
    const allDirs = [...new Set([...classDirs, ...instanceDirs])];
    const { stackObjects, resolvedClasses } = loadStack({ stackDirs: allDirs, classDirs, instanceDirs, log, issues });
    log.info(`  • loaded ${fmt(resolvedClasses.size, 'green')} classes`);

    log.info(`${step('Step 2/3')} ${fmt('Load instances', 'cyan')}`);
    instanceDirs.forEach((dir, idx) => log.info(`  ${fmt(`${idx + 1}.`, 'dim')} instances:${fmt(path.join(dir, 'instances'), 'dim')}`));
    const instanceCount = stackObjects.filter(obj => obj && obj.id && !isReservedId(obj.id)).length;
    log.info(`  • loaded ${fmt(instanceCount, 'green')} objects (+global)`);

    log.info(`${step('Step 3/3')} ${fmt('Validate', 'cyan')}`);
    const validationResult = validateStack(stackObjects, resolvedClasses, { warningsAsErrors, warnExtraFields, log, issues });
    const allIssues = validationResult.issues;
    const warnCount = allIssues.filter(issue => issue.level === 'warn').length;
    const errorCount = allIssues.filter(issue => issue.level === 'error').length;

    if (outputJson) {
      // Output JSON to stdout
      console.log(JSON.stringify({
        passed: !validationResult.hasErrors,
        classDirs,
        instanceDirs,
        classCount: resolvedClasses.size,
        instanceCount,
        warningCount: warnCount,
        errorCount,
        issues: allIssues
      }, null, 2));
    } else {
      log.info(`  • warnings: ${fmt(warnCount, warnCount ? 'yellow' : 'dim')}`);
      log.info(`  • errors: ${fmt(errorCount, errorCount ? 'red' : 'dim')}`);

      if (validationResult.hasErrors) {
        log.error('Validation failed.');
        allIssues.filter(i => i.level === 'error').forEach(issue => {
          log.error(`  ${issue.message}`);
        });
      } else {
        log.info(`${fmt('Validation passed', 'green')}`);
      }
    }

    // Exit with error code if validation failed
    if (validationResult.hasErrors) {
      process.exitCode = 1;
    }
  } catch (e) {
    if (outputJson) {
      console.log(JSON.stringify({ error: e.message, issues: [] }, null, 2));
    } else {
      log.error(e.message);
    }
  } finally {
    log.summarizeAndExitIfNeeded();
  }
}

// Instances-only build: merges instances without class resolution or validation.
// Outputs raw merged instance data for external processing or validation.
function runInstancesBuild(options) {
  const {
    instanceDirs: instanceDirInputs,
    outputs = new Set(['canonical']),
    buildRoot: buildRootInput,
    buildDir: buildDirInput,
    buildName: buildNameInput,
    includeHash = true,
    quiet = false
  } = options || {};

  loadEnv(path.join(repoRoot, '.env'));
  const log = createLogger({ quiet });
  let instanceDirs;
  try {
    instanceDirs = resolveStackDirs(instanceDirInputs);
  } catch (e) {
    log.error(e.message);
    log.summarizeAndExitIfNeeded();
    return;
  }

  if (!instanceDirs.length) {
    log.error('At least one instance source is required.');
    return;
  }

  const { buildRoot, buildDir } = resolveBuildPaths({
    buildRootInput,
    buildDirInput,
    buildNameInput,
    stackDirs: instanceDirs,
    includeHash
  });

  try {
    log.info(`${step('Step 1/2')} ${fmt('Load instances', 'cyan')}`);
    instanceDirs.forEach((dir, idx) => log.info(`  ${fmt(`${idx + 1}.`, 'dim')} instances:${fmt(path.join(dir, 'instances'), 'dim')}`));
    const { stackObjects, instancesById, global } = loadInstancesOnly({ instanceDirs, log });
    const instanceCount = stackObjects.filter(obj => obj && obj.id && !isReservedId(obj.id)).length;
    log.info(`  • loaded ${fmt(instanceCount, 'green')} objects (+global)`);

    const buildHash = stackHashFromDirs(instanceDirs);
    const canonical = {
      canonicalVersion: CANONICAL_VERSION,
      canonicalStability: CANONICAL_STABILITY,
      breakingChangesWithoutVersionBump: true,
      buildMeta: {
        generatedAt: new Date().toISOString(),
        instanceDirs,
        instanceOrder: instanceDirs,
        mode: 'instances-only',
        stackHash: buildHash,
        buildDirName: path.basename(buildDir),
        buildRoot
      },
      global,
      instances: stackObjects.filter(Boolean),
      instancesById: mapLikeToObject(instancesById)
    };

    log.info(`${step('Step 2/2')} ${fmt('Write outputs', 'cyan')}`);
    log.info(`  • target: ${fmt(buildDir, 'dim')}`);
    cleanBuildDir(buildDir, buildRoot);
    fs.mkdirSync(buildDir, { recursive: true });

    const metaDir = path.join(buildDir, 'meta');
    if (outputs.has('canonical')) writeCanonical(buildDir, canonical, log);
    if (outputs.has('instances')) writeInstances(metaDir, stackObjects, log);

    log.info(`${fmt('Instances build succeeded', 'green')}`);
  } catch (e) {
    log.error(e.message);
  } finally {
    log.summarizeAndExitIfNeeded();
  }
}

module.exports = {
  runBuild,
  runClassesBuild,
  runInstancesBuild,
  runValidate
};
