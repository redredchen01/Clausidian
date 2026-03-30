/**
 * Vault root path validation and discovery
 */
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Validate that a directory is a valid Clausidian vault.
 * @param {string} path - Directory path to validate
 * @returns {string} Resolved absolute path
 * @throws {Error} If path is not a valid vault
 */
export function validateVaultRoot(path) {
  const resolved = resolve(path);

  if (!existsSync(resolved)) {
    throw new Error(`Vault not found: ${resolved} — directory does not exist`);
  }

  // Check for vault markers
  const hasClausidianConfig = existsSync(`${resolved}/.clausidian.json`);
  const hasIndexFile = existsSync(`${resolved}/_index.md`);
  const hasAreasDir = existsSync(`${resolved}/areas`);

  if (!hasClausidianConfig && !hasIndexFile && !hasAreasDir) {
    throw new Error(
      `Invalid vault: ${resolved}\n` +
      `Expected one of: .clausidian.json, _index.md, or areas/ directory`
    );
  }

  return resolved;
}

/**
 * Get vault root from argument, environment variable, or current directory.
 * @param {string|null} fromArg - Vault path from CLI argument
 * @param {string} [envVar='OA_VAULT'] - Environment variable to check
 * @returns {string} Resolved vault path
 * @throws {Error} If vault not found in any location
 */
export function getVaultRoot(fromArg, envVar = 'OA_VAULT') {
  // Try argument first
  if (fromArg) {
    try {
      return validateVaultRoot(fromArg);
    } catch (e) {
      throw new Error(`Invalid vault argument: ${e.message}`);
    }
  }

  // Try environment variable
  const envPath = process.env[envVar];
  if (envPath) {
    try {
      return validateVaultRoot(envPath);
    } catch (e) {
      throw new Error(
        `Invalid vault from ${envVar}=${envPath}: ${e.message}`
      );
    }
  }

  // Try current directory
  try {
    return validateVaultRoot(process.cwd());
  } catch {
    throw new Error(
      `Vault not found. Please:\n` +
      `  1. Set ${envVar} environment variable: export ${envVar}=/path/to/vault\n` +
      `  2. Pass vault path as argument: --vault /path/to/vault\n` +
      `  3. Run command from vault directory`
    );
  }
}
