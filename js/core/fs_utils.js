const fs = require('fs');
const path = require('path');
const glob = require('glob');
const { ParseError, PathError } = require('./errors');

// Compute line/column for a character index in a string.
function positionToLineCol(text, index) {
  const upToIndex = text.slice(0, index);
  const lines = upToIndex.split(/\r?\n/);
  const line = lines.length;
  const column = lines[lines.length - 1].length + 1;
  return { line, column };
}

// Parse JSON with context-rich errors (file path, line, column).
function readJsonFile(filePath) {
  const contents = fs.readFileSync(filePath, 'utf8');
  try {
    return JSON.parse(contents);
  } catch (err) {
    const message = err && err.message ? err.message : 'Unknown JSON parse error';
    const match = message.match(/position (\d+)/);
    if (match) {
      const index = Number(match[1]);
      if (!Number.isNaN(index)) {
        const { line, column } = positionToLineCol(contents, index);
        const annotated = `${message} (at ${filePath}:${line}:${column})`;
        throw new ParseError(annotated, { filePath, line, column, cause: err });
      }
    }
    throw new ParseError(`Failed to parse JSON in ${filePath}: ${message}`, { filePath, cause: err });
  }
}

// Normalize and verify a directory path; resolves relative paths against CWD.
function normalizeDirPath(dirInput) {
  if (!dirInput) {
    throw new PathError('Directory path is required.', { input: dirInput });
  }
  const abs = path.isAbsolute(dirInput)
    ? dirInput
    : path.resolve(process.cwd(), dirInput);

  if (!fs.existsSync(abs)) {
    throw new PathError(`Directory does not exist: ${dirInput} (resolved to ${abs})`, { input: dirInput, resolved: abs });
  }

  const real = fs.realpathSync(abs);
  const stat = fs.statSync(real);
  if (!stat.isDirectory()) {
    throw new PathError(`Path is not a directory: ${dirInput} (resolved to ${abs})`, { input: dirInput, resolved: abs });
  }
  return real;
}

// Sort files by depth (shallow first) then name for deterministic merges.
function sortByDepthThenName(files, baseDir) {
  return files
    .map(abs => ({ abs, rel: path.relative(baseDir, abs) }))
    .sort((a, b) => {
      const depthA = a.rel.split(path.sep).length;
      const depthB = b.rel.split(path.sep).length;
      if (depthA !== depthB) {
        return depthA - depthB;
      }
      return a.rel.localeCompare(b.rel);
    })
    .map(entry => entry.abs);
}

// Recursively scan a directory for files matching a glob pattern.
function scanDir(dir, { pattern = '**/*', absolute = true } = {}) {
  if (!dir || !fs.existsSync(dir)) {
    return [];
  }
  return glob
    .sync(pattern, {
      cwd: dir,
      absolute,
      nodir: true,
      dot: false,
      windowsPathsNoEscape: true
    })
    .sort();
}

// Find JSON files recursively, with optional required guard.
function findJsonFiles(dir, { required = false } = {}) {
  if (!dir || !fs.existsSync(dir)) {
    if (required) {
      throw new PathError(`Directory does not exist: ${dir}`, { dir });
    }
    return [];
  }

  const matches = glob.sync('**/*.json', {
    cwd: dir,
    absolute: true,
    nodir: true,
    dot: false,
    windowsPathsNoEscape: true
  });

  if (required && matches.length === 0) {
    throw new PathError(`No JSON files found in ${dir}`, { dir });
  }

  return sortByDepthThenName(matches, dir);
}

module.exports = {
  readJsonFile,
  findJsonFiles,
  normalizeDirPath,
  scanDir
};
