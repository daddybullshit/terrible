// Utility helpers for converting map-like structures to plain objects.

function mapLikeToObject(mapLike) {
  if (!mapLike) {
    return {};
  }
  if (mapLike instanceof Map) {
    return Object.fromEntries(mapLike);
  }
  return mapLike;
}

// Normalize input to array (handles null, undefined, single value, or array)
function asArray(input) {
  if (!input) return [];
  return Array.isArray(input) ? input : [input];
}

module.exports = { asArray, mapLikeToObject };
