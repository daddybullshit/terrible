const path = require('path');
const { deepMerge, mergeValue } = require('./core/merge_utils');
const { findJsonFiles, readJsonFile } = require('./core/fs_utils');

// Load class definitions and schemas into raw entries with provenance.
// Supports:
//   - <name>.json          -> class definition (must include "class")
//   - <name>.schema.json   -> schema file (may omit "class"; derived from filename)
function loadRawClassEntries(dirPath, log, sourceLabel) {
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
        return { type: 'schema', class: className, schema: data, __file: filePath, __source: sourceLabel || 'unknown' };
      }

      if (!data.class || typeof data.class !== 'string') {
        log.warn(`Class definition ${filePath} is missing required string field 'class'; skipping`);
        return null;
      }
      if (data.schema !== undefined) {
        throw new Error(`Class definition ${filePath} must not contain a 'schema' key; use a separate .schema.json file.`);
      }
      return { type: 'class', class: data.class, data, __file: filePath, __source: sourceLabel || 'unknown' };
    })
    .filter(Boolean);
}

function normalizeParents(def, log) {
  if (!def || typeof def !== 'object') {
    return def;
  }
  const add = (list, val) => {
    if (!val) return;
    if (Array.isArray(val)) {
      val.forEach(v => add(list, v));
      return;
    }
    const key = String(val);
    if (!list.includes(key)) {
      list.push(key);
    }
  };

  const parents = [];
  add(parents, def.parent);
  add(parents, def.parents);

  const next = { ...def };
  if (parents.length > 0) {
    next.parent = parents;
  } else {
    delete next.parent;
  }
  if (next.parents !== undefined) {
    delete next.parents;
  }
  if (!Array.isArray(next.parent) && next.parent !== undefined) {
    log && log.warn && log.warn(`Normalized parent for class '${def.class || 'unknown'}' to array form.`);
    next.parent = parents;
  }
  return next;
}

function stripInternalFields(def) {
  if (!def || typeof def !== 'object') {
    return def;
  }
  const next = { ...def };
  delete next.__file;
  delete next.__source;
  return next;
}

// Merge class definitions from an ordered list of class directories (later entries override).
function mergeClassDefinitions(classDirs, log) {
  const dirs = Array.isArray(classDirs) ? classDirs : [classDirs];
  const rawEntries = dirs.flatMap((dir, index) => {
    return loadRawClassEntries(dir, log, `stack_${String(index).padStart(4, '0')}`);
  }).sort((a, b) => {
    const aSrc = a.__source || '';
    const bSrc = b.__source || '';
    if (aSrc !== bSrc) {
      return aSrc.localeCompare(bSrc);
    }
    const aFile = a.__file || '';
    const bFile = b.__file || '';
    return aFile.localeCompare(bFile);
  });

  const classMap = new Map();
  rawEntries.forEach(entry => {
    const existing = classMap.get(entry.class);

    if (entry.type === 'schema') {
      const next = existing ? { ...existing } : { class: entry.class };
      next.schema = next.schema ? deepMerge(next.schema, entry.schema) : entry.schema;
      next.__source = entry.__source || next.__source;
      next.__file = entry.__file || next.__file;
      classMap.set(entry.class, next);
      return;
    }

    if (entry.type === 'class') {
      const merged = existing ? deepMerge(existing, entry.data) : entry.data;
      classMap.set(entry.class, merged);
    }
  });

  // Normalize parent/parents to a single ordered array form for determinism.
  classMap.forEach((def, name) => {
    classMap.set(name, stripInternalFields(normalizeParents(def, log)));
  });

  return classMap;
}

function parentsFor(def) {
  if (!def || typeof def !== 'object') {
    return [];
  }
  const out = [];
  const add = val => {
    if (!val) return;
    if (Array.isArray(val)) {
      val.forEach(add);
      return;
    }
    const key = String(val);
    if (!out.includes(key)) {
      out.push(key);
    }
  };
  add(def.parent);
  add(def.parents);
  return out;
}

// Recursively resolve inheritance for a class, caching results.
function resolveClass(name, classMap, memo, stack, path, log) {
  if (memo.has(name)) {
    return memo.get(name);
  }
  if (stack.has(name)) {
    const cyclePath = [...path, name].join(' -> ');
    throw new Error(`Detected circular class inheritance: ${cyclePath}`);
  }

  const def = classMap.get(name);
  if (!def) {
    return null;
  }

  stack.add(name);
  const nextPath = [...path, name];
  let resolved = {};
  const parentList = parentsFor(def);
  parentList.forEach(parentName => {
    if (nextPath.includes(parentName)) {
      const cyclePath = [...nextPath, parentName].join(' -> ');
      throw new Error(`Detected circular class inheritance: ${cyclePath}`);
    }
    const parentResolved = resolveClass(parentName, classMap, memo, stack, nextPath, log);
    if (!parentResolved && log) {
      log.warn(`Class '${name}' references unknown parent '${parentName}'.`);
    }
    if (parentResolved) {
      resolved = deepMerge(resolved, parentResolved);
    }
  });
  resolved = deepMerge(resolved, def);
  memo.set(name, resolved);
  stack.delete(name);
  return resolved;
}

// Resolve every class definition, expanding inheritance.
function resolveClasses(classMap, log) {
  const memo = new Map();
  Array.from(classMap.keys()).forEach(name => {
    resolveClass(name, classMap, memo, new Set(), [], log);
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

// Load, merge, and resolve classes from ordered stack directories.
function loadResolvedClasses(stackDirs, log) {
  const dirs = Array.isArray(stackDirs) ? stackDirs : [stackDirs];
  const classDirs = dirs.map(dir => path.join(dir, 'classes'));
  const classMap = mergeClassDefinitions(classDirs, log);
  const resolvedClasses = resolveClasses(classMap, log);
  return { classMap, resolvedClasses };
}

module.exports = {
  applyClassDefaults,
  loadResolvedClasses,
  mergeClassDefinitions,
  resolveClasses
};
