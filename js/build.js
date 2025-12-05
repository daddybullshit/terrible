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
const {
  fmt, step, loadEnv, buildClassHierarchy, cleanBuildDir, isReservedId,
  CANONICAL, OUTPUT_TYPES, logSourceDirs,
  writeCanonical, writeClassDefinitions, writeInstances, writeSchemas, writeValidation
} = require('./core/build_helpers');

const repoRoot = path.join(__dirname, '..');

// --- Build initialization helpers ---

function initBuildEnv(quiet) {
  loadEnv(path.join(repoRoot, '.env'));
  return createLogger({ quiet });
}

function resolveSourceDirs(inputs, label, log) {
  try {
    const dirs = resolveStackDirs(inputs);
    if (!dirs.length) {
      throw new Error(`At least one ${label} source is required.`);
    }
    return dirs;
  } catch (e) {
    log.error(e.message);
    log.summarizeAndExitIfNeeded();
    return null;
  }
}

function prepareBuildDir(buildDir, buildRoot, log) {
  log.info(`  • target: ${fmt(buildDir, 'dim')}`);
  cleanBuildDir(buildDir, buildRoot);
  fs.mkdirSync(buildDir, { recursive: true });
}

function buildCanonicalBase(mode, { stackHash, buildDirName, buildRoot }) {
  return {
    canonicalVersion: CANONICAL.version,
    canonicalStability: CANONICAL.stability,
    breakingChangesWithoutVersionBump: CANONICAL.breakingChanges,
    buildMeta: {
      generatedAt: new Date().toISOString(),
      mode,
      stackHash,
      buildDirName,
      buildRoot
    }
  };
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
    outputs = new Set([OUTPUT_TYPES.CANONICAL, OUTPUT_TYPES.CLASS_DEFINITIONS, OUTPUT_TYPES.SCHEMAS, OUTPUT_TYPES.VALIDATION, OUTPUT_TYPES.TEMPLATES]),
    buildRoot: buildRootInput,
    buildDir: buildDirInput,
    buildName: buildNameInput,
    includeHash = true,
    warningsAsErrors = false,
    warnExtraFields = false,
    failOnCollisions = false,
    quiet = false
  } = options || {};

  const log = initBuildEnv(quiet);
  
  const classDirs = resolveSourceDirs(classDirInputs, 'class', log);
  if (!classDirs) return;
  
  const instanceDirs = resolveSourceDirs(instanceDirInputs, 'instance', log);
  if (!instanceDirs) return;

  // Resolve template dirs: explicit --templates-from, or union of class/instance sources
  let templateDirs;
  if (templateDirInputs && templateDirInputs.length) {
    templateDirs = resolveSourceDirs(templateDirInputs, 'template', log);
    if (!templateDirs) return;
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
    logSourceDirs(templateDirs, 'templates', log);
    const prepared = templateEngine.prepare();
    const templateStats = prepared && prepared.templateStats ? prepared.templateStats : templateEngine.templateStats;
    if (templateStats) {
      log.info(`  • loaded ${fmt(templateStats.totalCount, 'green')} (overrides ${templateStats.overrideCount})`);
    }

    log.info(`${step('Step 2/5')} ${fmt('Stack data', 'cyan')}`);
    logSourceDirs(classDirs, 'classes', log);
    logSourceDirs(instanceDirs, 'instances', log);
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
    const canonicalBase = buildCanonicalBase('full', { stackHash: buildHash, buildDirName: path.basename(buildDir), buildRoot });
    const canonical = {
      ...canonicalBase,
      buildMeta: {
        ...canonicalBase.buildMeta,
        classDirs,
        instanceDirs,
        templateDirs,
        classOrder: classDirs,
        instanceOrder: instanceDirs,
        templateOrder: templateDirs
      },
      global,
      classes: mapLikeToObject(resolvedClasses),
      classHierarchy: buildClassHierarchy(resolvedClasses),
      instances: stackObjects.filter(Boolean),
      instancesById: mapLikeToObject(instancesById)
    };
    const services = createServices(canonical);
    const canonicalSnapshot = services.snapshot;
    const buildItemCount = stack.reduce((sum, obj) => sum + (Array.isArray(obj.build) ? obj.build.length : 0), 0);

    log.info(`${step('Step 3/5')} ${fmt('Prepare build dir', 'cyan')}`);
    prepareBuildDir(buildDir, buildRoot, log);

    // Write outputs based on --output flags
    const metaDir = path.join(buildDir, 'meta');
    if (outputs.has(OUTPUT_TYPES.CANONICAL)) writeCanonical(buildDir, canonicalSnapshot, log);
    if (outputs.has(OUTPUT_TYPES.VALIDATION)) writeValidation(metaDir, allIssues, log);
    if (outputs.has(OUTPUT_TYPES.CLASS_DEFINITIONS)) writeClassDefinitions(metaDir, resolvedClasses, log);
    if (outputs.has(OUTPUT_TYPES.SCHEMAS)) writeSchemas(metaDir, resolvedClasses, log);
    if (outputs.has(OUTPUT_TYPES.INSTANCES)) writeInstances(metaDir, stackObjects, log);

    if (validationResult.hasErrors) {
      log.error('Validation failed; skipping render.');
      return;
    }

    if (!outputs.has(OUTPUT_TYPES.TEMPLATES)) {
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
    outputs = new Set([OUTPUT_TYPES.CANONICAL, OUTPUT_TYPES.CLASS_DEFINITIONS, OUTPUT_TYPES.SCHEMAS]),
    buildRoot: buildRootInput,
    buildDir: buildDirInput,
    buildName: buildNameInput,
    includeHash = true,
    quiet = false
  } = options || {};

  const log = initBuildEnv(quiet);
  const classDirs = resolveSourceDirs(classDirInputs, 'class', log);
  if (!classDirs) return;

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
    logSourceDirs(classDirs, 'classes', log);

    const { resolvedClasses } = loadResolvedClasses(classDirs, log);
    log.info(`  • loaded ${fmt(resolvedClasses.size, 'green')} classes`);

    const buildHash = stackHashFromDirs(classDirs);
    const canonicalBase = buildCanonicalBase('classes-only', { stackHash: buildHash, buildDirName: path.basename(buildDir), buildRoot });
    const canonical = {
      ...canonicalBase,
      buildMeta: {
        ...canonicalBase.buildMeta,
        classDirs,
        classOrder: classDirs
      },
      classes: mapLikeToObject(resolvedClasses),
      classHierarchy: buildClassHierarchy(resolvedClasses)
    };

    log.info(`${step('Step 2/2')} ${fmt('Write outputs', 'cyan')}`);
    prepareBuildDir(buildDir, buildRoot, log);

    const metaDir = path.join(buildDir, 'meta');
    if (outputs.has(OUTPUT_TYPES.CANONICAL)) writeCanonical(buildDir, canonical, log);
    if (outputs.has(OUTPUT_TYPES.CLASS_DEFINITIONS)) writeClassDefinitions(metaDir, resolvedClasses, log);
    if (outputs.has(OUTPUT_TYPES.SCHEMAS)) writeSchemas(metaDir, resolvedClasses, log);

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
    outputs = new Set([OUTPUT_TYPES.SUMMARY]),
    warningsAsErrors = false,
    warnExtraFields = false,
    quiet = false
  } = options || {};

  const outputJson = outputs.has(OUTPUT_TYPES.JSON);
  // If outputting JSON, suppress log output to keep stdout clean
  const log = initBuildEnv(quiet || outputJson);

  // Helper for JSON error output
  const jsonError = (msg) => console.log(JSON.stringify({ error: msg, issues: [] }, null, 2));

  let classDirs, instanceDirs;
  try {
    classDirs = resolveStackDirs(classDirInputs);
    instanceDirs = resolveStackDirs(instanceDirInputs);
  } catch (e) {
    if (outputJson) jsonError(e.message);
    else log.error(e.message);
    log.summarizeAndExitIfNeeded();
    return;
  }

  if (!classDirs.length) {
    const msg = 'At least one --classes-from directory is required.';
    if (outputJson) jsonError(msg);
    else log.error(msg);
    return;
  }
  if (!instanceDirs.length) {
    const msg = 'At least one --instances-from directory is required.';
    if (outputJson) jsonError(msg);
    else log.error(msg);
    return;
  }

  try {
    log.info(`${step('Step 1/3')} ${fmt('Load classes', 'cyan')}`);
    logSourceDirs(classDirs, 'classes', log);
    const issues = createIssueCollector({ log, warningsAsErrors });

    // Use a dummy stackDirs that covers both sources for loadStack compatibility
    const allDirs = [...new Set([...classDirs, ...instanceDirs])];
    const { stackObjects, resolvedClasses } = loadStack({ stackDirs: allDirs, classDirs, instanceDirs, log, issues });
    log.info(`  • loaded ${fmt(resolvedClasses.size, 'green')} classes`);

    log.info(`${step('Step 2/3')} ${fmt('Load instances', 'cyan')}`);
    logSourceDirs(instanceDirs, 'instances', log);
    const instanceCount = stackObjects.filter(obj => obj && obj.id && !isReservedId(obj.id)).length;
    log.info(`  • loaded ${fmt(instanceCount, 'green')} objects (+global)`);

    log.info(`${step('Step 3/3')} ${fmt('Validate', 'cyan')}`);
    const validationResult = validateStack(stackObjects, resolvedClasses, { warningsAsErrors, warnExtraFields, log, issues });
    const allIssues = validationResult.issues;
    const warnCount = allIssues.filter(issue => issue.level === 'warn').length;
    const errorCount = allIssues.filter(issue => issue.level === 'error').length;

    if (outputJson) {
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

    if (validationResult.hasErrors) {
      process.exitCode = 1;
    }
  } catch (e) {
    if (outputJson) jsonError(e.message);
    else log.error(e.message);
  } finally {
    log.summarizeAndExitIfNeeded();
  }
}

