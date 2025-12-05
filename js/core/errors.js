'use strict';

/**
 * Structured error types for better debugging and error handling.
 * All errors include a code for programmatic handling.
 */

class TerribleError extends Error {
  constructor(message, code, context = {}) {
    super(message);
    this.name = 'TerribleError';
    this.code = code;
    this.context = context;
    Error.captureStackTrace?.(this, this.constructor);
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      context: this.context
    };
  }
}

class ConfigError extends TerribleError {
  constructor(message, context = {}) {
    super(message, 'CONFIG_ERROR', context);
    this.name = 'ConfigError';
  }
}

class PathError extends TerribleError {
  constructor(message, context = {}) {
    super(message, 'PATH_ERROR', context);
    this.name = 'PathError';
  }
}

class ParseError extends TerribleError {
  constructor(message, context = {}) {
    super(message, 'PARSE_ERROR', context);
    this.name = 'ParseError';
  }
}

class ValidationError extends TerribleError {
  constructor(message, context = {}) {
    super(message, 'VALIDATION_ERROR', context);
    this.name = 'ValidationError';
  }
}

class MergeError extends TerribleError {
  constructor(message, context = {}) {
    super(message, 'MERGE_ERROR', context);
    this.name = 'MergeError';
  }
}

class TemplateError extends TerribleError {
  constructor(message, context = {}) {
    super(message, 'TEMPLATE_ERROR', context);
    this.name = 'TemplateError';
  }
}

module.exports = {
  TerribleError,
  ConfigError,
  PathError,
  ParseError,
  ValidationError,
  MergeError,
  TemplateError
};
