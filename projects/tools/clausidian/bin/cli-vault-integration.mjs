#!/usr/bin/env node

/**
 * Vault-aware CLI integration template
 * Shows how to integrate VaultRegistry + VaultResolver into cli.mjs
 *
 * Changes needed in bin/cli.mjs:
 * 1. Import VaultRegistry and VaultResolver
 * 2. Replace resolveVault() with vault-aware version
 * 3. Attach vault context to command results
 */

import { VaultRegistry } from '../src/vault-registry.mjs';
import { resolveVault } from '../src/vault-resolver.mjs';

/**
 * Enhanced resolveVault() for CLI
 * Applies precedence: --vault flag > OA_VAULT > registry default > error/fallback
 *
 * @param {Object} flags - Parsed CLI flags
 * @returns {Promise<{vaultPath: string, vaultName: string, source: string}>}
 */
async function resolveVaultContext(flags) {
  const registry = new VaultRegistry();
  try {
    await registry.load();
  } catch (err) {
    // E1: Registry corruption - fallback to OA_VAULT
    console.warn(`Warning: Failed to load vault registry: ${err.message}`);
    console.warn('Falling back to OA_VAULT environment variable...');
  }

  return resolveVault({
    vaultName: flags.vault,        // From --vault flag
    registry,
    fallbackPath: process.cwd(),
  });
}

/**
 * Attach vault context to command results
 * Ensures JSON output includes "vault" field for agent consumption
 *
 * @param {Object} result - Command result
 * @param {string} vaultName - Resolved vault name
 * @returns {Object} - Result with vault field attached
 */
function attachVaultContext(result, vaultName) {
  if (!result || typeof result !== 'object') {
    return result;
  }

  // Attach vault field if result is JSON-like
  return {
    ...result,
    vault: vaultName,
  };
}

/**
 * Modified main() flow for CLI integration:
 *
 * Before:
 *   result = await cmd.run(resolveVault(flags), flags, positional);
 *
 * After:
 *   const vaultCtx = await resolveVaultContext(flags);
 *   result = await cmd.run(vaultCtx.vaultPath, {
 *     ...flags,
 *     _vault: { name: vaultCtx.vaultName, source: vaultCtx.source }
 *   }, positional);
 *   result = attachVaultContext(result, vaultCtx.vaultName);
 */

// Example integration for bin/cli.mjs:
export async function integrateVaultAwareCLI(cmd, flags, positional) {
  try {
    const vaultCtx = await resolveVaultContext(flags);

    // Pass vault context to command via flags._vault
    const enhancedFlags = {
      ...flags,
      _vault: {
        name: vaultCtx.vaultName,
        source: vaultCtx.source,
      },
    };

    let result;
    if (cmd.subcommands) {
      const subcommandName = positional[0];
      const subcommand = cmd.subcommands[subcommandName];
      if (!subcommand) {
        throw new Error(`Unknown subcommand: ${subcommandName}`);
      }
      positional.shift();
      result = await subcommand.run(vaultCtx.vaultPath, enhancedFlags, positional);
    } else if (cmd.run) {
      result = await cmd.run(vaultCtx.vaultPath, enhancedFlags, positional);
    } else {
      throw new Error(`Command has no run function or subcommands`);
    }

    // Attach vault context to result for agents
    return attachVaultContext(result, vaultCtx.vaultName);
  } catch (err) {
    // Provide helpful error messages
    if (err.message.includes('No vault selected')) {
      console.error('Error: No vault selected');
      console.error('');
      console.error('To select a vault, use one of:');
      console.error('  1. Flag:    clausidian --vault=team-kb search keyword');
      console.error('  2. Env:     OA_VAULT=/path/to/vault clausidian search keyword');
      console.error('  3. Default: clausidian vault default team-kb');
      console.error('');
      console.error('To list vaults: clausidian vault list');
      process.exit(1);
    } else if (err.message.includes('Vault not found')) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    } else {
      throw err;
    }
  }
}
