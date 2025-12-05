const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const { normalizeDirPath } = require('./core/fs_utils');
const { PathError } = require('./core/errors');

const repoRoot = path.join(__dirname, '..');

function toArray(value) {
  if (Array.isArray(value)) {
    return value.filter(Boolean);
  }
  return value ? [value] : [];
}

// Normalize a stack directory path. Tries CWD first (like mv/cp), then repo root for convenience.
function normalizeStackDir(stackDirInput) {
  if (!stackDirInput) {
    throw new Error('Directory path is required.');
  }
  const candidates = [];
  if (path.isAbsolute(stackDirInput)) {
    candidates.push(stackDirInput);
  } else {
    const sanitized = stackDirInput.replace(/^(\.\.\/)+/, '');
    candidates.push(path.resolve(process.cwd(), stackDirInput));
    candidates.push(path.resolve(repoRoot, stackDirInput));
    if (sanitized && sanitized !== stackDirInput) {
      candidates.push(path.resolve(repoRoot, sanitized));
    }
    candidates.push(path.resolve(repoRoot, '..', stackDirInput));
  }
  const attempts = [];
  for (const candidate of candidates) {
    if (attempts.some(a => a.path === candidate)) continue;
    const exists = fs.existsSync(candidate);
    attempts.push({ path: candidate, exists });
    if (!exists) continue;
    try {
      return normalizeDirPath(candidate);
    } catch (err) {
      // If this candidate fails, continue to the next; fall through to combined error below.
    }
  }
  const tried = attempts.map(a => `${a.path} (${a.exists ? 'exists but not a directory' : 'not found'})`).join('\n  ');
  throw new PathError(
    `Directory not found: ${stackDirInput}`,
    { input: stackDirInput, cwd: process.cwd(), attempts: attempts.map(a => a.path), tried }
  );
}

// Hash a stack path (or identifier string) to produce a short, deterministic build dir suffix.
function stackHashFromPath(stackDir) {
  return crypto.createHash('sha256')
    .update(stackDir)
    .digest('hex')
    .slice(0, 12); // Shorten for directory name
}

// Build directory name derived from stack path + hash.
function buildDirNameFromPath(stackDir, { includeHash = true } = {}) {
  const base = path.basename(stackDir);
  if (!includeHash) {
    return base;
  }
  return `${base}-${stackHashFromPath(stackDir)}`;
}

// Hash a stack set (array of dirs) deterministically.
function stackHashFromDirs(stackDirs) {
  const normalized = Array.isArray(stackDirs) ? stackDirs.map(normalizeStackDir) : [normalizeStackDir(String(stackDirs))];
  return stackHashFromPath(normalized.join('|'));
}

// Build directory name for a stack set; use a short prefix when combining.
function buildDirNameFromDirs(stackDirs, { includeHash = true } = {}) {
  const dirs = Array.isArray(stackDirs) ? stackDirs : [stackDirs];
  const baseNames = dirs.map(d => path.basename(normalizeStackDir(d)));
  if (includeHash) {
    const hash = stackHashFromDirs(dirs);
    if (dirs.length === 1) {
      return `${baseNames[0]}-${hash}`;
    }
    return `stackset-${hash}`;
  }
  if (dirs.length === 1) {
    return baseNames[0];
  }
  return `stackset-${baseNames.join('+')}`;
}

function getStackHash(stackDirInput) {
  const stackDir = normalizeStackDir(stackDirInput);
  return stackHashFromPath(stackDir);
}

function getBuildDirName(stackDirInput) {
  const stackDir = normalizeStackDir(stackDirInput);
  return buildDirNameFromPath(stackDir);
}

function resolveStackDirs(inputs) {
  return toArray(inputs).map(stackPath => normalizeStackDir(stackPath));
}

function resolveDirs(inputs, fallbackDirs) {
  const dirs = toArray(inputs);
  const chosen = dirs.length ? dirs : fallbackDirs;
  return chosen.map(dir => (path.isAbsolute(dir) ? dir : path.resolve(process.cwd(), dir)));
}

function resolveBuildPaths({ buildRootInput, buildDirInput, buildNameInput, stackDirs, includeHash }) {
  const resolvedBuildRoot = buildDirInput
    ? (path.isAbsolute(buildDirInput) ? path.dirname(buildDirInput) : path.resolve(process.cwd(), path.dirname(buildDirInput)))
    : (buildRootInput ? (path.isAbsolute(buildRootInput) ? buildRootInput : path.resolve(process.cwd(), buildRootInput)) : path.join(repoRoot, 'build'));

  if (buildDirInput) {
    const absoluteBuildDir = path.isAbsolute(buildDirInput) ? buildDirInput : path.join(resolvedBuildRoot, buildDirInput);
    return { buildRoot: resolvedBuildRoot, buildDir: absoluteBuildDir };
  }

  const name = buildNameInput
    ? String(buildNameInput)
    : buildDirNameFromDirs(stackDirs, { includeHash });
  return { buildRoot: resolvedBuildRoot, buildDir: path.join(resolvedBuildRoot, name) };
}

if (require.main === module) {
  const argv = yargs(hideBin(process.argv))
    .usage('Usage: node stack_paths.js <stackDir> [--hash|--build-dir-name]')
    .option('hash', {
      type: 'boolean',
      describe: 'Print stack hash'
    })
    .option('build-dir-name', {
      type: 'boolean',
      describe: 'Print build directory name (default)'
    })
    .help(false)
    .version(false)
    .strict()
    .demandCommand(1, 'Stack directory is required')
    .argv;

  const stackDir = argv._[0];
  const modeHash = argv.hash === true;
  try {
    const normalized = normalizeStackDir(stackDir);
    if (modeHash) {
      console.log(stackHashFromPath(normalized));
    } else {
      console.log(buildDirNameFromPath(normalized));
    }
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}

/**
 * Validate multiple directory paths, collecting all errors before failing.
 * Returns { valid: string[], errors: PathError[] }.
 */
function validateDirs(inputs, label = 'directory') {
  const valid = [];
  const errors = [];
  for (const input of toArray(inputs)) {
    try {
      valid.push(normalizeStackDir(input));
    } catch (err) {
      if (err instanceof PathError) {
        errors.push(err);
      } else {
        errors.push(new PathError(`Invalid ${label}: ${input}`, { input, cause: err.message }));
      }
    }
  }
  return { valid, errors };
}

module.exports = {
  getStackHash,
  getBuildDirName,
  resolveStackDir: normalizeStackDir,
  stackHashFromPath,
  buildDirNameFromPath,
  stackHashFromDirs,
  buildDirNameFromDirs,
  resolveStackDirs,
  resolveDirs,
  resolveBuildPaths,
  validateDirs
};
