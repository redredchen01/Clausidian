/**
 * archive — set a note's status to archived
 */
import { Vault } from '../vault.mjs';
import { IndexManager } from '../index-manager.mjs';
import { todayStr } from '../dates.mjs';

export function archive(vaultRoot, noteName) {
  const vault = new Vault(vaultRoot);
  const idx = new IndexManager(vault);

  if (!noteName) {
    throw new Error('Usage: obsidian-agent archive <note-name>');
  }

  const note = vault.findNote(noteName);
  if (!note) {
    throw new Error(`Note not found: ${noteName}`);
  }

  if (note.status === 'archived') {
    console.log(`Already archived: ${vault.notePath(note.dir, note.file)}`);
    return { status: 'already_archived' };
  }

  vault.updateNote(note.dir, note.file, {
    status: 'archived',
    updated: todayStr(),
  });
  idx.rebuildTags();

  const np = vault.notePath(note.dir, note.file);
  console.log(`Archived ${np}`);
  return { status: 'archived', file: np };
}
