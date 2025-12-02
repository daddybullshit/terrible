const { deepMerge } = require('./merge_utils');

function mergeReservedOverride(id, generated, merged) {
  const base = merged.get(id);
  const combined = base ? deepMerge(generated, base) : generated;
  combined.id = generated.id;
  combined.build = generated.build;
  if (generated._entries) {
    combined._entries = generated._entries;
  }
  return combined;
}

function collectTags(stackObjects) {
  const tagMap = new Map();
  stackObjects.forEach(obj => {
    if (!obj || (typeof obj.id === 'string' && obj.id.startsWith('_'))) {
      return;
    }
    const tags = obj.__tags || [];
    tags.forEach(tagName => {
      if (!tagMap.has(tagName)) {
        tagMap.set(tagName, []);
      }
      const list = tagMap.get(tagName);
      if (!list.includes(obj.id)) {
        list.push(obj.id);
      }
    });
  });
  const tagObj = { id: '_tags', build: [] };
  const entries = Array.from(tagMap.entries()).sort(([a], [b]) => a.localeCompare(b));
  entries.forEach(([tagName, ids]) => {
    tagObj[tagName] = ids;
  });
  tagObj._entries = entries.map(([tagName, ids]) => ({ tag: tagName, ids }));
  return tagObj;
}

function isReservedKey(key) {
  if (key === 'id' || key === 'build' || key === 'tags' || key === 'class') {
    return true;
  }
  if (typeof key === 'string' && (key.startsWith('_') || key.startsWith('__'))) {
    return true;
  }
  return false;
}

function collectObjects(stackObjects, resolvedClasses) {
  const entries = stackObjects
    .filter(obj => obj && obj.id && !obj.id.startsWith('_'))
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
      return { id: obj.id, tags: obj.__tags || [], class: className, properties };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
  return { id: '_objects', build: [], _entries: entries };
}

function collectClasses(resolvedClasses) {
  const classesObj = { id: '_classes', build: [] };
  const entries = Array.from(resolvedClasses.entries())
    .map(([name, data]) => {
      const { parent = null, class: _className, ...rest } = data;
      const classData = parent ? { ...rest, parent } : { ...rest };
      classesObj[name] = classData;
      return { class: name, parent: parent || null, properties: rest };
    })
    .sort((a, b) => a.class.localeCompare(b.class));
  classesObj._entries = entries;
  return classesObj;
}

function collectReserved(merged, log) {
  if (merged.has('_reserved') && log) {
    log.warn('Stack object id "_reserved" is reserved and will be overwritten by generated reserved list.');
  }

  const reservedIds = Array.from(merged.keys())
    .filter(key => key.startsWith('_') && key !== '_reserved')
    .sort((a, b) => a.localeCompare(b));

  const entries = reservedIds.map(id => ({ id, data: merged.get(id) }));
  return { id: '_reserved', build: [], _entries: entries };
}

function buildReservedObjects(stackObjects, resolvedClasses, merged, log) {
  const generatedTags = collectTags(stackObjects);
  const generatedObjects = collectObjects(stackObjects, resolvedClasses);
  const generatedClasses = collectClasses(resolvedClasses);

  const reserved = new Map(merged);
  reserved.set('_tags', mergeReservedOverride('_tags', generatedTags, merged));
  reserved.set('_objects', mergeReservedOverride('_objects', generatedObjects, merged));
  reserved.set('_classes', mergeReservedOverride('_classes', generatedClasses, merged));
  reserved.set('_reserved', collectReserved(reserved, log));

  return reserved;
}

module.exports = {
  buildReservedObjects,
  collectClasses,
  collectObjects,
  collectReserved,
  collectTags,
  mergeReservedOverride
};
