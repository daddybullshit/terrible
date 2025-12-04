// Minimal object check to avoid treating arrays/functions as plain objects.
function isPlainObject(value) {
  return Object.prototype.toString.call(value) === '[object Object]';
}

// Interpret the append-or-reset convention for arrays.
function arrayResetValue(override) {
  if (isPlainObject(override) && override.$reset === true) {
    if (Array.isArray(override.value)) {
      return override.value;
    }
    return [];
  }
  return null;
}

// Merge arrays with append semantics unless a reset is requested.
function mergeArrays(base = [], override = []) {
  const reset = arrayResetValue(override);
  if (reset !== null) {
    return [...reset];
  }
  if (Array.isArray(override)) {
    return [...base, ...override];
  }
  return Array.isArray(base) ? [...base] : [];
}

// Deep merge objects with array append-or-reset behavior.
function deepMerge(base = {}, override = {}) {
  if (Array.isArray(base) && Array.isArray(override)) {
    return mergeArrays(base, override);
  }
  if (Array.isArray(base)) {
    const reset = arrayResetValue(override);
    if (reset !== null) {
      return [...reset];
    }
    if (Array.isArray(override)) {
      return mergeArrays(base, override);
    }
    return mergeArrays(base, []);
  }

  const result = { ...base };
  Object.entries(override).forEach(([key, value]) => {
    if (value === undefined) {
      return;
    }
    const baseVal = base[key];
    if (Array.isArray(baseVal)) {
      result[key] = mergeArrays(baseVal, value);
      return;
    }
    if (isPlainObject(value) && isPlainObject(baseVal)) {
      result[key] = deepMerge(baseVal, value);
      return;
    }
    result[key] = value;
  });
  return result;
}

// Merge a single field value with append-or-reset behavior for arrays.
function mergeValue(defaultValue, overrideValue) {
  if (overrideValue === undefined) {
    return defaultValue;
  }
  const reset = arrayResetValue(overrideValue);
  if (reset !== null) {
    return [...reset];
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
  arrayResetValue,
  isPlainObject,
  mergeArrays,
  deepMerge,
  mergeValue
};
