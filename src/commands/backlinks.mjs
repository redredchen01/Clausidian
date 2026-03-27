/**
 * backlinks — show notes that link to a given note
 */
import { Vault } from '../vault.mjs';

export function backlinks(vaultRoot, noteName) {
  const vault = new Vault(vaultRoot);

  if (!noteName) {
    console.error('Usage: obsidian-agent backlinks <note-name>');
    process.exit(1);
  }

  const results = vault.backlinks(noteName);

  if (!results.length) {
    console.log(`No backlinks found for "${noteName}"`);
    return { results: [] };
  }

  console.log(`\n${results.length} note(s) link to [[${noteName}]]:\n`);
  console.log('| File | Type | Summary |');
  console.log('|------|------|---------|');
  for (const r of results) {
    console.log(`| [[${r.file}]] | ${r.type} | ${r.summary || '-'} |`);
  }

  return { results };
}
