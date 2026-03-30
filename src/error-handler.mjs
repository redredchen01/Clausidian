/**
 * Error Handler — centralized error classes for clausidian
 */

/**
 * NotFoundError — raised when a resource is not found
 */
export class NotFoundError extends Error {
  constructor(name, context = '') {
    const msg = context ? `${context} not found: ${name}` : `Not found: ${name}`;
    super(msg);
    this.name = 'NotFoundError';
    this.resourceName = name;
    this.context = context;
  }
}

/**
 * ValidationError — raised when input validation fails
 */
export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * VaultError — raised when vault operations fail
 */
export class VaultError extends Error {
  constructor(message) {
    super(message);
    this.name = 'VaultError';
  }
}

/**
 * Parse error context from thrown value.
 * Simplifies error handling in command handlers.
 * @param {any} err - Error value
 * @returns {{name: string, message: string, context: string}}
 */
export function parseError(err) {
  if (err instanceof NotFoundError) {
    return {
      name: 'NotFoundError',
      message: err.message,
      context: err.context,
    };
  }
  if (err instanceof ValidationError) {
    return {
      name: 'ValidationError',
      message: err.message,
      context: '',
    };
  }
  if (err instanceof VaultError) {
    return {
      name: 'VaultError',
      message: err.message,
      context: '',
    };
  }
  return {
    name: err.name || 'Error',
    message: err.message || String(err),
    context: '',
  };
}