// Instances-only build: merges instances without class resolution or validation.
// Outputs raw merged instance data for external processing or validation.
function runInstancesBuild(options) {
  const {
    instanceDirs: instanceDirInputs,
    outputs = new Set([OUTPUT_TYPES.CANONICAL]),
    buildRoot: buildRootInput,
    buildDir: buildDirInput,
    buildName: buildNameInput,
    includeHash = true,
    quiet = false
  } = options || {};

  const log = initBuildEnv(quiet);
  const instanceDirs = resolveSourceDirs(instanceDirInputs, 'instance', log);
  if (!instanceDirs) return;

  const { buildRoot, buildDir } = resolveBuildPaths({
    buildRootInput,
    buildDirInput,
    buildNameInput,
    stackDirs: instanceDirs,
    includeHash
  });

  try {
    log.info(`${step('Step 1/2')} ${fmt('Load instances', 'cyan')}`);
    logSourceDirs(instanceDirs, 'instances', log);
    const { stackObjects, instancesById, global } = loadInstancesOnly({ instanceDirs, log });
    const instanceCount = stackObjects.filter(obj => obj && obj.id && !isReservedId(obj.id)).length;
    log.info(`  • loaded ${fmt(instanceCount, 'green')} objects (+global)`);

    const buildHash = stackHashFromDirs(instanceDirs);
    const canonicalBase = buildCanonicalBase('instances-only', { stackHash: buildHash, buildDirName: path.basename(buildDir), buildRoot });
    const canonical = {
      ...canonicalBase,
      buildMeta: {
        ...canonicalBase.buildMeta,
        instanceDirs,
        instanceOrder: instanceDirs
      },
      global,
      instances: stackObjects.filter(Boolean),
      instancesById: mapLikeToObject(instancesById)
    };

    log.info(`${step('Step 2/2')} ${fmt('Write outputs', 'cyan')}`);
    prepareBuildDir(buildDir, buildRoot, log);

    const metaDir = path.join(buildDir, 'meta');
    if (outputs.has(OUTPUT_TYPES.CANONICAL)) writeCanonical(buildDir, canonical, log);
    if (outputs.has(OUTPUT_TYPES.INSTANCES)) writeInstances(metaDir, stackObjects, log);

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
