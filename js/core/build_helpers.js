'use strict';

const path = require('path');
const fs = require('fs');
const { parentsFor } = require('./canonical_helpers');
const { fmt, step } = require('./format');

const repoRoot = path.join(__dirname, '..', '..');

// --- Reserved keys/ids (centralized to avoid duplication) ---

/** Reserved instance IDs that have special meaning */
const RESERVED_IDS = Object.freeze(['global']);

/** Reserved keys on stack objects (instances) */
const RESERVED_INSTANCE_KEYS = Object.freeze(new Set(['id', 'build', 'class']));

/** Reserved keys on class definitions */
const RESERVED_CLASS_KEYS = Object.freeze(new Set(['class', 'parent', 'id', 'schema']));

/** Check if an instance ID is reserved */
function isReservedId(id) {
  return RESERVED_IDS.includes(id);
}

/** Check if a key is reserved on stack objects */
function isReservedInstanceKey(key) {
  return RESERVED_INSTANCE_KEYS.has(key);
}

/** Check if a key is reserved on class definitions */
function isReservedClassKey(key) {
  return RESERVED_CLASS_KEYS.has(key);
}

// Load a .env file into process.env (best-effort; stays silent if missing).
function loadEnv(envPath = path.join(repoRoot, '.env')) {
  if (!envPath || !fs.existsSync(envPath)) {
    return;
  }
  try {
    const dotenv = require('dotenv');
    dotenv.config({ path: envPath });
  } catch (err) {
    if (err && err.code !== 'MODULE_NOT_FOUND') {
      console.warn(`Warning: failed to load .env from ${envPath}: ${err.message}`);
    }
  }
}

// Remove and recreate a build directory, ensuring it stays inside build root.
function cleanBuildDir(buildDir, buildRoot) {
  const buildDirRelative = path.relative(buildRoot, buildDir);
  if (buildDirRelative.startsWith('..') || path.isAbsolute(buildDirRelative)) {
    throw new Error(`Refusing to delete build directory outside build root: ${buildDir}`);
  }
  if (fs.existsSync(buildDir)) {
    fs.rmSync(buildDir, { recursive: true, force: true });
  }
}

// Build a DAG-style view of class inheritance, respecting declared parent order.
function buildClassHierarchy(resolvedClasses) {
  const names = Array.from(resolvedClasses.keys());
  const parentMap = new Map();
  const childMap = new Map();

  names.forEach(name => {
    const def = resolvedClasses.get(name) || {};
    const parents = parentsFor(def);
    parentMap.set(name, parents);
    parents.forEach(parent => {
      if (!childMap.has(parent)) {
        childMap.set(parent, new Set());
      }
      childMap.get(parent).add(name);
    });
  });

  const roots = names.filter(name => parentMap.get(name).length === 0).sort();

  function buildNode(name, seen = new Set()) {
    const parents = parentMap.get(name) || [];
    const cycle = seen.has(name);
    const nextSeen = new Set(seen).add(name);
    const children = Array.from(childMap.get(name) || []).sort().map(child => buildNode(child, nextSeen));
    return { class: name, parents, children, cycle };
  }

  return roots.map(root => buildNode(root));
}

// --- Constants ---
const CANONICAL = {
  version: '0.0.0-alpha',
  stability: 'experimental',
  breakingChanges: true
};

const OUTPUT_TYPES = {
  CANONICAL: 'canonical',
  CLASS_DEFINITIONS: 'class-definitions',
  SCHEMAS: 'schemas',
  INSTANCES: 'instances',
  VALIDATION: 'validation',
  TEMPLATES: 'templates',
  JSON: 'json',
  SUMMARY: 'summary'
};

// --- Output writers ---

function writeCanonical(buildDir, data, log) {
  const filePath = path.join(buildDir, 'canonical.json');
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  log.info(`  • canonical: ${fmt(filePath, 'dim')}`);
}

function writeValidation(metaDir, issues, log) {
  fs.mkdirSync(metaDir, { recursive: true });
  const filePath = path.join(metaDir, 'validation.json');
  fs.writeFileSync(filePath, JSON.stringify({ issues }, null, 2));
  log.info(`  • validation report: ${fmt(filePath, 'dim')}`);
}

function writeClassDefinitions(metaDir, resolvedClasses, log) {
  const classDefsDir = path.join(metaDir, 'class-definitions');
  let count = 0;
  resolvedClasses.forEach((def, name) => {
    if (def) {
      if (count === 0) fs.mkdirSync(classDefsDir, { recursive: true });
      fs.writeFileSync(path.join(classDefsDir, `${name}.json`), JSON.stringify(def, null, 2));
      count += 1;
    }
  });
  log.info(`  • class definitions: ${fmt(count, count ? 'green' : 'dim')} written to ${fmt(classDefsDir, 'dim')}`);
  return count;
}

function writeSchemas(metaDir, resolvedClasses, log) {
  const schemasDir = path.join(metaDir, 'class-schemas');
  let count = 0;
  resolvedClasses.forEach((def, name) => {
    if (def) {
      if (count === 0) fs.mkdirSync(schemasDir, { recursive: true });
      const schemaContent = def.schema || {};
      fs.writeFileSync(path.join(schemasDir, `${name}.schema.json`), JSON.stringify(schemaContent, null, 2));
      count += 1;
    }
  });
  if (count > 0) {
    log.info(`  • class schemas: ${fmt(count, 'green')} written to ${fmt(schemasDir, 'dim')}`);
  } else {
    log.info('  • class schemas: none (no schemas defined)');
  }
  return count;
}

function writeInstances(metaDir, stackObjects, log) {
  const instancesDir = path.join(metaDir, 'instances');
  fs.mkdirSync(instancesDir, { recursive: true });
  let count = 0;
  stackObjects.filter(obj => obj && obj.id).forEach(obj => {
    fs.writeFileSync(path.join(instancesDir, `${obj.id}.json`), JSON.stringify(obj, null, 2));
    count += 1;
  });
  log.info(`  • instances: ${fmt(count, 'green')} written to ${fmt(instancesDir, 'dim')}`);
  return count;
}

// Log source directories with consistent formatting
function logSourceDirs(dirs, type, log) {
  dirs.forEach((dir, idx) => {
    log.info(`  ${fmt(`${idx + 1}.`, 'dim')} ${type}:${fmt(path.join(dir, type), 'dim')}`);
  });
}

module.exports = {
  buildClassHierarchy,
  CANONICAL,
  cleanBuildDir,
  fmt,
  isReservedClassKey,
  isReservedId,
  isReservedInstanceKey,
  loadEnv,
  logSourceDirs,
  OUTPUT_TYPES,
  RESERVED_CLASS_KEYS,
  RESERVED_IDS,
  RESERVED_INSTANCE_KEYS,
  step,
  writeCanonical,
  writeClassDefinitions,
  writeInstances,
  writeSchemas,
  writeValidation
};
