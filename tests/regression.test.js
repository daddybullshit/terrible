const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { runBuild } = require('../js/build');
const { loadStack } = require('../js/stack_loader');
const { createLogger } = require('../js/logger');
const { createIssueCollector } = require('../js/issue_collector');

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
    quiet: false,
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

function run() {
  console.log('Running regression: instances include global + ordering...');
  testInstancesIncludeGlobalAndOrdering();
  console.log('Running regression: empty instances root fails...');
  testEmptyInstancesRootFails();
  console.log('All regression tests passed.');
}

run();
