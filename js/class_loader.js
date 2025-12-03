const path = require('path');
const { deepMerge, mergeValue } = require('./merge_utils');
const { findJsonFiles, readJsonFile } = require('./fs_utils');

// Load class definitions and optional external schemas from a directory.
// Supports:
//   - <name>.json          -> class definition (must include "class")
//   - <name>.schema.json   -> schema file (may omit "class"; derived from filename)
function loadClassFiles(dirPath, log) {
  let classFiles = [];
  try {
    classFiles = findJsonFiles(dirPath);
  } catch (err) {
    throw new Error(`Unable to read classes directory ${dirPath}: ${err.message}`);
  }

  return classFiles
    .map(filePath => {
      const isSchemaFile = filePath.endsWith('.schema.json');
      const data = readJsonFile(filePath);

      if (isSchemaFile) {
        const base = path.basename(filePath, '.schema.json');
        const className = typeof data.class === 'string' ? data.class : base;
        if (!className) {
          log.warn(`Schema file ${filePath} could not determine class name; expected filename <class>.schema.json or "class" field.`);
          return null;
        }
        return { type: 'schema', class: className, schema: data };
      }

      if (!data.class || typeof data.class !== 'string') {
        log.warn(`Class definition ${filePath} is missing required string field 'class'; skipping`);
        return null;
      }
      return { ...data };
    })
    .filter(Boolean);
}

// Merge class definitions with stack definitions overriding defaults.
function mergeClassDefinitions(defaultsDir, stackDir, log) {
  const classDefs = [
    ...loadClassFiles(defaultsDir, log),
    ...loadClassFiles(stackDir, log)
  ];

  const classMap = new Map();
  classDefs.forEach(def => {
    const existing = classMap.get(def.class);

    // Merge standalone schema files into the class definition.
    if (def.type === 'schema') {
      const next = existing ? { ...existing } : { class: def.class };
      next.schema = next.schema ? deepMerge(next.schema, def.schema) : def.schema;
      classMap.set(def.class, next);
      return;
    }

    const merged = existing ? deepMerge(existing, def) : def;
    classMap.set(def.class, merged);
  });
  return classMap;
}

// Recursively resolve inheritance for a class, caching results.
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

// Resolve every class definition, expanding inheritance.
function resolveClasses(classMap, log) {
  const memo = new Map();
  Array.from(classMap.keys()).forEach(name => {
    resolveClass(name, classMap, memo, new Set(), log);
  });
  return memo;
}

// Apply resolved class defaults onto an object, respecting append/reset semantics.
function applyClassDefaults(obj, resolvedClasses, log, issues) {
  if (!obj || typeof obj.class !== 'string') {
    return;
  }
  const classDef = resolvedClasses.get(obj.class);
  if (!classDef) {
    if (issues) {
      issues.warn(`Object '${obj.id}' references unknown class '${obj.class}'.`, {
        code: 'unknown_class',
        id: obj.id,
        class: obj.class
      });
    } else {
      log.warn(`Object '${obj.id}' references unknown class '${obj.class}'.`);
    }
    return;
  }

  // Warn if required fields (from class schema) are missing before defaults apply.
  const requiredFields = Array.isArray(classDef.schema && classDef.schema.required)
    ? classDef.schema.required
    : [];
  const requiredSet = new Set(requiredFields);
  requiredFields.forEach(field => {
    if (obj[field] === undefined) {
      const message = `Object '${obj.id}' is missing required field '${field}' (class '${obj.class}') before defaults; validation will fail unless the instance provides it.`;
      if (issues) {
        issues.warn(message, {
          code: 'required_missing_pre_defaults',
          id: obj.id,
          class: obj.class,
          field
        });
      } else {
        log.warn(message);
      }
    }
  });

  Object.entries(classDef).forEach(([key, value]) => {
    if (['class', 'parent', 'id', 'schema'].includes(key)) {
      return;
    }
    if (value === null || value === undefined) {
      return;
    }
    const isRequired = requiredSet.has(key);
    if (isRequired && obj[key] === undefined) {
      // Leave required fields untouched so validation can catch truly missing data.
      return;
    }
    obj[key] = mergeValue(value, obj[key]);
  });
}

// Load, merge, and resolve classes from defaults + stack directories.
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
