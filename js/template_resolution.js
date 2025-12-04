const { deepMerge } = require('./merge_utils');

// Retrieve per-render metadata injected by the renderer.
function metaFromOptions(options) {
  return options && options.data && options.data._terrible
    ? options.data._terrible
    : { currentObj: {}, stackById: new Map(), log: console };
}

// Fetch an env value case-insensitively.
function envValueForTag(tag) {
  if (process.env[tag] !== undefined) {
    return process.env[tag];
  }
  const upper = tag.toUpperCase();
  if (process.env[upper] !== undefined) {
    return process.env[upper];
  }
  return undefined;
}

// Get the global object from a stack map (Map or plain object).
function globalsFromStack(stackById) {
  if (!stackById) {
    return undefined;
  }
  return stackById.get ? stackById.get('global') : stackById.global;
}

// Resolve a template tag against context, stack/global data, env, or default.
function resolveTagValue(tag, defaultValue, obj, stackById, log, context) {
  const globalObj = globalsFromStack(stackById);

  if (context && Object.prototype.hasOwnProperty.call(context, tag)) {
    return context[tag];
  }

  if (tag.includes('.') && stackById) {
    const [targetId, targetKey] = tag.split('.', 2);
    if (targetId && targetKey) {
      const targetObj = stackById.get ? stackById.get(targetId) : stackById[targetId];
      if (targetObj && Object.prototype.hasOwnProperty.call(targetObj, targetKey)) {
        return targetObj[targetKey];
      }
      if (defaultValue === undefined && log && log.warn) {
        if (!targetObj) {
          log.warn(`Template tag '{{${tag}}}' references unknown stack object '${targetId}'.`);
        } else {
          log.warn(`Template tag '{{${tag}}}' references missing key '${targetKey}' on stack object '${targetId}'.`);
        }
      }
    }
  }

  if (obj && Object.prototype.hasOwnProperty.call(obj, tag)) {
    return obj[tag];
  }
  if (globalObj && Object.prototype.hasOwnProperty.call(globalObj, tag)) {
    return globalObj[tag];
  }

  const envValue = envValueForTag(tag);
  if (envValue !== undefined) {
    return envValue;
  }

  if (defaultValue !== undefined) {
    return defaultValue;
  }

  const id = obj && obj.id ? obj.id : 'unknown';
  if (log && log.warn) {
    log.warn(`Template tag '{{${tag}}}' has no value in ${id}.`);
  }
  return `{{${tag}}}`;
}

// Safely get a nested value from a dotted path.
function getByPath(obj, pathStr) {
  if (!obj || typeof pathStr !== 'string') {
    return undefined;
  }
  return pathStr.split('.').reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), obj);
}

// Normalize parent/parents fields to an ordered, de-duplicated array.
function parentsFor(def) {
  if (!def || typeof def !== 'object') {
    return [];
  }
  const out = [];
  const add = val => {
    if (!val) return;
    const key = String(val);
    if (!out.includes(key)) {
      out.push(key);
    }
  };
  if (Array.isArray(def.parent)) {
    def.parent.forEach(add);
  } else if (def.parent) {
    add(def.parent);
  }
  if (Array.isArray(def.parents)) {
    def.parents.forEach(add);
  }
  return out;
}

// Check whether a class inherits (directly or indirectly) from a target.
// Supports multiple parents (parent as array) while preserving declared order.
function classInheritsFrom(className, targetName, classesObj) {
  if (!className || !targetName || !classesObj) {
    return false;
  }
  const stack = [className];
  const seen = new Set();
  while (stack.length) {
    const current = stack.pop();
    if (!current || seen.has(current)) continue;
    if (current === targetName) {
      return true;
    }
    seen.add(current);
    const def = classesObj[current];
    const parents = parentsFor(def);
    // Push in reverse so left-to-right order is respected when popping.
    for (let i = parents.length - 1; i >= 0; i -= 1) {
      stack.push(parents[i]);
    }
  }
  return false;
}

// Backward compatible alias kept for existing callers.
const classInheritsFromMulti = classInheritsFrom;

// Convert any list-like value to an array (Map, object, array).
function toArray(value) {
  if (Array.isArray(value)) {
    return [...value];
  }
  if (value && typeof value === 'object') {
    return Object.values(value);
  }
  return [];
}

// Normalize a list-like value to a sorted array for stable iteration.
function entriesFrom(listLike) {
  if (!listLike) {
    return [];
  }
  if (Array.isArray(listLike)) {
    return [...listLike];
  }
  if (listLike instanceof Map) {
    return Array.from(listLike.values());
  }
  if (typeof listLike === 'object') {
    return Object.keys(listLike)
      .sort((a, b) => a.localeCompare(b))
      .map(key => listLike[key]);
  }
  return [];
}

// Filter entries that inherit from a given class.
function filterEntriesByInheritance(entries, targetName, classesObj) {
  const list = entriesFrom(entries);
  return list.filter(entry => classInheritsFrom(entry.class, targetName, classesObj));
}

// Filter a list with a predicate that may throw.
function filterList(listLike, predicate) {
  const arr = entriesFrom(listLike);
  return arr.filter(item => {
    try {
      return predicate(item);
    } catch (_err) {
      return false;
    }
  });
}

