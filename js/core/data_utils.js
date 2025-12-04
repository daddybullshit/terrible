'use strict';

function getByPath(obj, pathStr) {
  if (!obj || typeof pathStr !== 'string') {
    return undefined;
  }
  return pathStr.split('.').reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), obj);
}

function toArray(value) {
  if (Array.isArray(value)) {
    return [...value];
  }
  if (value && typeof value === 'object') {
    return Object.values(value);
  }
  return [];
}

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
  getByPath,
  toArray,
  entriesFrom,
  filterList,
  targetIncludes
};
