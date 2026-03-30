/**
 * Obsidian 1.12 CLI bridge — detect and proxy to official CLI when available.
 *
 * The official CLI requires Obsidian.app running (IPC communication).
 * clausidian works headless. This bridge lets them coexist:
 * - Commands the official CLI handles better → proxy to it
 * - Commands unique to clausidian → keep native
 * - Fallback to native if official CLI unavailable or fails
 */

import { execFileSync } from 'node:child_process';

// Cache detection result for the process lifetime
let _detected = undefined;

/**
 * Check if the official Obsidian CLI is available and responsive.
 * Returns { available: boolean, version?: string, path?: string }
 */
export function detectOfficialCli() {
  if (_detected !== undefined) return _detected;

  // Respect explicit opt-out
  if (process.env.OA_NO_OFFICIAL_CLI === '1') {
    _detected = { available: false, reason: 'disabled via OA_NO_OFFICIAL_CLI' };
    return _detected;
  }

  try {
    const out = execFileSync('obsidian', ['version'], {
      timeout: 3000,
      stdio: ['pipe', 'pipe', 'pipe'],
      encoding: 'utf8',
    }).trim();
    const path = execFileSync('which', ['obsidian'], {
      timeout: 1000,
      stdio: ['pipe', 'pipe', 'pipe'],
      encoding: 'utf8',
    }).trim();
    _detected = { available: true, version: out, path };
  } catch {
    _detected = { available: false, reason: 'obsidian CLI not found or not responsive' };
  }
  return _detected;
}

/**
 * Command mapping: clausidian command → official CLI command + arg transform.
 * Only commands where the official CLI provides equal or better functionality.
 */
const BRIDGE_MAP = {
  // File operations
  read:       { cmd: 'read',      transform: (pos, flags) => buildArgs('read', pos, flags, { file: pos[0] }) },
  delete:     { cmd: 'delete',    transform: (pos, flags) => buildArgs('delete', pos, flags, { file: pos[0] }) },
  open:       { cmd: 'open',      transform: (pos, flags) => buildArgs('open', pos, flags, { file: pos[0] }) },

  // Search
  search:     { cmd: 'search',    transform: (pos, flags) => buildArgs('search', pos, flags, { query: pos.join(' ') }) },

  // Daily notes
  journal:    { cmd: 'daily',     transform: (pos, flags) => buildArgs('daily', pos, flags) },

  // Links
  backlinks:  { cmd: 'backlinks', transform: (pos, flags) => buildArgs('backlinks', pos, flags, { file: pos[0] }) },
  orphans:    { cmd: 'orphans',   transform: (pos, flags) => buildArgs('orphans', pos, flags) },

  // Tags
  tag_list:   { cmd: 'tags',      transform: (pos, flags) => buildArgs('tags', pos, flags) },

  // Random
  random:     { cmd: 'random:read', transform: (pos, flags) => buildArgs('random:read', pos, flags) },
};

// Commands that should NEVER be bridged (clausidian unique features)
const NEVER_BRIDGE = new Set([
  'init', 'serve', 'setup', 'help',
  'sync', 'health', 'graph', 'review',
  'capture', 'note', 'archive', 'hook', 'watch',
  'suggest', 'focus', 'neighbors', 'timeline',
  'validate', 'changelog', 'agenda', 'count',
  'stats', 'export', 'import', 'merge', 'link',
  'relink', 'pin', 'unpin', 'batch',
  'quicknote', 'launchd', 'daily',
  'duplicates', 'broken-links', 'recent',
  'rename', 'move', 'update', 'patch', 'tag',
  'list',
]);

function buildArgs(cmd, pos, flags, params = {}) {
  const result = [cmd];
  // Add vault= if specified
  if (flags.vault) result.push(`vault=${flags.vault}`);
  // Add mapped params
  for (const [k, v] of Object.entries(params)) {
    if (v) result.push(`${k}=${v}`);
  }
  return result;
}

/**
 * Try to execute a command via the official Obsidian CLI.
 * Returns { bridged: true, result: string } on success,
 *         { bridged: false, reason: string } on failure/skip.
 */
export function tryBridge(command, positional, flags) {
  // Never bridge these
  if (NEVER_BRIDGE.has(command)) {
    return { bridged: false, reason: 'command is clausidian native only' };
  }

  const mapping = BRIDGE_MAP[command];
  if (!mapping) {
    return { bridged: false, reason: 'no bridge mapping for this command' };
  }

  const cli = detectOfficialCli();
  if (!cli.available) {
    return { bridged: false, reason: cli.reason };
  }

  try {
    const cliArgs = mapping.transform(positional, flags);
    const output = execFileSync('obsidian', cliArgs, {
      timeout: 10000,
      stdio: ['pipe', 'pipe', 'pipe'],
      encoding: 'utf8',
    });
    return { bridged: true, result: output.trim(), via: 'obsidian-cli' };
  } catch (err) {
    return { bridged: false, reason: `official CLI failed: ${err.message}` };
  }
}

/**
 * Get bridge status info for diagnostics.
 */
export function bridgeStatus() {
  const cli = detectOfficialCli();
  return {
    officialCli: cli,
    bridgeableCommands: Object.keys(BRIDGE_MAP),
    nativeOnlyCommands: [...NEVER_BRIDGE],
    envOverride: process.env.OA_NO_OFFICIAL_CLI === '1' ? 'disabled' : 'auto',
  };
}
