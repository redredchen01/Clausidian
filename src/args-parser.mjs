/**
 * Command-line argument parsing and normalization
 */

/**
 * Normalize kebab-case flags to camelCase.
 * Handles both boolean flags (--flag) and value flags (--flag value).
 * @param {Object} flags - Raw flags object from CLI
 * @returns {Object} Normalized flags with camelCase keys
 * @example
 * normalizeFlags({'dry-run': true, 'set-status': 'active'})
 * // => {dryRun: true, setStatus: 'active'}
 */
export function normalizeFlags(flags) {
  if (!flags || typeof flags !== 'object') return {};

  const normalized = {};
  for (const [key, value] of Object.entries(flags)) {
    // Convert kebab-case to camelCase
    const camelKey = key.replace(/-([a-z])/g, (match, letter) => letter.toUpperCase());

    // Handle boolean vs string values
    if (value === true || value === false) {
      normalized[camelKey] = value;
    } else if (typeof value === 'string') {
      // Try to parse as boolean string
      if (value === 'true') {
        normalized[camelKey] = true;
      } else if (value === 'false') {
        normalized[camelKey] = false;
      } else if (value === '') {
        // Empty string means it's a flag-only argument
        normalized[camelKey] = true;
      } else {
        normalized[camelKey] = value;
      }
    } else {
      normalized[camelKey] = value;
    }
  }

  return normalized;
}

/**
 * Parse array of command-line arguments into flags and positional args.
 * @param {Array<string>} args - Raw command-line arguments
 * @returns {Object} {flags: {}, positional: []}
 * @example
 * parseArgs(['--vault', '/path', '--dry-run', 'note-name'])
 * // => {flags: {vault: '/path', dryRun: true}, positional: ['note-name']}
 */
export function parseArgs(args) {
  const flags = {};
  const positional = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg.startsWith('--')) {
      // Long flag
      const key = arg.slice(2); // Remove '--'

      if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
        // Next arg is a value
        flags[key] = args[i + 1];
        i++; // Skip next arg
      } else {
        // Boolean flag
        flags[key] = true;
      }
    } else if (arg.startsWith('-') && arg.length === 2) {
      // Short flag (e.g., -v)
      const key = arg[1];
      if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
        flags[key] = args[i + 1];
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      // Positional argument
      positional.push(arg);
    }
  }

  return { flags: normalizeFlags(flags), positional };
}

/**
 * Validate that required flags are present.
 * @param {Object} flags - Normalized flags
 * @param {Array<string>} required - Required flag names
 * @throws {Error} If any required flag is missing
 */
export function validateRequiredFlags(flags, required = []) {
  const missing = required.filter(key => !(key in flags) || flags[key] === undefined);
  if (missing.length) {
    throw new Error(`Missing required flags: ${missing.map(k => `--${k}`).join(', ')}`);
  }
}

/**
 * Validate that flag values are within allowed set.
 * @param {Object} flags - Normalized flags
 * @param {string} flagName - Flag to validate
 * @param {Array<string>} allowed - Allowed values
 * @throws {Error} If flag value not in allowed set
 */
export function validateAllowedValues(flags, flagName, allowed = []) {
  if (!(flagName in flags)) return;

  const value = flags[flagName];
  if (!allowed.includes(value)) {
    throw new Error(
      `Invalid value for --${flagName}: "${value}"\n` +
      `Allowed: ${allowed.join(', ')}`
    );
  }
}
