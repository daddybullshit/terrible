const {
  classInheritsFrom,
  mergedSchemaFor,
  schemaRequires,
  schemaHasProp,
  schemaProperties,
  schemaPropertySource,
  classLineage,
  requiredFieldsBySource,
  entriesFrom,
  filterEntriesByInheritance,
  filterList,
  getByPath,
  metaFromOptions,
  resolveTagValue,
  targetIncludes,
  toArray
} = require('./template_resolution');

// Register all built-in Handlebars helpers used by the renderer.
function registerHelpers(handlebars, { metaFromOptions: metaFn = metaFromOptions, resolveOutputPath } = {}) {
  if (!handlebars) {
    throw new Error('Handlebars instance is required to register helpers.');
  }
  if (!resolveOutputPath) {
    throw new Error('resolveOutputPath is required to register template helpers.');
  }

  const metaFromOpts = metaFn || metaFromOptions;

  handlebars.registerHelper('resolve', function resolveHelper(tag, defaultValue, options) {
    let opts = options;
    let def = defaultValue;
    if (arguments.length === 2) {
      opts = defaultValue;
      def = undefined;
    }
    const meta = metaFromOpts(opts);
    return resolveTagValue(String(tag), def, meta.currentObj, meta.instancesById, meta.log, this);
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

  handlebars.registerHelper('sort_by', function sortByHelper(list, pathStr) {
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

  handlebars.registerHelper('inherits', function inheritsHelper(className, targetName, classesObj) {
    return classInheritsFrom(className, targetName, classesObj);
  });

  function resolveInheritsTargets(args) {
    const items = Array.from(args);
    const options = items.pop();
    const possibleClasses = items.pop();
    const targets = items.slice(1); // skip className
    const classesObj = possibleClasses && typeof possibleClasses === 'object' && !Array.isArray(possibleClasses)
      ? possibleClasses
      : options.hash && options.hash.classes;
    return { targets, classesObj, options };
  }

  handlebars.registerHelper('inherits_any', function inheritsAnyHelper(className) {
    const { targets, classesObj } = resolveInheritsTargets(arguments);
    if (!className || !targets.length) {
      return false;
    }
    return targets.some(target => classInheritsFrom(className, target, classesObj));
  });

  handlebars.registerHelper('inherits_all', function inheritsAllHelper(className) {
    const { targets, classesObj } = resolveInheritsTargets(arguments);
    if (!className || !targets.length) {
      return false;
    }
    return targets.every(target => classInheritsFrom(className, target, classesObj));
  });

  // Legacy beta helpers kept for compatibility.
  handlebars.registerHelper('beta_inherits_any', function betaInheritsAnyHelper(className) {
    const args = Array.from(arguments);
    const options = args.pop();
    const possibleClasses = args.pop();
    const targets = args.slice(1); // skip className
    const classesObj = possibleClasses && typeof possibleClasses === 'object' && !Array.isArray(possibleClasses)
      ? possibleClasses
      : options.hash && options.hash.classes;
    if (!className || !targets.length) {
      return false;
    }
    return targets.some(target => classInheritsFrom(className, target, classesObj));
  });

  handlebars.registerHelper('beta_inherits_all', function betaInheritsAllHelper(className) {
    const args = Array.from(arguments);
    const options = args.pop();
    const possibleClasses = args.pop();
    const targets = args.slice(1); // skip className
    const classesObj = possibleClasses && typeof possibleClasses === 'object' && !Array.isArray(possibleClasses)
      ? possibleClasses
      : options.hash && options.hash.classes;
    if (!className || !targets.length) {
      return false;
    }
    return targets.every(target => classInheritsFrom(className, target, classesObj));
  });

  handlebars.registerHelper('beta_filter_inherits', function betaFilterInheritsHelper(entries, targetName, classesObj) {
    return filterEntriesByInheritance(entries, targetName, classesObj);
  });

  handlebars.registerHelper('eq', function eqHelper(a, b) {
    return a === b;
  });

  handlebars.registerHelper('and', function andHelper() {
    const args = Array.from(arguments);
    args.pop(); // options
    return args.every(Boolean);
  });

  handlebars.registerHelper('or', function orHelper() {
    const args = Array.from(arguments);
    args.pop(); // options
    return args.some(Boolean);
  });

  handlebars.registerHelper('partial_exists', function partialExistsHelper(name) {
    if (!name) {
      return false;
    }
    const key = String(name);
    const partials = handlebars.partials || {};
    return Boolean(partials[key]);
  });

  handlebars.registerHelper('includes_any', function includesAnyHelper(list) {
    const arr = Array.isArray(list) ? list : [];
    const needles = Array.prototype.slice.call(arguments, 1, -1);
    if (!needles.length) {
      return false;
    }
    return needles.some(needle => arr.includes(needle));
  });

  handlebars.registerHelper('includes_all', function includesAllHelper(list) {
    const arr = Array.isArray(list) ? list : [];
    const needles = Array.prototype.slice.call(arguments, 1, -1);
    if (!needles.length) {
      return false;
    }
    return needles.every(needle => arr.includes(needle));
  });

  handlebars.registerHelper('identity', function identityHelper(value) {
    return value;
  });

  handlebars.registerHelper('values', function valuesHelper(listLike) {
    return entriesFrom(listLike);
  });

  handlebars.registerHelper('group_by', function groupByHelper(listLike, pathStr) {
    const list = entriesFrom(listLike);
    if (!pathStr) {
      return [];
    }
    const groups = new Map();
    list.forEach(entry => {
      const raw = getByPath(entry, pathStr);
      const values = Array.isArray(raw) ? raw : [raw];
      values.forEach(val => {
        if (val === undefined || val === null) {
          return;
        }
        const key = String(val);
        if (!groups.has(key)) {
          groups.set(key, []);
        }
        groups.get(key).push(entry);
      });
    });
    return Array.from(groups.entries())
      .sort(([a], [b]) => String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' }))
      .map(([key, items]) => ({ key, items }));
  });

  handlebars.registerHelper('filter_inherits', function filterInheritsHelper(entries, targetName, classesObj) {
    return filterEntriesByInheritance(entries, targetName, classesObj);
  });

  // Schema-aware helpers (inheritance-aware).
  handlebars.registerHelper('schema_required', function schemaRequiredHelper(className, prop, classesObj) {
    const classes = classesObj || (this && this.classes) || (this && this.global && this.global.classes);
    return schemaRequires(className, prop, classes);
  });

  handlebars.registerHelper('schema_has', function schemaHasHelper(className, prop, classesObj) {
    const classes = classesObj || (this && this.classes) || (this && this.global && this.global.classes);
    return schemaHasProp(className, prop, classes);
  });

  handlebars.registerHelper('schema_props', function schemaPropsHelper(className, classesObj) {
    const classes = classesObj || (this && this.classes) || (this && this.global && this.global.classes);
    return schemaProperties(className, classes);
  });

  handlebars.registerHelper('schema_prop_source', function schemaPropSourceHelper(className, prop, classesObj) {
    const classes = classesObj || (this && this.classes) || (this && this.global && this.global.classes);
    return schemaPropertySource(className, prop, classes) || '';
  });

  handlebars.registerHelper('class_lineage', function classLineageHelper(className, classesObj) {
    const classes = classesObj || (this && this.classes) || (this && this.global && this.global.classes);
    return classLineage(className, classes);
  });

  handlebars.registerHelper('schema_required_by_source', function schemaRequiredBySourceHelper(className, classesObj) {
    const classes = classesObj || (this && this.classes) || (this && this.global && this.global.classes);
    return requiredFieldsBySource(className, classes);
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

  handlebars.registerHelper('default_list', function defaultListHelper(value) {
    return Array.isArray(value) ? value : value && typeof value === 'object' ? toArray(value) : [];
  });

  handlebars.registerHelper('compact', function compactHelper(listLike) {
    return toArray(listLike).filter(Boolean);
  });

  handlebars.registerHelper('reverse', function reverseHelper(listLike) {
    return toArray(listLike).slice().reverse();
  });

  handlebars.registerHelper('uniq', function uniqHelper(listLike) {
    const seen = new Set();
    return toArray(listLike).filter(item => {
      const key = typeof item === 'object' ? JSON.stringify(item) : item;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  });

  handlebars.registerHelper('slugify', function slugifyHelper(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  });

  handlebars.registerHelper('title_case', function titleCaseHelper(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .toLowerCase()
      .replace(/(^|\s|[_-])(\w)/g, (_m, sep, ch) => `${sep ? ' ' : ''}${ch.toUpperCase()}`)
      .trim();
  });

  handlebars.registerHelper('where', function whereHelper(list, pathStr, value) {
    if (arguments.length < 3) {
      return filterList(list, item => Boolean(item));
    }
    return filterList(list, item => getByPath(item, pathStr) === value);
  });

  handlebars.registerHelper('where_includes', function whereIncludesHelper(list, pathStr, needle) {
    return filterList(list, item => {
      const target = pathStr ? getByPath(item, pathStr) : item;
      return targetIncludes(target, needle);
    });
  });

  handlebars.registerHelper('where_includes_any', function whereIncludesAnyHelper(list, pathStr) {
    const needles = Array.prototype.slice.call(arguments, 2, -1);
    return filterList(list, item => {
      const target = pathStr ? getByPath(item, pathStr) : item;
      return needles.some(needle => targetIncludes(target, needle));
    });
  });

  handlebars.registerHelper('where_includes_all', function whereIncludesAllHelper(list, pathStr) {
    const needles = Array.prototype.slice.call(arguments, 2, -1);
    return filterList(list, item => {
      const target = pathStr ? getByPath(item, pathStr) : item;
      return needles.every(needle => targetIncludes(target, needle));
    });
  });

  handlebars.registerHelper('array', function arrayHelper() {
    const args = Array.from(arguments);
    args.pop(); // remove options
    return args;
  });

  handlebars.registerHelper('file', function fileHelper(filename, options) {
    const meta = metaFromOpts(options);
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
    const data = handlebars.createFrame(options.data || {});
    Object.assign(data, options.hash || {});
    const context = options.hash ? { ...this, ...options.hash } : this;
    const content = options.fn(context, { data }) || '';
    outputs.push({ path: resolved, content });
    return '';
  });
}

module.exports = {
  registerHelpers
};
