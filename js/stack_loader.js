const path = require('path');
const fs = require('fs');
const { applyClassDefaults, loadResolvedClasses } = require('./class_loader');
const { deepMerge } = require('./merge_utils');
const { findJsonFiles, readJsonFile } = require('./fs_utils');

const RESERVED_KEYS = new Set(['id', 'build', 'class']);

// Identify whether an object id is reserved.
function isReservedId(id) {
  return id === 'global';
}

function isReservedKey(key) {
  return RESERVED_KEYS.has(key);
}

// Build a map of stack objects (excluding global) exposing resolved properties.
function buildObjectMap(stackObjects, resolvedClasses) {
  const sortedEntries = stackObjects
    .filter(obj => obj && obj.id && !isReservedId(obj.id))
    .map(obj => {
      const className = obj.class || null;
      const classDef = className ? resolvedClasses.get(className) : null;
      const keys = new Set();
      if (classDef) {
        Object.keys(classDef).forEach(k => {
          if (!isReservedKey(k)) {
            keys.add(k);
          }
        });
      }
      Object.keys(obj).forEach(k => {
        if (!isReservedKey(k)) {
          keys.add(k);
        }
      });
      const properties = {};
      Array.from(keys).sort().forEach(k => {
        const objVal = obj[k];
        const classVal = classDef ? classDef[k] : undefined;
        properties[k] = objVal !== undefined ? objVal : classVal;
      });
      return { id: obj.id, class: className, properties };
    })
    .sort((a, b) => a.id.localeCompare(b.id));

  return sortedEntries.reduce((acc, entry) => {
    acc[entry.id] = entry;
    return acc;
  }, {});
}

// Collect class metadata for canonical export (map + array view).
function collectClasses(resolvedClasses) {
  const classMap = {};
  const entries = Array.from(resolvedClasses.entries())
    .map(([name, data]) => {
      const { parent = null, class: _className, ...rest } = data;
      const classData = parent ? { ...rest, parent } : { ...rest };
      classMap[name] = classData;
      return { class: name, parent: parent || null, properties: rest };
    })
    .sort((a, b) => a.class.localeCompare(b.class));
  return { map: classMap, entries };
}

// Attach global metadata (objects/classes) to the merged stack map.
function attachGlobalMetadata(merged, objectMap, classesData) {
  const base = merged.get('global') || { id: 'global', build: [] };
  const updated = { ...base };
  updated.objects = objectMap;
  updated.classes = classesData.map;
  updated.classEntries = classesData.entries;
  updated.id = 'global';
  return updated;
}

function attachGlobalMetadataToStack(stackObjects, resolvedClasses, merged) {
  const classesData = collectClasses(resolvedClasses);
  const objectMap = buildObjectMap(stackObjects, resolvedClasses);

  const enriched = new Map(merged);
  enriched.set('global', attachGlobalMetadata(enriched, objectMap, classesData));

  return enriched;
}

// Ensure build entries are arrays and log otherwise.
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

// Parse a stack object file, defaulting id to global when omitted.
function readStackObject(filePath, log) {
  const obj = readJsonFile(filePath);
  if (!obj.id) {
    obj.id = 'global';
  }
  normalizeBuild(obj, filePath, log);
  return obj;
}

// Load all stack files from a directory (ordered) with optional required guard.
function loadStackFiles(dirPath, { required, log }) {
  let stackFiles = [];
  try {
    stackFiles = findJsonFiles(dirPath, { required: false });
  } catch (err) {
    throw new Error(`Unable to read stack directory ${dirPath}: ${err.message}`);
  }

  if (required) {
    if (!fs.existsSync(dirPath)) {
      throw new Error(`Stack directory does not exist: ${dirPath}`);
    }
    if (stackFiles.length === 0) {
      throw new Error(`No stack definition JSON files found in ${dirPath}`);
    }
  }

  return stackFiles.map(file => readStackObject(file, log));
}

// Split out a single global object while preserving others.
function extractGlobals(objs = []) {
  let globalObj = null;
  const rest = [];

  objs.forEach(obj => {
    if (!globalObj && obj && obj.id === 'global') {
      globalObj = obj;
      return;
    }
    rest.push(obj);
  });

  return { globalObj, rest };
}

// Merge default and stack globals, allowing overrides from both.
function loadMergedGlobals(defaultsDir, defaultsObjs, stackObjs, log) {
  const globalsPaths = [
    path.join(defaultsDir, 'global.json')
  ];

  let merged = { id: 'global', build: [] };
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

  const { globalObj: defaultsGlobals, rest: defaultsRest } = extractGlobals(defaultsObjs);
  const { globalObj: stackGlobals, rest: stackRest } = extractGlobals(stackObjs);
  [defaultsGlobals, stackGlobals].forEach(obj => {
    if (obj) {
      merged = deepMerge(merged, obj);
    }
  });

  return { globals: merged, defaultsRest, stackRest };
}

// Load, merge, and class-resolve stack instances; attach metadata.
function loadStack(stackDir, defaultsDir, log, options = {}) {
  const { issues } = options;
  if (!fs.existsSync(stackDir)) {
    throw new Error(`Stack directory does not exist: ${stackDir}`);
  }

  const defaultsInstancesDir = path.join(defaultsDir, 'instances');
  const stackInstancesDir = path.join(stackDir, 'instances');
  const merged = new Map();
  const { resolvedClasses } = loadResolvedClasses(stackDir, defaultsDir, log);

  const defaultStacks = loadStackFiles(defaultsInstancesDir, { required: false, log });
  const stackInstanceStacks = loadStackFiles(stackInstancesDir, { required: true, log });

  const { globals, defaultsRest, stackRest } = loadMergedGlobals(defaultsDir, defaultStacks, stackInstanceStacks, log);
  const upsert = obj => {
    if (merged.has(obj.id)) {
      const mergedObj = deepMerge(merged.get(obj.id), obj);
      mergedObj.id = obj.id;
      merged.set(obj.id, mergedObj);
    } else {
      merged.set(obj.id, obj);
    }
  };

  merged.set('global', globals);
  defaultsRest.forEach(upsert);
  stackRest.forEach(upsert);

  const stackObjects = Array.from(merged.values());
  stackObjects.forEach(obj => applyClassDefaults(obj, resolvedClasses, log, issues));

  const withMetadata = attachGlobalMetadataToStack(stackObjects, resolvedClasses, merged);
  return {
    stackObjects: Array.from(withMetadata.values()),
    stackById: withMetadata,
    resolvedClasses,
    global: globals
  };
}

module.exports = { loadStack };
