const { TerribleError } = require('./core/errors');

/**
 * Lightweight issue collector that also logs immediately.
 * Supports both string messages and structured TerribleError instances.
 */
function createIssueCollector({ log, warningsAsErrors = false } = {}) {
  const issues = [];

  const add = (level, messageOrError, meta = {}) => {
    let entry;
    if (messageOrError instanceof TerribleError) {
      entry = {
        level,
        message: messageOrError.message,
        code: messageOrError.code,
        ...messageOrError.context,
        ...meta
      };
    } else {
      entry = { level, message: messageOrError, ...meta };
    }
    issues.push(entry);
    if (level === 'error') {
      (log && log.error ? log : console).error(entry.message);
    } else {
      (log && log.warn ? log : console).warn(entry.message);
    }
    return entry;
  };

  /**
   * Add multiple errors from an array of TerribleError or {message} objects.
   */
  const addAll = (level, errors) => {
    for (const err of errors) {
      add(level, err);
    }
  };

  return {
    add,
    addAll,
    warn: (message, meta) => add('warn', message, meta),
    error: (message, meta) => add('error', message, meta),
    list: () => issues,
    hasErrors: () => issues.some(issue => issue.level === 'error'),
    warnLevel: () => (warningsAsErrors ? 'error' : 'warn'),
    count: () => issues.length,
    errorCount: () => issues.filter(i => i.level === 'error').length,
    warnCount: () => issues.filter(i => i.level === 'warn').length
  };
}

module.exports = { createIssueCollector };
