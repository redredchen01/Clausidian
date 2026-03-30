/**
 * stale — list and manage stale (inactive) notes
 */
import { Vault } from '../vault.mjs';
import { batch } from './batch.mjs';
import { todayStr } from '../dates.mjs';

export function stale(vaultRoot, { threshold = 30, autoArchive = false } = {}) {
  const vault = new Vault(vaultRoot);
  const allNotes = vault.scanNotes();
  const today = todayStr();

  // Parse today's date to get timestamp
  const [y, m, d] = today.split('-').map(Number);
  const todayTime = new Date(y, m - 1, d).getTime();
  const cutoffTime = todayTime - threshold * 24 * 60 * 60 * 1000;

  // Find stale notes: active status + not journal + last updated before cutoff
  const staleNotes = allNotes.filter(n => {
    if (n.dir === 'journal' || !n.type) return false;

    // Check if it's a project with "active" status
    if (n.type !== 'project') return false;
    if (n.status !== 'active') return false;

    // Check if lastUpdated is before cutoff
    const noteTime = new Date(n.updated || n.created).getTime();
    return noteTime < cutoffTime;
  });

  if (staleNotes.length === 0) {
    console.log('✓ No stale notes found');
    return { staleCount: 0, archived: 0 };
  }

  // Format output
  console.log(`\n📌 Stale Notes (inactive for ${threshold}+ days)\n`);
  console.log(`${staleNotes.length} note(s) found:\n`);

  let archivedCount = 0;
  const notesToArchive = [];

  for (const note of staleNotes) {
    const lastUpdate = note.updated || note.created;
    const daysSince = Math.floor((todayTime - new Date(lastUpdate).getTime()) / (24 * 60 * 60 * 1000));

    console.log(`  • ${note.file}`);
    console.log(`    Type: ${note.type} | Status: ${note.status}`);
    console.log(`    Last updated: ${lastUpdate} (${daysSince} days ago)`);

    if (autoArchive) {
      notesToArchive.push(note.file);
    }
  }

  // Auto-archive if requested
  if (autoArchive && notesToArchive.length > 0) {
    console.log(`\n🔄 Archiving ${notesToArchive.length} note(s)...`);

    // Use batch archive to update all at once
    const archived = batch(vaultRoot, {
      // Filter by the specific notes we want to archive
      update: notesToArchive.map(file => ({
        file,
        setStatus: 'archived'
      }))
    });

    archivedCount = notesToArchive.length;
    console.log(`✓ Archived ${archivedCount} note(s)`);
  } else if (!autoArchive) {
    console.log(`\n💡 Use --auto-archive to archive these notes`);
  }

  return { staleCount: staleNotes.length, archived: archivedCount };
}
