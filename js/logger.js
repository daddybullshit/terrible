const { fmt, error: fmtError, warning: fmtWarning } = require('./core/format');

/**
 * Simple logger that records warnings/errors and emits a summary.
 * Does NOT call process.exit() - returns status for caller to handle.
 * 
 * Options:
 * - quiet: suppress info messages (warnings/errors still shown)
 * - silent: suppress ALL output including summaries (for tests)
 */
function createLogger(options = {}) {
  const { quiet = false, silent = false } = options;
  const warnings = [];
  const errors = [];

  return {
    warnings,
    errors,
    info: (msg) => {
      if (!quiet && !silent) {
        console.log(msg);
      }
    },
    warn: (msg) => {
      warnings.push(msg);
      if (!quiet && !silent) {
        console.warn(fmtWarning(msg));
      }
    },
    error: (msg) => {
      errors.push(msg);
      if (!silent) {
        console.error(fmtError(msg));
      }
    },
    /**
     * Summarize warnings/errors and return whether build should fail.
     * Caller is responsible for process.exit() if needed.
     * @returns {{ shouldExit: boolean, exitCode: number }}
     */
    summarize: () => {
      if (!silent) {
        if (warnings.length && !quiet) {
          console.warn(fmt(`Warnings encountered (${warnings.length}). See messages above for details.`, 'yellow'));
        } else if (warnings.length && quiet) {
          console.warn(fmt(`Warnings encountered (${warnings.length}). Re-run without --quiet to view.`, 'yellow'));
        }
        if (errors.length) {
          console.error(fmt(`Errors encountered (${errors.length}); build failed.`, 'red'));
        }
      }
      if (errors.length) {
        return { shouldExit: true, exitCode: 1 };
      }
      return { shouldExit: false, exitCode: 0 };
    },
    /**
     * @deprecated Use summarize() and handle exit in caller
     */
    summarizeAndExitIfNeeded: () => {
      if (!silent) {
        if (warnings.length && !quiet) {
          console.warn(fmt(`Warnings encountered (${warnings.length}). See messages above for details.`, 'yellow'));
        } else if (warnings.length && quiet) {
          console.warn(fmt(`Warnings encountered (${warnings.length}). Re-run without --quiet to view.`, 'yellow'));
        }
        if (errors.length) {
          console.error(fmt(`Errors encountered (${errors.length}); build failed.`, 'red'));
        }
      }
      if (errors.length) {
        process.exit(1);
      }
    },
    hasErrors: () => errors.length > 0,
    hasWarnings: () => warnings.length > 0
  };
}

module.exports = { createLogger };
