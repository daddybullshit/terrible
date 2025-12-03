const crypto = require('crypto');
const path = require('path');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const { normalizeDirPath } = require('./fs_utils');

// Normalize a stack directory path.
function normalizeStackDir(stackDirInput) {
  return normalizeDirPath(stackDirInput);
}

// Hash a stack path to produce a short, deterministic build dir suffix.
function stackHashFromPath(stackDir) {
  return crypto.createHash('sha256')
    .update(stackDir)
    .digest('hex')
    .slice(0, 12); // Shorten for directory name
}

// Build directory name derived from stack path + hash.
function buildDirNameFromPath(stackDir) {
  return `${path.basename(stackDir)}-${stackHashFromPath(stackDir)}`;
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
  buildDirNameFromPath
};
