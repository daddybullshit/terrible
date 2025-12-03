const Ajv = require('ajv');
const { createIssueCollector } = require('./issue_collector');

// Format an Ajv error into a concise string.
function formatAjvError(err) {
  const path = err.instancePath || '/';
  const msg = err.message || 'schema validation failed';
  return `${path} ${msg}`.trim();
}

// Walk an object and report extra fields not declared in the provided schema (recursive).
function collectExtraFields(obj, schema, basePath = '') {
  if (!schema || typeof schema !== 'object' || obj === null || typeof obj !== 'object') {
    return [];
  }

  // Prefer the branch with the fewest extras when using anyOf/oneOf/allOf.
  const variants = schema.anyOf || schema.oneOf || schema.allOf;
  if (Array.isArray(variants) && variants.length > 0) {
    const results = variants.map(variant => collectExtraFields(obj, variant, basePath));
    results.sort((a, b) => a.length - b.length);
    return results[0] || [];
  }

  // Array handling: walk items against the item schema if present.
  if (Array.isArray(obj)) {
    const itemSchema = schema.items || {};
    return obj.flatMap((item, idx) => collectExtraFields(item, itemSchema, basePath ? `${basePath}.${idx}` : String(idx)));
  }

  const properties = schema.properties && typeof schema.properties === 'object' ? schema.properties : {};
  const extras = [];

  Object.entries(obj).forEach(([key, value]) => {
    const propSchema = properties[key];
    const path = basePath ? `${basePath}.${key}` : key;
    if (propSchema) {
      extras.push(...collectExtraFields(value, propSchema, path));
      return;
    }
    if (schema.additionalProperties === false) {
      // Ajv will handle as error; we do not double-report.
      return;
    }
    // If additionalProperties is an object schema, treat it as allowed.
    if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
      extras.push(...collectExtraFields(value, schema.additionalProperties, path));
      return;
    }
    // Otherwise this key is extra.
    extras.push(path);
  });
  return extras;
}

// Validate stack objects against embedded class schemas.
// - resolvedClasses: Map<string, object> with merged class definitions (including optional schema).
// - options: { warningsAsErrors: boolean, warnExtraFields: boolean, log }
function validateStack(stackObjects, resolvedClasses, options = {}) {
  const { warningsAsErrors = false, warnExtraFields = false, log } = options;
  const ajv = new Ajv({ allErrors: true, strict: false });
  const validators = new Map();
  const collector = options.issues || createIssueCollector({ log, warningsAsErrors });

  const getValidator = (className) => {
    if (validators.has(className)) {
      return validators.get(className);
    }
    const def = resolvedClasses.get(className);
    if (!def || !def.schema) {
      validators.set(className, null);
      return null;
    }
    try {
      const validate = ajv.compile(def.schema);
      validators.set(className, validate);
      return validate;
    } catch (err) {
      collector.error(`Invalid schema for class '${className}': ${err.message}`, {
        code: 'schema_invalid',
        class: className
      });
      validators.set(className, null);
      return null;
    }
  };

  const maybeWarnExtra = (obj, def) => {
    if (!warnExtraFields) {
      return;
    }
    if (!def || !def.schema || typeof def.schema !== 'object') {
      return;
    }
    const extras = collectExtraFields(obj, def.schema);
    if (!extras.length) {
      return;
    }
    const level = warningsAsErrors ? 'error' : 'warn';
    collector.add(level, `Extra fields for '${obj.id}' (class '${obj.class}'): ${extras.join(', ')}`, {
      code: 'extra_fields',
      class: obj.class,
      id: obj.id,
      extras
    });
  };

  stackObjects
    .filter(obj => obj && obj.class)
    .forEach(obj => {
      const validator = getValidator(obj.class);
      if (!validator) {
        return;
      }
      const ok = validator(obj);
      if (ok) {
        maybeWarnExtra(obj, resolvedClasses.get(obj.class));
        return;
      }
      const level = warningsAsErrors ? 'error' : 'warn';
      (validator.errors || []).forEach(err => {
      collector.add(level, `Schema validation ${level === 'error' ? 'failed' : 'warning'} for '${obj.id}' (class '${obj.class}'): ${formatAjvError(err)}`, {
        code: 'schema_validation',
        class: obj.class,
        id: obj.id,
          keyword: err.keyword,
          instancePath: err.instancePath
        });
      });
      maybeWarnExtra(obj, resolvedClasses.get(obj.class));
    });

  return { issues: collector.list(), hasErrors: collector.hasErrors() };
}

module.exports = { validateStack };
