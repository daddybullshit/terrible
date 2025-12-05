'use strict';

// Internal API for manipulating and reading canonical data.
// Read-only views are used by the templating stage; mutator is a draft
// for future hook/enrichment phases.

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) {
      deepFreeze(value[key]);
    }
  }
  return value;
}

function cloneCanonical(canonical) {
  // Canonical is pure data (no functions); shallow structured clone is enough for a draft.
  if (typeof structuredClone === 'function') {
    return structuredClone(canonical);
  }
  return JSON.parse(JSON.stringify(canonical));
}

function buildIndexes(state) {
  // Recompute derived indexes expected by templates.
  const instancesById = {};
  if (Array.isArray(state.instances)) {
    for (const inst of state.instances) {
      if (inst && inst.id) {
        instancesById[inst.id] = inst;
      }
    }
  }
  state.instancesById = instancesById;
  return state;
}

function createMutator(initialCanonical, { validate } = {}) {
  let working = cloneCanonical(initialCanonical);

  function assertHasId(obj, kind) {
    if (!obj || !obj.id) {
      throw new Error(`${kind} requires an id`);
    }
  }

  function upsertInstance(instance) {
    assertHasId(instance, 'instance');
    const existingIdx = working.instances.findIndex((i) => i && i.id === instance.id);
    if (existingIdx === -1) {
      working.instances.push(instance);
    } else {
      working.instances[existingIdx] = { ...working.instances[existingIdx], ...instance };
    }
  }

  function removeInstance(id) {
    working.instances = working.instances.filter((inst) => inst.id !== id);
  }

  function upsertClass(def) {
    assertHasId(def, 'class');
    working.classesById[def.id] = { ...working.classesById[def.id], ...def };
    // Rebuild classes array
    working.classes = Object.values(working.classesById);
  }

  function removeClass(id) {
    delete working.classesById[id];
    working.classes = Object.values(working.classesById);
  }

  function setGlobal(update) {
    working.global = { ...working.global, ...update };
  }

  function commit() {
    buildIndexes(working);
    if (validate) {
      validate(working);
    }
    const snapshot = cloneCanonical(working);
    deepFreeze(snapshot);
    return snapshot;
  }

  function getWorkingCopy() {
    return working;
  }

  return {
    upsertInstance,
    removeInstance,
    upsertClass,
    removeClass,
    setGlobal,
    commit,
    getWorkingCopy,
  };
}

function createReadOnlyView(canonical) {
  const snapshot = cloneCanonical(canonical);
  deepFreeze(snapshot);

  const getCanonicalSnapshot = () => snapshot;

  const getInstance = (id) => snapshot.instancesById[id] || null;
  const listInstances = () => snapshot.instances.slice();
  const getClass = (id) => snapshot.classesById[id] || null;
  const listClasses = () => snapshot.classes.slice();
  const findByClass = (classId) => snapshot.instances.filter((inst) => inst.class === classId);

  return {
    getCanonicalSnapshot,
    getInstance,
    listInstances,
    getClass,
    listClasses,
    findByClass,
  };
}

module.exports = {
  createMutator,
  createReadOnlyView,
  buildIndexes,
  deepFreeze,
  cloneCanonical,
};
