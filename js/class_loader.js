const path = require('path');
const fs = require('fs');
const { readJsonFile } = require('./json_utils');
const { deepMerge, mergeValue } = require('./merge_utils');
const { mergeTags, setHiddenTags } = require('./tag_utils');

function collectClassFiles(dirPath) {
  const files = [];
  function walk(current) {
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch (err) {
      throw new Error(`Unable to read classes directory ${current}: ${err.message}`);
    }
    entries
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach(entry => {
        const entryPath = path.join(current, entry.name);
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

function loadClassFiles(dirPath, log) {
  if (!fs.existsSync(dirPath)) {
    return [];
  }

  return collectClassFiles(dirPath)
    .map(filePath => {
      const obj = readJsonFile(filePath);
      if (!obj.class || typeof obj.class !== 'string') {
        log.warn(`Class definition ${filePath} is missing required string property 'class'; skipping`);
        return null;
      }
      return obj;
    })
    .filter(Boolean);
}

function mergeClassDefinitions(defaultsDir, stackDir, log) {
  const classDefs = [
    ...loadClassFiles(defaultsDir, log),
    ...loadClassFiles(stackDir, log)
  ];

  const classMap = new Map();
  classDefs.forEach(def => {
    const existing = classMap.get(def.class);
    const merged = existing ? deepMerge(existing, def) : def;
    classMap.set(def.class, merged);
  });
  return classMap;
}

function resolveClass(name, classMap, memo, stack, log) {
  if (memo.has(name)) {
    return memo.get(name);
  }
  if (stack.has(name)) {
    throw new Error(`Detected circular class inheritance involving '${name}'.`);
  }

  const def = classMap.get(name);
  if (!def) {
    return null;
  }

  stack.add(name);
  let resolved = {};
  if (def.parent) {
    const parentResolved = resolveClass(def.parent, classMap, memo, stack, log);
    if (!parentResolved && log) {
      log.warn(`Class '${name}' references unknown parent '${def.parent}'.`);
    }
    if (parentResolved) {
      resolved = deepMerge(resolved, parentResolved);
    }
  }
  resolved = deepMerge(resolved, def);
  memo.set(name, resolved);
  stack.delete(name);
  return resolved;
}

function resolveClasses(classMap, log) {
  const memo = new Map();
  Array.from(classMap.keys()).forEach(name => {
    resolveClass(name, classMap, memo, new Set(), log);
  });
  return memo;
}

function applyClassDefaults(obj, resolvedClasses, log) {
  if (!obj || typeof obj.class !== 'string') {
    return;
  }
  const classDef = resolvedClasses.get(obj.class);
  if (!classDef) {
    log.warn(`Object '${obj.id}' references unknown class '${obj.class}'.`);
    return;
  }

  const classTags = Array.isArray(classDef.tags) ? classDef.tags : [];
  const currentTags = Array.isArray(obj.__tags) ? obj.__tags : (Array.isArray(obj.tags) ? obj.tags : []);
  const mergedTags = mergeTags(classTags, currentTags);
  setHiddenTags(obj, mergedTags);
  obj.tags = mergedTags;

  Object.entries(classDef).forEach(([key, value]) => {
    if (['class', 'parent', 'id', 'tags'].includes(key)) {
      return;
    }
    if (value === null || value === undefined) {
      return;
    }
    obj[key] = mergeValue(value, obj[key]);
  });
}

function loadResolvedClasses(stackDir, defaultsDir, log) {
  const defaultsClassesDir = path.join(defaultsDir, 'classes');
  const stackClassesDir = path.join(stackDir, 'classes');
  const classMap = mergeClassDefinitions(defaultsClassesDir, stackClassesDir, log);
  const resolvedClasses = resolveClasses(classMap, log);
  return { classMap, resolvedClasses };
}

module.exports = {
  applyClassDefaults,
  loadResolvedClasses,
  mergeClassDefinitions,
  resolveClasses
};