// Check inclusion across strings or arrays.
function targetIncludes(target, needle) {
  if (Array.isArray(target)) {
    return target.includes(needle);
  }
  if (typeof target === 'string' && typeof needle === 'string') {
    return target.includes(needle);
  }
  return false;
}

// Merge schemas across a class inheritance chain (including multi-parent).
function mergedSchemaFor(className, classesObj) {
  if (!className || !classesObj || !classesObj[className]) {
    return null;
  }
  const seen = new Set();
  const order = [];
  const stack = [className];
  while (stack.length) {
    const current = stack.pop();
    if (!current || seen.has(current)) continue;
    seen.add(current);
    order.unshift(current); // reverse traversal: parents applied before children
    const def = classesObj[current];
    if (!def || typeof def !== 'object') continue;
    const parents = [];
    if (Array.isArray(def.parent)) parents.push(...def.parent);
    else if (def.parent) parents.push(def.parent);
    if (Array.isArray(def.parents)) parents.push(...def.parents);
    parents.reverse().forEach(p => stack.push(p));
  }

  return order.reduce((acc, name) => {
    const def = classesObj[name];
    if (!def || !def.schema) {
      return acc;
    }
    return deepMerge(acc, def.schema);
  }, {});
}

// Find the class that last defined a property in schema merge order.
function schemaPropertySource(className, prop, classesObj) {
  if (!className || !prop || !classesObj || !classesObj[className]) {
    return null;
  }
  const lineage = classLineage(className, classesObj);
  for (let i = 0; i < lineage.length; i += 1) {
    const name = lineage[i];
    const def = classesObj[name];
    const props = def && def.schema && def.schema.properties;
    if (props && Object.prototype.hasOwnProperty.call(props, prop)) {
      return name;
    }
  }
  return null;
}

// Check if a property is required for a class (considering inherited schema).
function schemaRequires(className, prop, classesObj) {
  if (!className || !prop || !classesObj) return false;
  const merged = mergedSchemaFor(className, classesObj);
  const required = Array.isArray(merged && merged.required) ? merged.required : [];
  return required.includes(prop);
}

// Check if a property exists in schema (including inherited).
function schemaHasProp(className, prop, classesObj) {
  if (!className || !prop || !classesObj) return false;
  const merged = mergedSchemaFor(className, classesObj);
  const props = merged && merged.properties && typeof merged.properties === 'object'
    ? merged.properties
    : {};
  return Object.prototype.hasOwnProperty.call(props, prop);
}

// Collect flattened schema properties (inherited).
function schemaProperties(className, classesObj) {
  const merged = mergedSchemaFor(className, classesObj);
  if (!merged || !merged.properties || typeof merged.properties !== 'object') {
    return {};
  }
  return merged.properties;
}

// Return lineage from root(s) to class (ordered, deduped).
function classLineage(className, classesObj) {
  if (!className || !classesObj || !classesObj[className]) return [];
  const result = [];
  const seen = new Set();
  function walk(name) {
    if (!name || seen.has(name)) return;
    const def = classesObj[name];
    if (!def || typeof def !== 'object') return;
    const parents = [];
    if (Array.isArray(def.parent)) parents.push(...def.parent);
    else if (def.parent) parents.push(def.parent);
    if (Array.isArray(def.parents)) parents.push(...def.parents);
    parents.forEach(walk);
    result.push(name);
    seen.add(name);
  }
  walk(className);
  return result;
}

// Group required fields by the class that defined them, ordered by lineage.
function requiredFieldsBySource(className, classesObj) {
  if (!className || !classesObj) return [];
  const lineage = classLineage(className, classesObj); // parents first
  const merged = mergedSchemaFor(className, classesObj) || {};
  const mergedProps = merged.properties && typeof merged.properties === 'object' ? merged.properties : {};
  const required = Array.isArray(merged.required) ? merged.required : [];
  const groups = new Map();
  lineage.forEach(cls => groups.set(cls, []));

  const seen = new Set();
  required.forEach(prop => {
    if (seen.has(prop)) return;
    seen.add(prop);
    if (!Object.prototype.hasOwnProperty.call(mergedProps, prop)) return;
    const source = schemaPropertySource(className, prop, classesObj) || lineage[lineage.length - 1];
    if (!groups.has(source)) {
      groups.set(source, []);
    }
    groups.get(source).push(prop);
  });

  return lineage
    .slice()
    .reverse()
    .map(cls => ({ class: cls, fields: groups.get(cls) || [] }))
    .filter(entry => entry.fields.length > 0);
}

module.exports = {
  classInheritsFrom,
  classInheritsFromMulti,
  parentsFor,
  entriesFrom,
  filterEntriesByInheritance,
  filterList,
  getByPath,
  globalsFromStack,
  metaFromOptions,
  resolveTagValue,
  targetIncludes,
  toArray,
  mergedSchemaFor,
  schemaRequires,
  schemaHasProp,
  schemaProperties,
  schemaPropertySource,
  classLineage,
  requiredFieldsBySource
};
