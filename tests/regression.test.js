const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { runBuild, runClassesBuild, runInstancesBuild, runValidate } = require('../js/build');
const { loadStack } = require('../js/stack_loader');
const { createLogger } = require('../js/logger');
const { createIssueCollector } = require('../js/issue_collector');
const { resolveStackDir } = require('../js/stack_paths');

function tempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function readCanonical(buildRoot, name) {
  const canonicalPath = path.join(buildRoot, name, 'canonical.json');
  const data = fs.readFileSync(canonicalPath, 'utf8');
  return JSON.parse(data);
}

// Deep subset check: verify actual contains all keys/values from expected
function assertSubset(actual, expected, path = '') {
  if (expected === null || typeof expected !== 'object') {
    assert.deepStrictEqual(actual, expected, `Mismatch at ${path || 'root'}`);
    return;
  }
  if (Array.isArray(expected)) {
    assert.ok(Array.isArray(actual), `Expected array at ${path}`);
    assert.strictEqual(actual.length, expected.length, `Array length mismatch at ${path}`);
    expected.forEach((item, i) => assertSubset(actual[i], item, `${path}[${i}]`));
    return;
  }
  assert.ok(actual && typeof actual === 'object', `Expected object at ${path}`);
  Object.keys(expected).forEach(key => {
    assertSubset(actual[key], expected[key], path ? `${path}.${key}` : key);
  });
}

function runBuildWithStacks(stackDirs, opts = {}) {
  const buildRoot = opts.buildRoot || tempDir('terrible-test-');
  const buildName = opts.buildName || 'test-build';
  runBuild({
    classDirs: stackDirs,
    instanceDirs: stackDirs,
    buildRoot,
    buildName,
    includeHash: false,
    quiet: true,
    warningsAsErrors: true
  });
  return readCanonical(buildRoot, buildName);
}

function testInstancesIncludeGlobalAndOrdering() {
  const fixtureRoot = path.join(__dirname, 'fixtures', 'ordered');
  const stackA = path.join(fixtureRoot, 'a');
  const stackB = path.join(fixtureRoot, 'b');
  const canonical = runBuildWithStacks([stackA, stackB], { buildName: 'ordered' });

  assert.strictEqual(canonical.instances[0].id, 'global', 'global should be first in instances array');
  const ids = canonical.instances.map(obj => obj.id);
  assert.ok(ids.includes('alpha'), 'alpha instance should be present');

  assert.strictEqual(canonical.instancesById.alpha.val, 'b', 'later stack should override instance fields');
  assert.strictEqual(canonical.instancesById.alpha.tags.length, 2, 'merged instance should include tags from later stack');

  assert.strictEqual(canonical.instancesById.global.stack, 'b', 'global merge should include later stack values');
  assert.strictEqual(canonical.instancesById.global.note, 'second');

  assert.strictEqual(canonical.buildMeta.classOrder[0], stackA, 'class order preserved from CLI input');
  assert.strictEqual(canonical.buildMeta.classOrder[1], stackB, 'class order preserved from CLI input');
  assert.strictEqual(canonical.buildMeta.instanceOrder[0], stackA, 'instance order preserved from CLI input');
  assert.strictEqual(canonical.buildMeta.instanceOrder[1], stackB, 'instance order preserved from CLI input');
}

function testEmptyInstancesRootFails() {
  const emptyStack = path.join(__dirname, 'fixtures', 'empty-instances');
  const logger = createLogger({ quiet: true });
  const issues = createIssueCollector({ log: logger });
  assert.throws(
    () => loadStack({
      stackDirs: [emptyStack],
      classDirs: [path.join(emptyStack, 'classes')],
      instanceDirs: [path.join(emptyStack, 'instances')],
      log: logger,
      issues
    }),
    /No instance or global files found/,
    'should throw on empty instance roots'
  );
}

