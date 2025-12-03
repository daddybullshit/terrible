// Lightweight issue collector that also logs immediately.
function createIssueCollector({ log, warningsAsErrors = false } = {}) {
  const issues = [];

  const add = (level, message, meta = {}) => {
    const entry = { level, message, ...meta };
    issues.push(entry);
    if (level === 'error') {
      (log && log.error ? log : console).error(message);
    } else {
      (log && log.warn ? log : console).warn(message);
    }
    return entry;
  };

  return {
    add,
    warn: (message, meta) => add('warn', message, meta),
    error: (message, meta) => add('error', message, meta),
    list: () => issues,
    hasErrors: () => issues.some(issue => issue.level === 'error'),
    warnLevel: () => (warningsAsErrors ? 'error' : 'warn')
  };
}

module.exports = { createIssueCollector };
