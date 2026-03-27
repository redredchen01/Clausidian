/**
 * search — search notes by keyword with optional filters
 */
import { Vault } from '../vault.mjs';

export function search(vaultRoot, keyword, { type, tag, status } = {}) {
  const vault = new Vault(vaultRoot);

  if (!keyword) {
    console.error('Usage: obsidian-agent search <keyword> [--type TYPE] [--tag TAG] [--status STATUS]');
    process.exit(1);
  }

  const results = vault.search(keyword, { type, tag, status });

  if (!results.length) {
    console.log(`No results for "${keyword}"`);
    return { results: [] };
  }

  console.log(`\nFound ${results.length} result(s) for "${keyword}":\n`);
  console.log('| File | Type | Status | Summary |');
  console.log('|------|------|--------|---------|');
  for (const r of results.slice(0, 20)) {
    console.log(`| [[${r.file}]] | ${r.type} | ${r.status} | ${r.summary || '-'} |`);
  }

  return { results };
}
