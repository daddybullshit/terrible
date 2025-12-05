const path = require('path');
const fs = require('fs');
const { applyClassDefaults, loadResolvedClasses } = require('./class_loader');
const { deepMerge } = require('./core/merge_utils');
const { findJsonFiles, readJsonFile } = require('./core/fs_utils');
const { isReservedId } = require('./core/build_helpers');

const RESERVED_KEYS = new Set(['id', 'build', 'class']);

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

function ensureDirectoriesExist(roots, label) {
  const missing = roots.filter(dir => !fs.existsSync(dir));
  if (missing.length) {
    throw new Error(`${label} directory does not exist: ${missing.join(', ')}`);
  }
  const notDirectories = roots.filter(dir => {
    try {
      return !fs.statSync(dir).isDirectory();
    } catch (err) {
      return true;
    }
  });
  if (notDirectories.length) {
    throw new Error(`${label} path is not a directory: ${notDirectories.join(', ')}`);
  }
}

function inspectInstanceRoots(roots) {
  return roots.map(root => {
    const globalPath = path.join(root, 'global.json');
    const instancesDir = path.join(root, 'instances');
    let instanceFiles = [];
    try {
      instanceFiles = findJsonFiles(instancesDir, { required: false });
    } catch (err) {
      throw new Error(`Unable to read instances directory ${instancesDir}: ${err.message}`);
    }
    const hasGlobal = fs.existsSync(globalPath);
    const hasInstances = instanceFiles.length > 0;
    return { root, globalPath, instancesDir, hasGlobal, hasInstances };
  });
}

// First pass: load/merge classes + schemas deterministically from ordered roots.
function loadClassesAndSchemas(classDirs, log) {
  const roots = Array.isArray(classDirs) ? classDirs : [classDirs];
  ensureDirectoriesExist(roots, 'Classes');
  const { resolvedClasses } = loadResolvedClasses(roots, log);
  return resolvedClasses;
}

// Second pass: load/merge instances/global using resolved classes.
function loadInstances({ instanceDirs, resolvedClasses, log, issues }) {
  const roots = Array.isArray(instanceDirs) ? instanceDirs : [instanceDirs];
  if (!roots.length) {
    throw new Error('At least one instances root is required.');
  }

  ensureDirectoriesExist(roots, 'Instances');

  const inspections = inspectInstanceRoots(roots);
  const emptyRoots = inspections.filter(entry => !entry.hasGlobal && !entry.hasInstances).map(entry => entry.root);
  if (emptyRoots.length) {
    throw new Error(`No instance or global files found in ${emptyRoots.join(', ')}`);
  }

  const merged = new Map();
  let mergedGlobals = { id: 'global', build: [] };

  inspections.forEach(entry => {
    const { globalPath, instancesDir, hasGlobal } = entry;
    const files = loadStackFiles(instancesDir, { required: false, log });

    if (hasGlobal) {
      try {
        const data = readJsonFile(globalPath);
        mergedGlobals = deepMerge(mergedGlobals, data);
      } catch (err) {
        log.error(`Failed to parse ${globalPath}: ${err.message}`);
      }
    }

    files.forEach(obj => {
      if (obj.id === 'global') {
        mergedGlobals = deepMerge(mergedGlobals, obj);
        return;
      }
      if (merged.has(obj.id)) {
        const mergedObj = deepMerge(merged.get(obj.id), obj);
        mergedObj.id = obj.id;
        merged.set(obj.id, mergedObj);
      } else {
        merged.set(obj.id, obj);
      }
    });
  });

  merged.set('global', mergedGlobals);

  const stackObjects = Array.from(merged.values());
  stackObjects.forEach(obj => applyClassDefaults(obj, resolvedClasses, log, issues));

  const withMetadata = attachGlobalMetadataToStack(stackObjects, resolvedClasses, merged);
  return {
    stackObjects: ['global', ...Array.from(withMetadata.keys()).filter(k => k !== 'global')]
      .map(key => withMetadata.get(key))
      .filter(Boolean),
    instancesById: withMetadata,
    global: mergedGlobals
  };
}

// Load, merge, and resolve stack data from ordered stack/class/instance roots.
function loadStack({ stackDirs, classDirs, instanceDirs, log, issues }) {
  const stacks = Array.isArray(stackDirs) ? stackDirs : [stackDirs];
  if (!stacks.length) {
    throw new Error('At least one stack directory is required.');
  }
  stacks.forEach(dir => {
    if (!fs.existsSync(dir)) {
      throw new Error(`Stack directory does not exist: ${dir}`);
    }
  });

  const classRoots = Array.isArray(classDirs) && classDirs.length ? classDirs : stacks;
  const instanceRoots = Array.isArray(instanceDirs) && instanceDirs.length ? instanceDirs : stacks;

  const resolvedClasses = loadClassesAndSchemas(classRoots, log);
  const { stackObjects, instancesById, global } = loadInstances({ instanceDirs: instanceRoots, resolvedClasses, log, issues });

  return {
    stackObjects,
    instancesById,
    resolvedClasses,
    global
  };
}

// Load and merge instances only (no class resolution, no validation).
// Returns raw merged instance data without class defaults applied.
function loadInstancesOnly({ instanceDirs, log }) {
  const roots = Array.isArray(instanceDirs) ? instanceDirs : [instanceDirs];
  if (!roots.length) {
    throw new Error('At least one instances root is required.');
  }

  ensureDirectoriesExist(roots, 'Instances');

  const inspections = inspectInstanceRoots(roots);
  const emptyRoots = inspections.filter(entry => !entry.hasGlobal && !entry.hasInstances).map(entry => entry.root);
  if (emptyRoots.length) {
    throw new Error(`No instance or global files found in ${emptyRoots.join(', ')}`);
  }

  const merged = new Map();
  let mergedGlobals = { id: 'global', build: [] };

  inspections.forEach(entry => {
    const { globalPath, instancesDir, hasGlobal } = entry;
    const files = loadStackFiles(instancesDir, { required: false, log });

    if (hasGlobal) {
      try {
        const data = readJsonFile(globalPath);
        mergedGlobals = deepMerge(mergedGlobals, data);
      } catch (err) {
        log.error(`Failed to parse ${globalPath}: ${err.message}`);
      }
    }

    files.forEach(obj => {
      if (obj.id === 'global') {
        mergedGlobals = deepMerge(mergedGlobals, obj);
        return;
      }
      if (merged.has(obj.id)) {
        const mergedObj = deepMerge(merged.get(obj.id), obj);
        mergedObj.id = obj.id;
        merged.set(obj.id, mergedObj);
      } else {
        merged.set(obj.id, obj);
      }
    });
  });

  merged.set('global', mergedGlobals);

  const stackObjects = Array.from(merged.values());
  const instancesById = new Map(merged);

  return {
    stackObjects: ['global', ...Array.from(instancesById.keys()).filter(k => k !== 'global')]
      .map(key => instancesById.get(key))
      .filter(Boolean),
    instancesById,
    global: mergedGlobals
  };
}

module.exports = { loadStack, loadInstancesOnly };
