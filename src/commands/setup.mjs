/**
 * setup — configure Claude Code MCP server + install /obsidian skill
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'fs';
import { resolve, join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILL_SRC = resolve(__dirname, '..', '..', 'skill', 'SKILL.md');

export function setup(vaultPath) {
  const vault = resolve(vaultPath || process.env.OA_VAULT || '.');
  const home = homedir();
  const results = [];

  // 1. Verify vault exists
  if (!existsSync(join(vault, '_index.md')) && !existsSync(join(vault, 'AGENT.md'))) {
    console.log(`"${vault}" doesn't look like an obsidian-agent vault.`);
    console.log('Run: obsidian-agent init <path> first.');
    return { status: 'error', reason: 'not a vault' };
  }

  // 2. Install /obsidian skill to ~/.claude/skills/obsidian/
  const skillDir = join(home, '.claude', 'skills', 'obsidian');
  if (!existsSync(skillDir)) mkdirSync(skillDir, { recursive: true });
  const skillDest = join(skillDir, 'SKILL.md');
  if (existsSync(SKILL_SRC)) {
    copyFileSync(SKILL_SRC, skillDest);
    results.push('Skill installed: ~/.claude/skills/obsidian/SKILL.md');
  } else {
    results.push('Skill source not found (npm package may be missing skill/)');
  }

  // 3. Configure MCP server in ~/.claude/.mcp.json
  const mcpPath = join(home, '.claude', '.mcp.json');
  let mcpConfig = { mcpServers: {} };
  if (existsSync(mcpPath)) {
    try { mcpConfig = JSON.parse(readFileSync(mcpPath, 'utf8')); } catch {}
  }
  if (!mcpConfig.mcpServers) mcpConfig.mcpServers = {};

  mcpConfig.mcpServers['obsidian-agent'] = {
    command: 'obsidian-agent',
    args: ['serve', '--vault', vault],
  };
  if (!existsSync(dirname(mcpPath))) mkdirSync(dirname(mcpPath), { recursive: true });
  writeFileSync(mcpPath, JSON.stringify(mcpConfig, null, 2) + '\n');
  results.push(`MCP server configured: obsidian-agent serve --vault "${vault}"`);

  // 4. Platform-aware shell profile suggestion
  const isWin = process.platform === 'win32';
  const isMac = process.platform === 'darwin';

  let shellHint;
  if (isWin) {
    shellHint = [
      'PowerShell (add to $PROFILE):',
      `  $env:OA_VAULT = "${vault}"`,
      '',
      'Or CMD (System Environment Variables):',
      `  setx OA_VAULT "${vault}"`,
    ].join('\n');
  } else if (isMac) {
    shellHint = [
      'Add to ~/.zshrc (default macOS shell):',
      `  export OA_VAULT="${vault}"`,
    ].join('\n');
  } else {
    shellHint = [
      'Add to ~/.bashrc or ~/.zshrc:',
      `  export OA_VAULT="${vault}"`,
    ].join('\n');
  }

  console.log('\nobsidian-agent setup complete!\n');
  for (const r of results) console.log(`  ✓ ${r}`);
  console.log(`\nTo set OA_VAULT permanently:\n${shellHint}\n`);
  console.log('Next steps:');
  console.log('  1. Restart Claude Code (to load MCP server)');
  console.log('  2. Type /obsidian in any project to manage your vault');
  console.log('  3. Try: obsidian-agent journal\n');

  return { status: 'ok', vault, results };
}
