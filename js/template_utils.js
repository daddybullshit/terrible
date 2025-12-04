const path = require('path');
const fs = require('fs');
const Handlebars = require('handlebars');
const { scanDir } = require('./fs_utils');
const { mapLikeToObject } = require('./object_utils');
const { globalsFromStack, metaFromOptions } = require('./template_resolution');
const { registerHelpers } = require('./template_helpers');

const handlebars = Handlebars.create();
const templateCache = new Map();

// Register every template as a partial, using the path (minus extension) as the name.
function registerPartials(templates) {
  Object.entries(templates).forEach(([templateKey, templateContent]) => {
    const normalized = templateKey.replace(/\\/g, '/');
    const ext = path.extname(normalized);
    const partialName = ext ? normalized.slice(0, -ext.length) : normalized;
    handlebars.registerPartial(partialName, templateContent);
  });
}

function readTemplatesFromDir(baseDir) {
  if (!fs.existsSync(baseDir)) {
    return {};
  }
  const files = scanDir(baseDir, { pattern: '**/*', absolute: true });
  return files.reduce((acc, filePath) => {
    const relKey = path.relative(baseDir, filePath).replace(/\\/g, '/');
    acc[relKey] = fs.readFileSync(filePath, 'utf8');
    return acc;
  }, {});
}

// Load templates from defaults and stack, warn on overrides, and return stats.
function loadTemplates(stackDir, defaultsDir, log) {
  const baseTemplatesDir = path.join(defaultsDir, 'templates');
  const stackTemplatesDir = path.join(stackDir, 'templates');

  const defaultsTemplates = readTemplatesFromDir(baseTemplatesDir);
  const stackTemplates = readTemplatesFromDir(stackTemplatesDir);
  const collisions = [];

  Object.keys(stackTemplates).forEach(key => {
    if (Object.prototype.hasOwnProperty.call(defaultsTemplates, key)) {
      collisions.push(key);
    }
  });

  if (collisions.length && log && log.warn) {
    collisions.sort((a, b) => a.localeCompare(b));
    collisions.forEach(key => {
      log.warn(`Template override: stack template '${key}' shadows defaults template of the same path.`);
    });
  }

  const templates = {
    ...defaultsTemplates,
    ...stackTemplates
  };

  registerPartials(templates);
  return {
    templates,
    stats: {
      defaultsCount: Object.keys(defaultsTemplates).length,
      stackCount: Object.keys(stackTemplates).length,
      overrideCount: collisions.length,
      totalCount: Object.keys(templates).length
    }
  };
}

// Compile a template with caching to avoid repeated compilation.
function compileTemplate(templateKey, templateContent, log) {
  if (templateCache.has(templateKey)) {
    return templateCache.get(templateKey);
  }

  try {
    const compiled = handlebars.compile(templateContent, { noEscape: true });
    templateCache.set(templateKey, compiled);
    return compiled;
  } catch (err) {
    log.error(`Failed to compile template '${templateKey}': ${err.message}`);
    throw err;
  }
}

// Render a template with canonical context and attach metadata for helpers.
function renderTemplate(templateKey, templateContent, obj, stackById, log, metaExtras = {}) {
  const compiled = compileTemplate(templateKey, templateContent, log);
  const globalObj = globalsFromStack(stackById) || {};
  const { canonical } = metaExtras;
  const context = {
    ...globalObj,
    ...obj,
    global: globalObj,
    stack: mapLikeToObject(stackById),
    objects: globalObj.objects,
    classes: globalObj.classes,
    canonical
  };

  const meta = {
    currentObj: obj,
    stackById,
    log,
    templateKey,
    ...metaExtras
  };

  return compiled(context, { data: { _terrible: meta } });
}

// Resolve an output path for a template, enforcing build-root safety.
function resolveOutputPath(templateKey, filename, buildDir, log) {
  const normalizedFilename = filename.replace(/\\/g, '/');
  const hasLeadingSlash = normalizedFilename.startsWith('/');
  const relativeFilename = hasLeadingSlash ? normalizedFilename.slice(1) : normalizedFilename;

  if (!relativeFilename) {
    log.error(`Output filename for '${templateKey}' is empty or root-only: ${filename}`);
    return null;
  }
  if (path.isAbsolute(relativeFilename)) {
    log.error(`Output filename for '${templateKey}' must be relative: ${filename}`);
    return null;
  }

  const segments = relativeFilename.split('/');
  if (segments.some(seg => seg === '..' || seg === '')) {
    log.error(`Output filename for '${templateKey}' may not contain '..' or empty segments: ${filename}`);
    return null;
  }

  const hasExplicitPath = hasLeadingSlash || segments.length > 1;
  let outDir = buildDir;
  if (hasExplicitPath) {
    const dirPart = path.dirname(relativeFilename);
    outDir = dirPart === '.' ? buildDir : path.join(buildDir, dirPart);
  } else {
    const normalizedKey = templateKey.replace(/\\/g, '/');
    const firstSegment = normalizedKey.includes('/') ? normalizedKey.split('/')[0] : null;
    if (firstSegment && firstSegment !== '.' && firstSegment !== '..') {
      outDir = path.join(buildDir, firstSegment);
    }
  }

  const outPath = path.join(outDir, path.basename(relativeFilename));
  const outRelative = path.relative(buildDir, outPath);
  if (outRelative.startsWith('..') || path.isAbsolute(outRelative)) {
    log.error(`Resolved output path escapes build directory for '${templateKey}': ${outPath}`);
    return null;
  }

  return outPath;
}

registerHelpers(handlebars, { metaFromOptions, resolveOutputPath });

module.exports = { loadTemplates, renderTemplate, resolveOutputPath };
