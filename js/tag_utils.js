const { mergeArrays } = require('./merge_utils');

function setHiddenTags(target, tags) {
  Object.defineProperty(target, '__tags', {
    value: tags,
    enumerable: false,
    writable: true,
    configurable: true
  });
}

function normalizeTags(rawValue, { filePath, log } = {}) {
  if (rawValue === undefined || rawValue === null) {
    return [];
  }

  const rawList = Array.isArray(rawValue) ? rawValue : [rawValue];
  const normalized = [];

  rawList.forEach(value => {
    if (typeof value !== 'string') {
      if (log) {
        log.warn(`'tags' entries must be strings in ${filePath}; skipping value '${value}'`);
      }
      return;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      if (log) {
        log.warn(`Ignoring empty 'tags' value in ${filePath}`);
      }
      return;
    }
    if (!normalized.includes(trimmed)) {
      normalized.push(trimmed);
    }
  });

  return normalized;
}

function attachNormalizedTags(target, rawValue, options = {}) {
  const tags = normalizeTags(rawValue, options);
  setHiddenTags(target, tags);
  return tags;
}

function mergeTags(base = [], extra = []) {
  return mergeArrays(base, extra);
}

module.exports = {
  attachNormalizedTags,
  mergeTags,
  normalizeTags,
  setHiddenTags
};
