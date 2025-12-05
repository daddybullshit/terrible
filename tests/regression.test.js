const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { runBuild } = require('../js/build');
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

function runBuildWithStacks(stackDirs, opts = {}) {
  const buildRoot = opts.buildRoot || tempDir('terrible-test-');
  const buildName = opts.buildName || 'test-build';
  runBuild({
    stackDirs,
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

  assert.strictEqual(canonical.buildMeta.stackOrder[0], stackA, 'stack order preserved from CLI input');
  assert.strictEqual(canonical.buildMeta.stackOrder[1], stackB, 'stack order preserved from CLI input');
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

function run() {
  console.log('Running regression: instances include global + ordering...');
  testInstancesIncludeGlobalAndOrdering();
  console.log('Running regression: empty instances root fails...');
  testEmptyInstancesRootFails();
  console.log('Running regression: stack paths resolve from cwd first, with repo fallback...');
  testStackPathsResolveWithCwdPriorityAndRepoFallback();
  console.log('All regression tests passed.');
}

run();