function testStackPathsResolveWithCwdPriorityAndRepoFallback() {
  const originalCwd = process.cwd();
  const temp = tempDir('terrible-cwd-');
  process.chdir(temp);
  try {
    const parentStacks = path.resolve(temp, '../stacks');
    fs.rmSync(parentStacks, { recursive: true, force: true });

    // Should fall back to repo root (or its parent) when cwd-relative path does not exist.
    const fallback = resolveStackDir('../stacks/recipes');
    const expectedFallbacks = [
      path.join(__dirname, '..', 'stacks', 'recipes'),
      path.join(__dirname, '..', '..', 'stacks', 'recipes')
    ].filter(p => fs.existsSync(p));
    assert.ok(expectedFallbacks.length > 0, 'expected recipes stack to exist in repo or parent');
    assert.ok(expectedFallbacks.some(p => fallback === fs.realpathSync(p)), 'should fall back to repo or parent root for missing cwd path');

    // Should prefer cwd when it exists.
    const localStacks = path.resolve(temp, '../stacks/recipes');
    fs.mkdirSync(localStacks, { recursive: true });
    const localResolved = resolveStackDir('../stacks/recipes');
    assert.strictEqual(localResolved, fs.realpathSync(localStacks), 'should prefer cwd when path exists there');

    const absoluteStack = path.join(__dirname, '..', 'stacks', 'recipes');
    const normalized = resolveStackDir(absoluteStack);
    assert.strictEqual(normalized, fs.realpathSync(absoluteStack), 'absolute stack paths should resolve');
  } finally {
    fs.rmSync(path.resolve(temp, '../stacks'), { recursive: true, force: true });
    process.chdir(originalCwd);
  }
}

function testClassesOnlyBuild() {
  const fixtureRoot = path.join(__dirname, 'fixtures', 'ordered');
  const stackA = path.join(fixtureRoot, 'a');
  const buildRoot = tempDir('terrible-classes-test-');
  const buildName = 'classes-only';

  runClassesBuild({
    classDirs: [stackA],
    buildRoot,
    buildName,
    includeHash: false,
    quiet: true
  });

  const canonical = readCanonical(buildRoot, buildName);

  // Should have classes but no instances
  assert.ok(canonical.classes, 'canonical should have classes property');
  assert.strictEqual(canonical.instances, undefined, 'classes-only build should not have instances');
  assert.strictEqual(canonical.buildMeta.mode, 'classes-only', 'build mode should be classes-only');

  // Should write class definitions and schemas
  const classDefsDir = path.join(buildRoot, buildName, 'meta', 'class-definitions');
  const classSchemasDir = path.join(buildRoot, buildName, 'meta', 'class-schemas');
  assert.ok(fs.existsSync(classDefsDir), 'class definitions directory should exist');
  assert.ok(fs.existsSync(classSchemasDir), 'class schemas directory should exist');
}

function testValidateOnlyCommand() {
  const recipesStack = path.join(__dirname, '..', 'stacks', 'recipes');

  // Capture console output to verify validation runs
  let errorCount = 0;
  const originalError = console.error;
  console.error = (msg) => {
    if (msg && msg.includes && msg.includes('error')) {
      errorCount++;
    }
  };

  try {
    runValidate({
      classDirs: [recipesStack],
      instanceDirs: [recipesStack],
      warningsAsErrors: false,
      warnExtraFields: false,
      quiet: true
    });
  } finally {
    console.error = originalError;
  }

  // recipes stack should validate without errors
  assert.strictEqual(errorCount, 0, 'recipes stack should validate without errors');
}

function testMixedSourceValidation() {
  const fixtureRoot = path.join(__dirname, 'fixtures', 'ordered');
  const stackA = path.join(fixtureRoot, 'a');
  const stackB = path.join(fixtureRoot, 'b');

  // Should be able to validate with classes from A and instances from B
  runValidate({
    classDirs: [stackA],
    instanceDirs: [stackB],
    warningsAsErrors: false,
    warnExtraFields: false,
    quiet: true
  });
  // If we get here without throwing, mixed-source validation works
}

