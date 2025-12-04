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

module.exports = { mapLikeToObject };
