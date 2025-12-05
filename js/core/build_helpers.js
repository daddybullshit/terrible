'use strict';

const path = require('path');
const fs = require('fs');
const { parentsFor } = require('./canonical_helpers');

const repoRoot = path.join(__dirname, '..', '..');
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  magenta: '\x1b[35m'
};
const ENABLE_COLOR = process.stdout && process.stdout.isTTY && process.env.NO_COLOR !== '1' && process.env.FORCE_COLOR !== '0';

function fmt(text, color) {
  if (!ENABLE_COLOR || !color || !colors[color]) return text;
  return `${colors[color]}${text}${colors.reset}`;
}

function step(label) {
  return fmt(label, 'bold');
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

// Identify whether an object id is reserved.
function isReservedId(id) {
  return id === 'global';
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

module.exports = {
  buildClassHierarchy,
  cleanBuildDir,
  fmt,
  isReservedId,
  loadEnv,
  step
};
