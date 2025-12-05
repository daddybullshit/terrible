'use strict';

const { deepMerge } = require('./merge_utils');

// Shared, pure helpers that operate on canonical shapes (classes map + instances array).

function parentsFor(def) {
  if (!def || typeof def !== 'object') return [];
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

function classLineage(classes, classId) {
  if (!classId || !classes || !classes[classId]) return [];
  const result = [];
  const seen = new Set();
  function walk(name) {
    if (!name || seen.has(name)) return;
    const def = classes[name];
    if (!def || typeof def !== 'object') return;
    parentsFor(def).forEach(walk);
    result.push(name);
    seen.add(name);
  }
  walk(classId);
  return result;
}

function classInheritsFrom(classes, childId, ancestorId) {
  if (!childId || !ancestorId || !classes) return false;
  if (childId === ancestorId) return true;
  const stack = [childId];
  const seen = new Set();
  while (stack.length) {
    const current = stack.pop();
    if (!current || seen.has(current)) continue;
    if (current === ancestorId) return true;
    seen.add(current);
    const def = classes[current];
    parentsFor(def).slice().reverse().forEach(parent => stack.push(parent));
  }
  return false;
}

function filterInstancesByClass(canonical, classId) {
  if (!canonical.instances) return [];
  return canonical.instances.filter(inst => classInheritsFrom(canonical.classesById, inst.class, classId));
}

function mergedSchemaFor(classes, classId) {
  if (!classId || !classes || !classes[classId]) return null;
  const lineage = classLineage(classes, classId); // parents before child
  return lineage.reduce((acc, name) => {
    const def = classes[name];
    if (!def || !def.schema) return acc;
    return deepMerge(acc, def.schema);
  }, {});
}

function requiredProps(classes, classId) {
  const schema = mergedSchemaFor(classes, classId);
  if (!schema || !Array.isArray(schema.required)) return [];
  return schema.required;
}

function filterEntriesByInheritance(entries, targetClass, classes) {
  if (!Array.isArray(entries) || !targetClass || !classes) return [];
  return entries.filter(entry => classInheritsFrom(classes, entry.class, targetClass));
}

module.exports = {
  parentsFor,
  classLineage,
  classInheritsFrom,
  filterInstancesByClass,
  filterEntriesByInheritance,
  mergedSchemaFor,
  requiredProps
};
