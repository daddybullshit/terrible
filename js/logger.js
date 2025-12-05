// Simple logger that records warnings/errors and emits a summary at exit.
function createLogger(options = {}) {
  const { quiet = false } = options;
  const warnings = [];
  const errors = [];
  const colors = {
    reset: '\x1b[0m',
    yellow: '\x1b[33m',
    red: '\x1b[31m'
  };
  const ENABLE_COLOR = process.stdout && process.stdout.isTTY && process.env.NO_COLOR !== '1' && process.env.FORCE_COLOR !== '0';
  const fmt = (text, color) => {
    if (!ENABLE_COLOR || !colors[color]) return text;
    return `${colors[color]}${text}${colors.reset}`;
  };

  return {
    warnings,
    errors,
    info: (msg) => {
      if (!quiet) {
        console.log(msg);
      }
    },
    warn: (msg) => {
      warnings.push(msg);
      if (!quiet) {
        console.warn(fmt(`Warning: ${msg}`, 'yellow'));
      }
    },
    error: (msg) => {
      errors.push(msg);
      console.error(fmt(`Error: ${msg}`, 'red'));
    },
    summarizeAndExitIfNeeded: () => {
      if (warnings.length && !quiet) {
        console.warn(fmt(`Warnings encountered (${warnings.length}). See messages above for details.`, 'yellow'));
      } else if (warnings.length && quiet) {
        console.warn(fmt(`Warnings encountered (${warnings.length}). Re-run without --quiet to view.`, 'yellow'));
      }
      if (errors.length) {
        console.error(fmt(`Errors encountered (${errors.length}); build failed.`, 'red'));
        process.exit(1);
      }
    }
  };
}

module.exports = { createLogger };
