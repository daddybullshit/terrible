const path = require('path');
const fs = require('fs');
const Handlebars = require('handlebars');
const { scanDir } = require('./utils');

const handlebars = Handlebars.create();
const templateCache = new Map();

function metaFromOptions(options) {
  return options && options.data && options.data._terrible
    ? options.data._terrible
    : { currentObj: {}, stackById: new Map(), log: console };
}

function registerPartials(templates) {
  Object.entries(templates).forEach(([templateKey, templateContent]) => {
    const normalized = templateKey.replace(/\\/g, '/');
    const ext = path.extname(normalized);
    const partialName = ext ? normalized.slice(0, -ext.length) : normalized;
    const converted = convertPlaceholders(templateContent);
    handlebars.registerPartial(partialName, converted);
  });
}

function readTemplatesFromDir(baseDir) {
  if (!fs.existsSync(baseDir)) {
    return {};
  }
  const files = scanDir(baseDir, true, true);
  return files.reduce((acc, filePath) => {
    const relKey = path.relative(baseDir, filePath).replace(/\\/g, '/');
    acc[relKey] = fs.readFileSync(filePath, 'utf8');
    return acc;
  }, {});
}

function loadTemplates(stackDir, defaultsDir) {
  const baseTemplatesDir = path.join(defaultsDir, 'templates');
  const stackTemplatesDir = path.join(stackDir, 'templates');

  const templates = {
    ...readTemplatesFromDir(baseTemplatesDir),
    ...readTemplatesFromDir(stackTemplatesDir)
  };

  registerPartials(templates);
  return templates;
}

function envValueForTag(tag) {
  if (process.env[tag] !== undefined) {
    return process.env[tag];
  }
  const upper = tag.toUpperCase();
  if (process.env[upper] !== undefined) {
    return process.env[upper];
  }
  return undefined;
}

function stackByIdAsObject(stackById) {
  if (!stackById) {
    return {};
  }
  if (stackById instanceof Map) {
    return Array.from(stackById.entries()).reduce((acc, [key, value]) => {
      acc[key] = value;
      return acc;
    }, {});
  }
  return stackById;
}

function globalsFromStack(stackById) {
  if (!stackById) {
    return undefined;
  }
  return stackById.get ? stackById.get('_globals') : stackById['_globals'];
}

function resolveTagValue(tag, defaultValue, obj, stackById, log, context) {
  const globalsObj = globalsFromStack(stackById);

  if (context && Object.prototype.hasOwnProperty.call(context, tag)) {
    return context[tag];
  }

  if (tag.includes('.') && stackById) {
    const [targetId, targetKey] = tag.split('.', 2);
    if (targetId && targetKey) {
      const targetObj = stackById.get ? stackById.get(targetId) : stackById[targetId];
      if (targetObj && Object.prototype.hasOwnProperty.call(targetObj, targetKey)) {
        return targetObj[targetKey];
      }
      if (defaultValue === undefined && log && log.warn) {
        if (!targetObj) {
          log.warn(`Template tag '{{${tag}}}' references unknown stack object '${targetId}'.`);
        } else {
          log.warn(`Template tag '{{${tag}}}' references missing key '${targetKey}' on stack object '${targetId}'.`);
        }
      }
    }
  }

  if (obj && Object.prototype.hasOwnProperty.call(obj, tag)) {
    return obj[tag];
  }
  if (globalsObj && Object.prototype.hasOwnProperty.call(globalsObj, tag)) {
    return globalsObj[tag];
  }

  const envValue = envValueForTag(tag);
  if (envValue !== undefined) {
    return envValue;
  }

  if (defaultValue !== undefined) {
    return defaultValue;
  }

  const id = obj && obj.id ? obj.id : 'unknown';
  if (log && log.warn) {
    log.warn(`Template tag '{{${tag}}}' has no value in ${id}.`);
  }
  return `{{${tag}}}`;
}

