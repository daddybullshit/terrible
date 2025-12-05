const path = require('path');
const fs = require('fs');
const { stackHashFromDirs, resolveStackDirs, resolveDirs, resolveBuildPaths } = require('./stack_paths');
const { createLogger } = require('./logger');
const { loadStack } = require('./stack_loader');
const { mapLikeToObject } = require('./core/object_utils');
const { validateStack } = require('./validation');
const { createIssueCollector } = require('./issue_collector');
const { createHandlebarsEngine } = require('./templates/handlebars_engine');
const { createServices } = require('./core/services');
const { fmt, step, loadEnv, buildClassHierarchy, cleanBuildDir, isReservedId } = require('./core/build_helpers');

const repoRoot = path.join(__dirname, '..');
const CANONICAL_VERSION = '0.0.0-alpha';
const CANONICAL_STABILITY = 'experimental';

// Main build routine (used by CLI).
// Execution order is intentionally linear and stable to support future hook points:
// 1) load templates, 2) load + validate stack, 3) prepare build dir and metadata,
// 4) render outputs, 5) finalize/log. Keep this sequencing unchanged unless
// explicitly coordinating a hook/breaking change.
function runBuild(options) {
  const {
    stackDirs: stackDirInputs,
    classDirs: classDirInputs,
    instanceDirs: instanceDirInputs,
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
  let stackDirs;
  try {
    stackDirs = resolveStackDirs(stackDirInputs);
  } catch (e) {
    log.error(e.message);
    log.summarizeAndExitIfNeeded();
    return;
  }
  const classDirs = resolveDirs(classDirInputs, stackDirs);
  const instanceDirs = resolveDirs(instanceDirInputs, stackDirs);

  if (!stackDirs.length) {
    log.error('At least one --stack is required.');
    return;
  }

  const { buildRoot, buildDir } = resolveBuildPaths({
    buildRootInput,
    buildDirInput,
    buildNameInput,
    stackDirs,
    includeHash
  });

  try {
    const templateEngine = createHandlebarsEngine({ stackDirs, log, quiet });
    log.info(`${step('Step 1/5')} ${fmt('Templates', 'cyan')}`);
    stackDirs.forEach((dir, idx) => log.info(`  ${fmt(`${idx + 1}.`, 'dim')} stack:    ${fmt(path.join(dir, 'templates'), 'dim')}`));
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
        stackDirs,
        classDirs,
        instanceDirs,
        stackOrder: stackDirs,
        classOrder: classDirs,
        instanceOrder: instanceDirs,
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
    fs.writeFileSync(path.join(buildDir, 'canonical.json'), JSON.stringify(canonicalSnapshot, null, 2));
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
    log.info(`  • validation report: ${fmt(validationPath, 'dim')}`);
    log.info(`  • class definitions: ${fmt(classDefCount, classDefCount ? 'green' : 'dim')} written to ${fmt(classDefsDir, 'dim')}`);
    if (classSchemaCount > 0) {
      log.info(`  • class schemas: ${fmt(classSchemaCount, 'green')} written to ${fmt(classSchemasDir, 'dim')}`);
    } else {
      log.info('  • class schemas: none (no schemas defined)');
    }
    if (validationResult.hasErrors) {
      log.error('Validation failed; skipping render.');
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

module.exports = {
  runBuild
};
