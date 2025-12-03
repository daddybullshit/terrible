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

// Check whether a class inherits (directly or indirectly) from a target.
function classInheritsFrom(className, targetName, classesObj) {
  if (!className || !targetName || !classesObj) {
    return false;
  }
  let current = className;
  const seen = new Set();
  while (current && !seen.has(current)) {
    if (current === targetName) {
      return true;
    }
    seen.add(current);
    const def = classesObj[current];
    current = def && typeof def === 'object' ? def.parent : undefined;
  }
  return false;
}

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

module.exports = {
  classInheritsFrom,
  entriesFrom,
  filterEntriesByInheritance,
  filterList,
  getByPath,
  globalsFromStack,
  metaFromOptions,
  resolveTagValue,
  targetIncludes,
  toArray
};
