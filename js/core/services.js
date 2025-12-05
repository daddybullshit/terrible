'use strict';

const helpers = require('./canonical_helpers');
const { createReadOnlyView, createMutator } = require('./canonical_api');

// Build a service provider from a canonical snapshot. All services are read-only/pure.
// Hook contexts may opt into a mutator (onLoadComplete only) via createHookContext.
function createServices(canonical) {
  const view = createReadOnlyView(canonical);
  const snapshot = view.getCanonicalSnapshot();

  // Wrap helpers to bind the snapshot without exposing mutation.
  const boundHelpers = {
    classLineage: (classId) => helpers.classLineage(snapshot.classesById, classId),
    classInheritsFrom: (childId, ancestorId) => helpers.classInheritsFrom(snapshot.classesById, childId, ancestorId),
    filterInstancesByClass: (classId) => helpers.filterInstancesByClass(snapshot, classId),
    filterEntriesByInheritance: (entries, classId) => helpers.filterEntriesByInheritance(entries, classId, snapshot.classesById),
    mergedSchemaFor: (classId) => helpers.mergedSchemaFor(snapshot.classesById, classId),
    requiredProps: (classId) => helpers.requiredProps(snapshot.classesById, classId)
  };

  // Build a stable hook context with optional mutator. Mutator should only be used
  // during onLoadComplete; later phases stay read-only.
  function createHookContext(options = {}) {
    const {
      log,
      buildDir,
      stackDirs,
      classDirs,
      instanceDirs,
      hookOptions,
      allowMutation = false,
      validate
    } = options;

    const context = {
      canonical: snapshot,
      services: { snapshot, view, helpers: boundHelpers },
      log,
      buildDir,
      stackDirs,
      classDirs,
      instanceDirs,
      options: hookOptions || {}
    };

    if (allowMutation) {
      context.mutator = createMutator(snapshot, { validate });
    }

    return context;
  }

  return {
    snapshot,
    view,
    helpers: boundHelpers,
    createHookContext
  };
}

module.exports = {
  createServices
};
