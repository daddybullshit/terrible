function isPlainObject(value) {
  return Object.prototype.toString.call(value) === '[object Object]';
}

function mergeArrays(base = [], override = []) {
  const out = [];
  [...base, ...override].forEach(item => {
    if (!out.includes(item)) {
      out.push(item);
    }
  });
  return out;
}

function deepMerge(base = {}, override = {}) {
  if (Array.isArray(base) && Array.isArray(override)) {
    return mergeArrays(base, override);
  }

  const result = { ...base };
  Object.entries(override).forEach(([key, value]) => {
    if (value === undefined) {
      return;
    }
    if (Array.isArray(value) && Array.isArray(base[key])) {
      result[key] = mergeArrays(base[key], value);
      return;
    }
    if (isPlainObject(value) && isPlainObject(base[key])) {
      result[key] = deepMerge(base[key], value);
    } else {
      result[key] = value;
    }
  });
  return result;
}

function mergeValue(defaultValue, overrideValue) {
  if (overrideValue === undefined) {
    return defaultValue;
  }
  if (Array.isArray(defaultValue) && Array.isArray(overrideValue)) {
    return mergeArrays(defaultValue, overrideValue);
  }
  if (isPlainObject(defaultValue) && isPlainObject(overrideValue)) {
    return deepMerge(defaultValue, overrideValue);
  }
  return overrideValue;
}

module.exports = {
  isPlainObject,
  mergeArrays,
  deepMerge,
  mergeValue
};
