/**
 * update — update frontmatter fields on an existing note
 */
import { Vault } from '../vault.mjs';
import { IndexManager } from '../index-manager.mjs';
import { todayStr } from '../dates.mjs';

export function update(vaultRoot, noteName, { status, tags, summary, tag } = {}) {
  const vault = new Vault(vaultRoot);
  const idx = new IndexManager(vault);

  if (!noteName) {
    console.error('Usage: obsidian-agent update <note-name> [--status STATUS] [--tags TAG1,TAG2] [--summary TEXT]');
    process.exit(1);
  }

  // Find the note
  const notes = vault.scanNotes();
  const note = notes.find(n => n.file === noteName);
  if (!note) {
    console.error(`Note not found: ${noteName}`);
    process.exit(1);
  }

  const updates = { updated: todayStr() };
  if (status) updates.status = status;
  if (summary) updates.summary = summary;
  if (tags) updates.tags = tags.split(',').map(t => t.trim());
  if (tag) {
    const existing = note.tags;
    if (!existing.includes(tag)) {
      updates.tags = [...existing, tag];
    }
  }

  vault.updateNote(note.dir, note.file, updates);
  idx.rebuildTags();

  const changed = Object.keys(updates).filter(k => k !== 'updated').join(', ') || 'updated';
  console.log(`Updated ${note.dir}/${note.file}.md (${changed})`);
  return { status: 'updated', file: `${note.dir}/${note.file}.md`, changes: updates };
}
