'use strict';

const helpers = require('./canonical_helpers');
const { createReadOnlyView } = require('./canonical_api');

// Build a service provider from a canonical snapshot. All services are read-only/pure.
function createServices(canonical) {
  const view = createReadOnlyView(canonical);
  const snapshot = view.getCanonicalSnapshot();

  // Wrap helpers to bind the snapshot without exposing mutation.
  const boundHelpers = {
    classLineage: (classId) => helpers.classLineage(snapshot.classes, classId),
    classInheritsFrom: (childId, ancestorId) => helpers.classInheritsFrom(snapshot.classes, childId, ancestorId),
    filterInstancesByClass: (classId) => helpers.filterInstancesByClass(snapshot, classId),
    filterEntriesByInheritance: (entries, classId) => helpers.filterEntriesByInheritance(entries, classId, snapshot.classes),
    mergedSchemaFor: (classId) => helpers.mergedSchemaFor(snapshot.classes, classId),
    requiredProps: (classId) => helpers.requiredProps(snapshot.classes, classId)
  };

  return {
    snapshot,
    view,
    helpers: boundHelpers
  };
}

module.exports = {
  createServices
};