function escapeDefaultValue(raw) {
  return raw.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function convertPlaceholders(template) {
  const pattern = /({{{?)\s*(?![#/>\^!])([\w.]+)(?:\|(.*?))?\s*(}}}?)/g;
  const reserved = new Set(['else', 'this']);
  return template.replace(pattern, (match, open, tag, defaultValue, close) => {
    if (reserved.has(tag)) {
      return match;
    }
    const trimmedDefault = defaultValue === undefined ? undefined : defaultValue.trim();
    const defaultArg = trimmedDefault !== undefined ? ` "${escapeDefaultValue(trimmedDefault)}"` : '';
    return `${open}resolve "${tag}"${defaultArg}${close}`;
  });
}

function compileTemplate(templateKey, templateContent, log) {
  if (templateCache.has(templateKey)) {
    return templateCache.get(templateKey);
  }

  const converted = convertPlaceholders(templateContent);
  try {
    const compiled = handlebars.compile(converted, { noEscape: true });
    templateCache.set(templateKey, compiled);
    return compiled;
  } catch (err) {
    log.error(`Failed to compile template '${templateKey}': ${err.message}`);
    throw err;
  }
}

handlebars.registerHelper('resolve', function resolveHelper(tag, defaultValue, options) {
  let opts = options;
  let def = defaultValue;
  if (arguments.length === 2) {
    opts = defaultValue;
    def = undefined;
  }
  const meta = metaFromOptions(opts);
  return resolveTagValue(String(tag), def, meta.currentObj, meta.stackById, meta.log, this);
});

handlebars.registerHelper('json', function jsonHelper(value) {
  try {
    return JSON.stringify(value, null, 4);
  } catch (_err) {
    return '';
  }
});

handlebars.registerHelper('concat', function concatHelper() {
  const args = Array.from(arguments);
  const options = args.pop();
  return args.map(arg => (arg === null || arg === undefined ? '' : String(arg))).join('');
});

handlebars.registerHelper('default', function defaultHelper(value, defaultValue) {
  return value === null || value === undefined ? defaultValue : value;
});

function getByPath(obj, pathStr) {
  if (!obj || typeof pathStr !== 'string') {
    return undefined;
  }
  return pathStr.split('.').reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), obj);
}

handlebars.registerHelper('sortBy', function sortByHelper(list, pathStr) {
  const arr = Array.isArray(list) ? [...list] : [];
  if (!pathStr) {
    return arr;
  }
  return arr.sort((a, b) => {
    const av = getByPath(a, pathStr);
    const bv = getByPath(b, pathStr);
    if (av === undefined && bv === undefined) return 0;
    if (av === undefined) return 1;
    if (bv === undefined) return -1;
    return String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: 'base' });
  });
});

handlebars.registerHelper('groupBy', function groupByHelper(list, pathStr) {
  const arr = Array.isArray(list) ? list : [];
  const groups = new Map();
  arr.forEach(item => {
    const key = pathStr ? getByPath(item, pathStr) : undefined;
    const groupKey = key === undefined ? 'undefined' : String(key);
    if (!groups.has(groupKey)) {
      groups.set(groupKey, []);
    }
    groups.get(groupKey).push(item);
  });
  return Array.from(groups.entries()).map(([key, items]) => ({ key, items }));
});

function classInheritsFrom(className, targetName, classesObj) {
  if (!className || !targetName || !classesObj) {
    return false;
  }
  let current = className;
  const seen = new Set();
  while (current && !seen.has(current)) {
    if (current === targetName) {
      return true;
    }
    seen.add(current);
    const def = classesObj[current];
    current = def && typeof def === 'object' ? def.parent : undefined;
  }
  return false;
}

handlebars.registerHelper('inherits', function inheritsHelper(className, targetName, classesObj) {
  return classInheritsFrom(className, targetName, classesObj);
});

handlebars.registerHelper('eq', function eqHelper(a, b) {
  return a === b;
});

handlebars.registerHelper('and', function andHelper() {
  const args = Array.from(arguments);
  args.pop(); // options
  return args.every(Boolean);
});

handlebars.registerHelper('includes', function includesHelper(list, value) {
  return Array.isArray(list) && list.includes(value);
});

handlebars.registerHelper('identity', function identityHelper(value) {
  return value;
});

handlebars.registerHelper('difficultyCount', function difficultyCount(entries, level, classesObj) {
  const list = Array.isArray(entries) ? entries : [];
  return list.filter(entry => classInheritsFrom(entry.class, 'recipe', classesObj) && entry.properties && entry.properties.difficulty === level).length;
});

function filterEntriesByInheritance(entries, targetName, classesObj) {
  const list = Array.isArray(entries) ? entries : [];
  return list.filter(entry => classInheritsFrom(entry.class, targetName, classesObj));
}

handlebars.registerHelper('filterInherits', function filterInheritsHelper(entries, targetName, classesObj) {
  return filterEntriesByInheritance(entries, targetName, classesObj);
});

handlebars.registerHelper('length', function lengthHelper(value) {
  if (Array.isArray(value)) {
    return value.length;
  }
  if (value && typeof value === 'object') {
    return Object.keys(value).length;
  }
  return 0;
});

handlebars.registerHelper('array', function arrayHelper() {
  const args = Array.from(arguments);
  args.pop(); // remove options
  return args;
});

handlebars.registerHelper('file', function fileHelper(filename, options) {
  const meta = metaFromOptions(options);
  const { outputs, buildDir, log, templateKey } = meta;
  if (!outputs || !buildDir) {
    (log && log.warn ? log : console).warn('file helper called without buildDir/outputs; skipping');
    return '';
  }
  const name = filename === null || filename === undefined ? '' : String(filename);
  const resolved = resolveOutputPath(templateKey || 'unknown', name, buildDir, log);
  if (!resolved) {
    return '';
  }
  const data = Handlebars.createFrame(options.data || {});
  Object.assign(data, options.hash || {});
  const context = options.hash ? { ...this, ...options.hash } : this;
  const content = options.fn(context, { data }) || '';
  outputs.push({ path: resolved, content });
  return '';
});

function renderTemplate(templateKey, templateContent, obj, stackById, log, metaExtras = {}) {
  const compiled = compileTemplate(templateKey, templateContent, log);
  const globalsObj = globalsFromStack(stackById) || {};
  const context = {
    ...globalsObj,
    ...obj,
    _globals: globalsObj,
    stack: stackByIdAsObject(stackById)
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

module.exports = { loadTemplates, renderTemplate, resolveOutputPath };
