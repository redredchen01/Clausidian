/**
 * recent — show recently updated notes
 */
import { Vault } from '../vault.mjs';

export function recent(vaultRoot, { days = 7 } = {}) {
  const vault = new Vault(vaultRoot);
  const notes = vault.scanNotes();

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const recentNotes = notes
    .filter(n => n.updated >= cutoffStr)
    .sort((a, b) => (b.updated || '').localeCompare(a.updated || ''));

  if (!recentNotes.length) {
    console.log(`No notes updated in the last ${days} day(s).`);
    return { notes: [], days };
  }

  console.log(`\n${recentNotes.length} note(s) updated in the last ${days} day(s):\n`);
  console.log('| File | Type | Updated | Summary |');
  console.log('|------|------|---------|---------|');
  for (const n of recentNotes) {
    console.log(`| [[${n.file}]] | ${n.type} | ${n.updated} | ${n.summary || '-'} |`);
  }

  return { notes: recentNotes, days };
}
