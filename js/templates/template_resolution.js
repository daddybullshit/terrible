const helpers = require('../core/canonical_helpers');
const { getByPath, toArray, entriesFrom, filterList, targetIncludes } = require('../core/data_utils');

// Retrieve per-render metadata injected by the renderer.
function metaFromOptions(options) {
  return options && options.data && options.data._terrible
    ? options.data._terrible
    : { currentObj: {}, instancesById: new Map(), log: console };
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

// Get the global object from an instances map (Map or plain object).
function globalsFromInstances(instancesById) {
  if (!instancesById) {
    return undefined;
  }
  return instancesById.get ? instancesById.get('global') : instancesById.global;
}

// Resolve a template tag against context, stack/global data, env, or default.
function resolveTagValue(tag, defaultValue, obj, instancesById, log, context) {
  const globalObj = globalsFromInstances(instancesById);

  if (context && Object.prototype.hasOwnProperty.call(context, tag)) {
    return context[tag];
  }

  if (tag.includes('.') && instancesById) {
    const [targetId, targetKey] = tag.split('.', 2);
    if (targetId && targetKey) {
      const targetObj = instancesById.get ? instancesById.get(targetId) : instancesById[targetId];
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

// Check whether a class inherits (directly or indirectly) from a target using canonical helpers.
function classInheritsFrom(className, targetName, classesObj) {
  if (!className || !targetName || !classesObj) {
    return false;
  }
  return helpers.classInheritsFrom(classesObj, className, targetName);
}

function mergedSchemaFor(className, classesObj) {
  if (!className || !classesObj) {
    return null;
  }
  return helpers.mergedSchemaFor(classesObj, className);
}

function schemaRequires(className, prop, classesObj) {
  if (!className || !prop || !classesObj) return false;
  const required = helpers.requiredProps(classesObj, className);
  return required.includes(prop);
}

function schemaHasProp(className, prop, classesObj) {
  if (!className || !prop || !classesObj) return false;
  const merged = mergedSchemaFor(className, classesObj);
  const props = merged && merged.properties && typeof merged.properties === 'object'
    ? merged.properties
    : {};
  return Object.prototype.hasOwnProperty.call(props, prop);
}

function schemaProperties(className, classesObj) {
  const merged = mergedSchemaFor(className, classesObj);
  if (!merged || !merged.properties || typeof merged.properties !== 'object') {
    return {};
  }
  return merged.properties;
}

function classLineage(className, classesObj) {
  if (!className || !classesObj) return [];
  return helpers.classLineage(classesObj, className);
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

// Filter entries that inherit from a given class.
function filterEntriesByInheritance(entries, targetName, classesObj) {
  const list = entriesFrom(entries);
  return helpers.filterEntriesByInheritance(list, targetName, classesObj);
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
  entriesFrom,
  filterEntriesByInheritance,
  filterList,
  getByPath,
  globalsFromInstances,
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
