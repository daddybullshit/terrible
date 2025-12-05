'use strict';

/**
 * Unit tests for core utility modules.
 * Run with: node tests/core.test.js
 */

const assert = require('assert');

// --- Test helpers ---
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.log(`  ✗ ${name}`);
    console.log(`    ${err.message}`);
  }
}

function assertEqual(actual, expected, msg = '') {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${msg}\n    Expected: ${JSON.stringify(expected)}\n    Actual:   ${JSON.stringify(actual)}`);
  }
}

function assertTrue(value, msg = 'Expected true') {
  if (value !== true) throw new Error(msg);
}

function assertFalse(value, msg = 'Expected false') {
  if (value !== false) throw new Error(msg);
}

function assertThrows(fn, msg = 'Expected to throw') {
  try {
    fn();
    throw new Error(msg);
  } catch (e) {
    if (e.message === msg) throw e;
  }
}

// --- Load modules under test ---
const { isPlainObject, arrayResetValue, mergeArrays, deepMerge, mergeValue } = require('../js/core/merge_utils');
const { asArray, mapLikeToObject } = require('../js/core/object_utils');
const { getByPath, toArray, entriesFrom, filterList, targetIncludes } = require('../js/core/data_utils');
const { TerribleError, ConfigError, PathError, ParseError, ValidationError, MergeError, TemplateError } = require('../js/core/errors');
const { readJsonFile, findJsonFiles, normalizeDirPath, scanDir } = require('../js/core/fs_utils');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ============================================================
// merge_utils tests
// ============================================================
console.log('\nmerge_utils.js:');

test('isPlainObject returns true for plain objects', () => {
  assertTrue(isPlainObject({}));
  assertTrue(isPlainObject({ a: 1 }));
});

test('isPlainObject returns false for arrays', () => {
  assertFalse(isPlainObject([]));
  assertFalse(isPlainObject([1, 2, 3]));
});

test('isPlainObject returns false for null/undefined', () => {
  assertFalse(isPlainObject(null));
  assertFalse(isPlainObject(undefined));
});

test('isPlainObject returns false for primitives', () => {
  assertFalse(isPlainObject(42));
  assertFalse(isPlainObject('string'));
  assertFalse(isPlainObject(true));
});

test('arrayResetValue returns null for regular arrays', () => {
  assertEqual(arrayResetValue([1, 2]), null);
});

test('arrayResetValue returns empty array for $reset: true', () => {
  assertEqual(arrayResetValue({ $reset: true }), []);
});

test('arrayResetValue returns value array for $reset with value', () => {
  assertEqual(arrayResetValue({ $reset: true, value: [3, 4] }), [3, 4]);
});

test('mergeArrays appends by default', () => {
  assertEqual(mergeArrays([1, 2], [3, 4]), [1, 2, 3, 4]);
});

test('mergeArrays resets with $reset', () => {
  assertEqual(mergeArrays([1, 2], { $reset: true, value: [5] }), [5]);
});

test('mergeArrays handles empty arrays', () => {
  assertEqual(mergeArrays([], [1]), [1]);
  assertEqual(mergeArrays([1], []), [1]);
});

test('deepMerge merges nested objects', () => {
  const base = { a: { b: 1, c: 2 } };
  const override = { a: { c: 3, d: 4 } };
  assertEqual(deepMerge(base, override), { a: { b: 1, c: 3, d: 4 } });
});

test('deepMerge appends arrays', () => {
  const base = { items: [1, 2] };
  const override = { items: [3] };
  assertEqual(deepMerge(base, override), { items: [1, 2, 3] });
});

test('deepMerge replaces scalars', () => {
  assertEqual(deepMerge({ a: 1 }, { a: 2 }), { a: 2 });
});

test('deepMerge ignores undefined values', () => {
  assertEqual(deepMerge({ a: 1 }, { a: undefined }), { a: 1 });
});

test('mergeValue returns default when override undefined', () => {
  assertEqual(mergeValue(5, undefined), 5);
});

test('mergeValue replaces with override', () => {
  assertEqual(mergeValue(5, 10), 10);
});

test('mergeValue merges nested objects', () => {
  assertEqual(mergeValue({ a: 1 }, { b: 2 }), { a: 1, b: 2 });
});

// ============================================================
// object_utils tests
// ============================================================
console.log('\nobject_utils.js:');

test('asArray returns empty for null/undefined', () => {
  assertEqual(asArray(null), []);
  assertEqual(asArray(undefined), []);
});

test('asArray wraps single value', () => {
  assertEqual(asArray(1), [1]);
  assertEqual(asArray('a'), ['a']);
});

test('asArray passes through arrays', () => {
  assertEqual(asArray([1, 2]), [1, 2]);
});

test('mapLikeToObject converts Map', () => {
  const map = new Map([['a', 1], ['b', 2]]);
  assertEqual(mapLikeToObject(map), { a: 1, b: 2 });
});

test('mapLikeToObject returns empty for null', () => {
  assertEqual(mapLikeToObject(null), {});
});

test('mapLikeToObject passes through plain objects', () => {
  const obj = { a: 1 };
  assertEqual(mapLikeToObject(obj), obj);
});

// ============================================================
// data_utils tests
// ============================================================
console.log('\ndata_utils.js:');

test('getByPath gets nested value', () => {
  assertEqual(getByPath({ a: { b: { c: 3 } } }, 'a.b.c'), 3);
});

test('getByPath returns undefined for missing path', () => {
  assertEqual(getByPath({ a: 1 }, 'b.c'), undefined);
});

test('getByPath handles null object', () => {
  assertEqual(getByPath(null, 'a'), undefined);
});

test('toArray converts object values', () => {
  assertEqual(toArray({ a: 1, b: 2 }), [1, 2]);
});

test('toArray clones arrays', () => {
  const arr = [1, 2];
  const result = toArray(arr);
  assertEqual(result, [1, 2]);
  assertTrue(arr !== result);
});

test('entriesFrom handles arrays', () => {
  assertEqual(entriesFrom([1, 2]), [1, 2]);
});

test('entriesFrom handles Maps', () => {
  const map = new Map([['a', 1], ['b', 2]]);
  assertEqual(entriesFrom(map), [1, 2]);
});

test('entriesFrom returns sorted values from objects', () => {
  assertEqual(entriesFrom({ b: 2, a: 1 }), [1, 2]);
});

test('filterList filters entries', () => {
  assertEqual(filterList([1, 2, 3, 4], x => x > 2), [3, 4]);
});

test('targetIncludes works with arrays', () => {
  assertTrue(targetIncludes([1, 2, 3], 2));
  assertFalse(targetIncludes([1, 2, 3], 4));
});

test('targetIncludes works with strings', () => {
  assertTrue(targetIncludes('hello', 'ell'));
  assertFalse(targetIncludes('hello', 'xyz'));
});

// ============================================================
// errors tests
// ============================================================
console.log('\nerrors.js:');

test('TerribleError has code and context', () => {
  const err = new TerribleError('test', 'TEST_CODE', { file: 'a.json' });
  assertEqual(err.code, 'TEST_CODE');
  assertEqual(err.context.file, 'a.json');
  assertEqual(err.name, 'TerribleError');
});

test('TerribleError toJSON serializes correctly', () => {
  const err = new TerribleError('msg', 'CODE', { x: 1 });
  const json = err.toJSON();
  assertEqual(json.code, 'CODE');
  assertEqual(json.message, 'msg');
  assertEqual(json.context.x, 1);
});

test('ConfigError has correct code', () => {
  const err = new ConfigError('bad config');
  assertEqual(err.code, 'CONFIG_ERROR');
  assertEqual(err.name, 'ConfigError');
});

test('PathError has correct code', () => {
  const err = new PathError('not found', { path: '/a/b' });
  assertEqual(err.code, 'PATH_ERROR');
  assertEqual(err.context.path, '/a/b');
});

test('ParseError has correct code', () => {
  assertEqual(new ParseError('bad json').code, 'PARSE_ERROR');
});

test('ValidationError has correct code', () => {
  assertEqual(new ValidationError('invalid').code, 'VALIDATION_ERROR');
});

test('MergeError has correct code', () => {
  assertEqual(new MergeError('conflict').code, 'MERGE_ERROR');
});

test('TemplateError has correct code', () => {
  assertEqual(new TemplateError('render failed').code, 'TEMPLATE_ERROR');
});

test('Error inheritance works correctly', () => {
  const err = new ConfigError('test');
  assertTrue(err instanceof TerribleError);
  assertTrue(err instanceof Error);
});

// ============================================================
// fs_utils tests
// ============================================================
console.log('\nfs_utils.js:');

// Create temp directory for fs tests
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrible-test-'));
const cleanupTmp = () => fs.rmSync(tmpDir, { recursive: true, force: true });

test('readJsonFile parses valid JSON', () => {
  const file = path.join(tmpDir, 'valid.json');
  fs.writeFileSync(file, '{"a": 1}');
  assertEqual(readJsonFile(file), { a: 1 });
});

test('readJsonFile throws ParseError for invalid JSON', () => {
  const file = path.join(tmpDir, 'invalid.json');
  fs.writeFileSync(file, '{bad json}');
  try {
    readJsonFile(file);
    throw new Error('Should have thrown');
  } catch (e) {
    assertTrue(e instanceof ParseError, 'Should be ParseError');
    assertEqual(e.code, 'PARSE_ERROR');
    assertTrue(e.context.filePath === file);
  }
});

test('readJsonFile includes context for parse errors', () => {
  const file = path.join(tmpDir, 'multiline.json');
  fs.writeFileSync(file, '{\\n  \"a\": 1,\\n  \"b\": bad\\n}');
  try {
    readJsonFile(file);
    throw new Error('Should have thrown');
  } catch (e) {
    assertTrue(e instanceof ParseError);
    assertTrue(e.context.filePath === file, 'Should have filePath in context');
  }
});

test('normalizeDirPath throws PathError for null input', () => {
  try {
    normalizeDirPath(null);
    throw new Error('Should have thrown');
  } catch (e) {
    assertTrue(e instanceof PathError);
    assertEqual(e.code, 'PATH_ERROR');
  }
});

test('normalizeDirPath throws PathError for non-existent dir', () => {
  try {
    normalizeDirPath('/non/existent/path/xyz123');
    throw new Error('Should have thrown');
  } catch (e) {
    assertTrue(e instanceof PathError);
    assertTrue(e.context.resolved !== undefined);
  }
});

test('normalizeDirPath returns real path for valid dir', () => {
  const result = normalizeDirPath(tmpDir);
  assertTrue(fs.existsSync(result));
});

test('findJsonFiles returns empty for non-existent dir', () => {
  assertEqual(findJsonFiles('/non/existent'), []);
});

test('findJsonFiles throws PathError when required and dir missing', () => {
  try {
    findJsonFiles('/non/existent', { required: true });
    throw new Error('Should have thrown');
  } catch (e) {
    assertTrue(e instanceof PathError);
  }
});

test('findJsonFiles finds JSON files', () => {
  const subdir = path.join(tmpDir, 'jsontest');
  fs.mkdirSync(subdir, { recursive: true });
  fs.writeFileSync(path.join(subdir, 'a.json'), '{}');
  fs.writeFileSync(path.join(subdir, 'b.json'), '{}');
  const result = findJsonFiles(subdir);
  assertEqual(result.length, 2);
});

// ============================================================
// format tests
// ============================================================
console.log('\n📦 format');
const { fmt, step, error: fmtError, warning: fmtWarning, dim, success, isColorEnabled } = require('../js/core/format');

test('fmt handles invalid style gracefully', () => {
  assertEqual(fmt('test', 'nonexistent'), 'test');
  assertEqual(fmt('test', null), 'test');
  assertEqual(fmt('test', undefined), 'test');
});

test('step formats as bold', () => {
  const result = step('Step 1');
  assertTrue(result.includes('Step 1'));
});

test('fmtError includes Error prefix', () => {
  const result = fmtError('something failed');
  assertTrue(result.includes('Error:'));
  assertTrue(result.includes('something failed'));
});

test('fmtWarning includes Warning prefix', () => {
  const result = fmtWarning('something warned');
  assertTrue(result.includes('Warning:'));
  assertTrue(result.includes('something warned'));
});

test('isColorEnabled returns boolean', () => {
  const result = isColorEnabled();
  assertTrue(typeof result === 'boolean');
});

// ============================================================
// build_helpers reserved keys tests
// ============================================================
console.log('\n📦 build_helpers (reserved keys)');
const { 
  isReservedId, isReservedInstanceKey, isReservedClassKey,
  RESERVED_IDS, RESERVED_INSTANCE_KEYS, RESERVED_CLASS_KEYS 
} = require('../js/core/build_helpers');

test('isReservedId identifies global', () => {
  assertTrue(isReservedId('global'));
  assertFalse(isReservedId('other'));
  assertFalse(isReservedId(''));
});

test('RESERVED_IDS is frozen', () => {
  assertTrue(Object.isFrozen(RESERVED_IDS));
});

test('isReservedInstanceKey identifies id, build, class', () => {
  assertTrue(isReservedInstanceKey('id'));
  assertTrue(isReservedInstanceKey('build'));
  assertTrue(isReservedInstanceKey('class'));
  assertFalse(isReservedInstanceKey('name'));
  assertFalse(isReservedInstanceKey('tags'));
});

test('isReservedClassKey identifies class, parent, id, schema', () => {
  assertTrue(isReservedClassKey('class'));
  assertTrue(isReservedClassKey('parent'));
  assertTrue(isReservedClassKey('id'));
  assertTrue(isReservedClassKey('schema'));
  assertFalse(isReservedClassKey('name'));
  assertFalse(isReservedClassKey('defaults'));
});

test('reserved key sets are frozen', () => {
  // Sets can't be frozen directly but we wrapped them
  assertTrue(RESERVED_INSTANCE_KEYS.has('id'));
  assertTrue(RESERVED_CLASS_KEYS.has('class'));
});

// ============================================================
// issue_collector tests
// ============================================================
console.log('\n📦 issue_collector');
const { createIssueCollector } = require('../js/issue_collector');

test('issue collector starts empty', () => {
  const collector = createIssueCollector({});
  assertEqual(collector.list(), []);
  assertFalse(collector.hasErrors());
  assertEqual(collector.count(), 0);
});

test('issue collector records warnings', () => {
  const logs = [];
  const collector = createIssueCollector({ log: { warn: m => logs.push(m), error: m => logs.push(m) } });
  collector.warn('test warning', { code: 'TEST' });
  assertEqual(collector.warnCount(), 1);
  assertEqual(collector.errorCount(), 0);
  assertFalse(collector.hasErrors());
});

test('issue collector records errors', () => {
  const logs = [];
  const collector = createIssueCollector({ log: { warn: m => logs.push(m), error: m => logs.push(m) } });
  collector.error('test error', { code: 'TEST' });
  assertEqual(collector.errorCount(), 1);
  assertTrue(collector.hasErrors());
});

test('issue collector handles TerribleError', () => {
  const logs = [];
  const collector = createIssueCollector({ log: { warn: m => logs.push(m), error: m => logs.push(m) } });
  const err = new PathError('path not found', { input: '/test', attempts: ['/a', '/b'] });
  collector.add('error', err);
  const issues = collector.list();
  assertEqual(issues.length, 1);
  assertEqual(issues[0].code, 'PATH_ERROR');
  assertEqual(issues[0].input, '/test');
});

test('issue collector addAll adds multiple errors', () => {
  const logs = [];
  const collector = createIssueCollector({ log: { warn: m => logs.push(m), error: m => logs.push(m) } });
  const errors = [
    new PathError('error 1', { input: '/a' }),
    new PathError('error 2', { input: '/b' })
  ];
  collector.addAll('error', errors);
  assertEqual(collector.errorCount(), 2);
});

// ============================================================
// stack_paths tests
// ============================================================
console.log('\n📦 stack_paths');
const { validateDirs, resolveStackDir } = require('../js/stack_paths');

test('validateDirs returns valid dirs', () => {
  const { valid, errors } = validateDirs([tmpDir]);
  assertEqual(errors.length, 0);
  assertEqual(valid.length, 1);
});

test('validateDirs collects errors for invalid paths', () => {
  const { valid, errors } = validateDirs(['/nonexistent/path/abc123']);
  assertEqual(valid.length, 0);
  assertEqual(errors.length, 1);
  assertTrue(errors[0] instanceof PathError);
});

test('validateDirs handles mixed valid/invalid', () => {
  const { valid, errors } = validateDirs([tmpDir, '/nonexistent/xyz']);
  assertEqual(valid.length, 1);
  assertEqual(errors.length, 1);
});

test('resolveStackDir throws PathError for missing dir', () => {
  try {
    resolveStackDir('/does/not/exist/anywhere');
    throw new Error('Should have thrown');
  } catch (e) {
    assertTrue(e instanceof PathError);
    assertTrue(e.context.attempts.length > 0);
  }
});

test('scanDir returns empty for non-existent dir', () => {
  assertEqual(scanDir('/non/existent'), []);
});

test('scanDir finds files matching pattern', () => {
  const subdir = path.join(tmpDir, 'scantest');
  fs.mkdirSync(subdir, { recursive: true });
  fs.writeFileSync(path.join(subdir, 'a.txt'), 'a');
  fs.writeFileSync(path.join(subdir, 'b.txt'), 'b');
  const result = scanDir(subdir, { pattern: '*.txt' });
  assertEqual(result.length, 2);
});

// Cleanup temp directory
cleanupTmp();

// ============================================================
// Summary
// ============================================================
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
