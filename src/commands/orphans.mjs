/**
 * orphans — find notes with no inbound links
 */
import { Vault } from '../vault.mjs';

export function orphans(vaultRoot) {
  const vault = new Vault(vaultRoot);
  const results = vault.orphans();

  if (!results.length) {
    console.log('No orphan notes found.');
    return { results: [] };
  }

  console.log(`\n${results.length} orphan note(s) (no inbound links):\n`);
  console.log('| File | Type | Status | Summary |');
  console.log('|------|------|--------|---------|');
  for (const r of results) {
    console.log(`| [[${r.file}]] | ${r.type} | ${r.status} | ${r.summary || '-'} |`);
  }

  return { results };
}
