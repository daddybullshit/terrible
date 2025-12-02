const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

function normalizeStackDir(stackDirInput) {
  const abs = path.isAbsolute(stackDirInput)
    ? stackDirInput
    : path.resolve(process.cwd(), stackDirInput);
  const real = fs.realpathSync(abs);
  const stat = fs.statSync(real);
  if (!stat.isDirectory()) {
    throw new Error(`Stack path is not a directory: ${stackDirInput}`);
  }
  return real;
}

function stackHashFromPath(stackDir) {
  return crypto.createHash('sha256')
    .update(stackDir)
    .digest('hex')
    .slice(0, 12); // Shorten for directory name
}

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
  const stackDir = process.argv[2];
  const mode = process.argv[3];
  if (!stackDir) {
    console.error('Usage: node stack_paths.js <stackDir> [--hash|--build-dir-name]');
    process.exit(1);
  }
  try {
    const normalized = normalizeStackDir(stackDir);
    if (mode === '--hash') {
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
