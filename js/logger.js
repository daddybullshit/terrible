function createLogger() {
  const warnings = [];
  const errors = [];

  return {
    warnings,
    errors,
    warn: (msg) => {
      warnings.push(msg);
      console.warn(`Warning: ${msg}`);
    },
    error: (msg) => {
      errors.push(msg);
      console.error(`Error: ${msg}`);
    },
    summarizeAndExitIfNeeded: () => {
      if (warnings.length) {
        console.warn(`Warnings encountered (${warnings.length}). See messages above for details.`);
      }
      if (errors.length) {
        console.error(`Errors encountered (${errors.length}); build failed.`);
        process.exit(1);
      }
    }
  };
}

module.exports = { createLogger };
