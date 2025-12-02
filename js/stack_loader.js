const path = require('path');
const fs = require('fs');
const { readJsonFile } = require('./json_utils');
const { attachNormalizedTags } = require('./tag_utils');
const { applyClassDefaults, loadResolvedClasses } = require('./class_loader');
const { buildReservedObjects } = require('./reserved_builder');
const { deepMerge } = require('./merge_utils');

function normalizeBuild(obj, filePath, log) {
  if (obj.build === undefined) {
    obj.build = [];
    return;
  }
  if (!Array.isArray(obj.build)) {
    log.warn(`'build' is not an array in ${filePath}; defaulting to empty array`);
    obj.build = [];
  }
}

function readStackObject(filePath, log) {
  const obj = readJsonFile(filePath);
  if (!obj.id) {
    obj.id = '_globals';
  }
  normalizeBuild(obj, filePath, log);
  attachNormalizedTags(obj, obj.tags, { filePath, log });
  return obj;
}

function collectJsonFiles(dirPath) {
  const files = [];

  function walk(currentDir) {
    let entries;
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch (e) {
      throw new Error(`Unable to read stack directory ${currentDir}: ${e.message}`);
    }

    entries
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach(entry => {
        const entryPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          walk(entryPath);
        } else if (entry.isFile() && entry.name.endsWith('.json')) {
          files.push({
            abs: entryPath,
            rel: path.relative(dirPath, entryPath)
          });
        }
      });
  }

  walk(dirPath);
  files.sort((a, b) => {
    const depthA = a.rel.split(path.sep).length;
    const depthB = b.rel.split(path.sep).length;
    if (depthA !== depthB) {
      return depthA - depthB;
    }
    return a.rel.localeCompare(b.rel);
  });
  return files.map(f => f.abs);
}

function loadStackFiles(dirPath, { required, log }) {
  if (!fs.existsSync(dirPath)) {
    if (required) {
      throw new Error(`Stack directory does not exist: ${dirPath}`);
    }
    return [];
  }

  const stackFiles = collectJsonFiles(dirPath);
  if (required && stackFiles.length === 0) {
    throw new Error(`No stack definition JSON files found in ${dirPath}`);
  }

  return stackFiles.map(file => readStackObject(file, log));
}

function extractGlobals(objs) {
  const idx = objs.findIndex(obj => obj.id === '_globals');
  if (idx === -1) {
    return null;
  }
  return objs.splice(idx, 1)[0];
}

function loadMergedGlobals(defaultsDir, defaultsObjs, stackObjs, log) {
  const globalsPaths = [
    path.join(defaultsDir, 'globals.json')
  ];

  let merged = { id: '_globals', build: [] };
  globalsPaths.forEach(filePath => {
    if (!fs.existsSync(filePath)) {
      return;
    }
    try {
      const data = readJsonFile(filePath);
      merged = deepMerge(merged, data);
    } catch (err) {
      log.error(`Failed to parse ${filePath}: ${err.message}`);
    }
  });

  const defaultsGlobals = extractGlobals(defaultsObjs);
  const stackGlobals = extractGlobals(stackObjs);
  [defaultsGlobals, stackGlobals].forEach(obj => {
    if (obj) {
      merged = deepMerge(merged, obj);
    }
  });

  return merged;
}

function loadStack(stackDir, defaultsDir, log) {
  if (!fs.existsSync(stackDir)) {
    throw new Error(`Stack directory does not exist: ${stackDir}`);
  }

  const defaultsInstancesDir = path.join(defaultsDir, 'instances');
  const stackInstancesDir = path.join(stackDir, 'instances');
  const merged = new Map();
  const { resolvedClasses } = loadResolvedClasses(stackDir, defaultsDir, log);

  const defaultStacks = loadStackFiles(defaultsInstancesDir, { required: false, log });
  const stackInstanceStacks = loadStackFiles(stackInstancesDir, { required: true, log });

  const globals = loadMergedGlobals(defaultsDir, defaultStacks, stackInstanceStacks, log);
  const upsert = obj => {
    if (merged.has(obj.id)) {
      const mergedObj = deepMerge(merged.get(obj.id), obj);
      mergedObj.id = obj.id;
      merged.set(obj.id, mergedObj);
    } else {
      merged.set(obj.id, obj);
    }
  };

  merged.set('_globals', globals);
  defaultStacks.forEach(upsert);
  stackInstanceStacks.forEach(upsert);

  const stackObjects = Array.from(merged.values());
  stackObjects.forEach(obj => applyClassDefaults(obj, resolvedClasses, log));

  const withReserved = buildReservedObjects(stackObjects, resolvedClasses, merged, log);
  return {
    stackObjects: Array.from(withReserved.values()),
    stackById: withReserved,
    resolvedClasses,
    globals
  };
}

module.exports = { loadStack };