function testGoldenFullBuild() {
  const fixtureRoot = path.join(__dirname, 'fixtures', 'ordered');
  const stackA = path.join(fixtureRoot, 'a');
  const stackB = path.join(fixtureRoot, 'b');
  const buildRoot = tempDir('terrible-golden-');
  const buildName = 'full';

  runBuild({
    classDirs: [stackA, stackB],
    instanceDirs: [stackA, stackB],
    buildRoot,
    buildName,
    includeHash: false,
    quiet: true
  });

  const canonical = readCanonical(buildRoot, buildName);
  const golden = JSON.parse(fs.readFileSync(path.join(fixtureRoot, 'golden-full.json'), 'utf8'));

  assertSubset(canonical, golden);
}

function testGoldenClassesBuild() {
  const fixtureRoot = path.join(__dirname, 'fixtures', 'ordered');
  const stackA = path.join(fixtureRoot, 'a');
  const buildRoot = tempDir('terrible-golden-');
  const buildName = 'classes';

  runClassesBuild({
    classDirs: [stackA],
    buildRoot,
    buildName,
    includeHash: false,
    quiet: true
  });

  const canonical = readCanonical(buildRoot, buildName);
  const golden = JSON.parse(fs.readFileSync(path.join(fixtureRoot, 'golden-classes.json'), 'utf8'));

  assertSubset(canonical, golden);
}

function testGoldenInstancesBuild() {
  const fixtureRoot = path.join(__dirname, 'fixtures', 'ordered');
  const stackA = path.join(fixtureRoot, 'a');
  const buildRoot = tempDir('terrible-golden-');
  const buildName = 'instances';

  runInstancesBuild({
    instanceDirs: [stackA],
    buildRoot,
    buildName,
    includeHash: false,
    quiet: true
  });

  const canonical = readCanonical(buildRoot, buildName);
  const golden = JSON.parse(fs.readFileSync(path.join(fixtureRoot, 'golden-instances.json'), 'utf8'));

  assertSubset(canonical, golden);
}

function testInstancesOnlyBuild() {
  const fixtureRoot = path.join(__dirname, 'fixtures', 'ordered');
  const stackA = path.join(fixtureRoot, 'a');
  const buildRoot = tempDir('terrible-instances-test-');
  const buildName = 'instances-only';

  runInstancesBuild({
    instanceDirs: [stackA],
    buildRoot,
    buildName,
    includeHash: false,
    quiet: true
  });

  const canonical = readCanonical(buildRoot, buildName);

  // Should have instances but NOT classes (instances-only = no class resolution)
  assert.strictEqual(canonical.classes, undefined, 'instances-only build should NOT have classes');
  assert.ok(canonical.instances, 'instances-only build should have instances');
  assert.ok(canonical.instancesById, 'instances-only build should have instancesById');
  assert.strictEqual(canonical.buildMeta.mode, 'instances-only', 'build mode should be instances-only');

  // Should NOT write validation report (no validation in instances-only)
  const validationPath = path.join(buildRoot, buildName, 'meta', 'validation.json');
  assert.ok(!fs.existsSync(validationPath), 'instances-only should NOT have validation report');
}

function run() {
  console.log('Running regression: instances include global + ordering...');
  testInstancesIncludeGlobalAndOrdering();
  console.log('Running regression: empty instances root fails...');
  testEmptyInstancesRootFails();
  console.log('Running regression: stack paths resolve from cwd first, with repo fallback...');
  testStackPathsResolveWithCwdPriorityAndRepoFallback();
  console.log('Running regression: classes-only build...');
  testClassesOnlyBuild();
  console.log('Running regression: instances-only build...');
  testInstancesOnlyBuild();
  console.log('Running regression: validate-only command...');
  testValidateOnlyCommand();
  console.log('Running regression: mixed-source validation...');
  testMixedSourceValidation();
  console.log('Running regression: golden full build output...');
  testGoldenFullBuild();
  console.log('Running regression: golden classes build output...');
  testGoldenClassesBuild();
  console.log('Running regression: golden instances build output...');
  testGoldenInstancesBuild();
  console.log('All regression tests passed.');
}

run();
