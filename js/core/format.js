'use strict';

/**
 * Terminal formatting utilities.
 * Centralized color/style handling for consistent output.
 */

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m'
};

/**
 * Check if color output is enabled based on environment.
 * Respects NO_COLOR and FORCE_COLOR standards.
 */
function isColorEnabled() {
  if (process.env.NO_COLOR === '1') return false;
  if (process.env.FORCE_COLOR === '0') return false;
  return Boolean(process.stdout && process.stdout.isTTY);
}

const ENABLE_COLOR = isColorEnabled();

/**
 * Format text with a color/style.
 * @param {string} text - Text to format
 * @param {string} style - Style name (bold, dim, red, green, yellow, cyan, magenta)
 * @returns {string} Formatted text or original if color disabled
 */
function fmt(text, style) {
  if (!ENABLE_COLOR || !style || !colors[style]) return String(text);
  return `${colors[style]}${text}${colors.reset}`;
}

/**
 * Format a step label (bold).
 */
function step(label) {
  return fmt(label, 'bold');
}

/**
 * Format text as an error (red).
 */
function error(text) {
  return fmt(`Error: ${text}`, 'red');
}

/**
 * Format text as a warning (yellow).
 */
function warning(text) {
  return fmt(`Warning: ${text}`, 'yellow');
}

/**
 * Format text as success (green).
 */
function success(text) {
  return fmt(text, 'green');
}

/**
 * Format a path or secondary info (dim).
 */
function dim(text) {
  return fmt(text, 'dim');
}

module.exports = {
  colors,
  dim,
  ENABLE_COLOR,
  error,
  fmt,
  isColorEnabled,
  step,
  success,
  warning
};
