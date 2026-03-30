/**
 * search — search notes by keyword with optional filters
 */
import { Vault } from '../vault.mjs';
import { SearchCache } from '../search-cache.mjs';

// Global cache instance (shared across searches in same CLI invocation)
let searchCache = new SearchCache();

export function search(vaultRoot, keyword, { type, tag, status, regex } = {}) {
  const vault = new Vault(vaultRoot, { searchCache });

  if (!keyword) {
    throw new Error('Usage: clausidian search <keyword> [--type TYPE] [--tag TAG] [--status STATUS] [--regex]');
  }

  const results = vault.search(keyword, { type, tag, status, regex });

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
