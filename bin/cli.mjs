#!/usr/bin/env node

/**
 * clausidian CLI — AI agent toolkit for Obsidian vaults
 * v2.6.0 — registry-based dispatch, MCP server, 55+ commands
 */

import { getCommand, getCommandNames } from '../src/registry.mjs';

const args = process.argv.slice(2);
const command = args[0];

function levenshtein(a, b) {
  if (!a || !b) return Math.max((a || '').length, (b || '').length);
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i]);
  for (let j = 1; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = Math.min(dp[i-1][j] + 1, dp[i][j-1] + 1, dp[i-1][j-1] + (a[i-1] !== b[j-1] ? 1 : 0));
  return dp[m][n];
}

function parseFlags(args) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const eqIdx = args[i].indexOf('=');
      if (eqIdx !== -1) {
        flags[args[i].slice(2, eqIdx)] = args[i].slice(eqIdx + 1);
      } else {
        const key = args[i].slice(2);
        flags[key] = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true;
      }
    } else {
      positional.push(args[i]);
    }
  }
  return { flags, positional };
}

function resolveVault(flags) {
  return flags.vault || process.env.OA_VAULT || process.cwd();
}

async function main() {
  // ── Version ──
  if (command === 'version' || command === '--version' || command === '-v') {
    const { readFileSync } = await import('fs');
    const { resolve, dirname } = await import('path');
    const { fileURLToPath } = await import('url');
    const pkgPath = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    console.log(`clausidian v${pkg.version}`);
    return;
  }

  // ── Help ──
  if (command === 'help' || command === '--help' || command === '-h' || !command) {
    const { printHelp } = await import('../src/help.mjs');
    printHelp();
    return;
  }

  // ── Find command ──
  const cmd = getCommand(command);
  if (!cmd) {
    const names = getCommandNames();
    const similar = names.filter(c => c.startsWith(command?.slice(0, 2) || '') || levenshtein(c, command) <= 2);
    console.error(`Unknown command: ${command}`);
    if (similar.length) console.error(`Did you mean: ${similar.join(', ')}?`);
    else console.error('Run "clausidian help" for usage.');
    process.exit(1);
  }

  // ── Parse & run ──
  const { flags, positional } = parseFlags(args.slice(1));
  const jsonMode = flags.json === true;
  const origLog = console.log;
  if (jsonMode) console.log = () => {};

  let result;
  if (cmd.subcommands) {
    // Dispatch to subcommand
    const subcommandName = positional[0];
    const subcommand = cmd.subcommands[subcommandName];
    if (!subcommand) {
      const available = Object.keys(cmd.subcommands).join(', ');
      console.error(`Unknown subcommand: ${subcommandName}`);
      console.error(`Available: ${available}`);
      process.exit(1);
    }
    // Remove subcommand from positional args
    positional.shift();
    result = await subcommand.run(resolveVault(flags), flags, positional);
  } else if (cmd.run) {
    result = await cmd.run(resolveVault(flags), flags, positional);
  } else {
    throw new Error(`Command ${command} has no run function or subcommands`);
  }

  if (jsonMode && result !== undefined) {
    console.log = origLog;
    console.log(JSON.stringify(result, null, 2));
  }
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
