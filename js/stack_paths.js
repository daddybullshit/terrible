const crypto = require('crypto');
const path = require('path');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const { normalizeDirPath } = require('./fs_utils');

// Normalize a stack directory path.
function normalizeStackDir(stackDirInput) {
  return normalizeDirPath(stackDirInput);
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

module.exports = {
  getStackHash,
  getBuildDirName,
  resolveStackDir: normalizeStackDir,
  stackHashFromPath,
  buildDirNameFromPath,
  stackHashFromDirs,
  buildDirNameFromDirs
};
