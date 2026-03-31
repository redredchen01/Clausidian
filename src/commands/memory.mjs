/**
 * memory — sync vault notes to Claude Code memory system
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { resolve, join } from 'path';
import { Vault } from '../vault.mjs';

export function memorySync(vaultRoot, options = {}) {
  const vault = new Vault(vaultRoot);
  const home = process.env.HOME || process.env.USERPROFILE;
  const dryRun = options.dryRun === true;

  const notes = vault.scanNotes({ includeBody: true });
  const memoryNotes = [];

  // Scan for memory:true or pin:true in frontmatter
  for (const note of notes) {
    const content = vault.read(note.dir, `${note.file}.md`);
    if (!content) continue;
    const fm = vault.parseFrontmatter(content);
    if (fm.memory === 'true' || fm.pin === 'true') {
      memoryNotes.push({ ...note, content, fm });
    }
  }

  const results = { synced: [], pending: [], outdated: [] };

  // Write to Claude memory paths
  for (const note of memoryNotes) {
    const body = vault.extractBody(note.content);
    const memoryPath = note.type === 'project'
      ? join(home, '.claude', 'projects', note.file.replace(/[^a-z0-9-]/g, ''), 'memory', `vault-${note.file}.md`)
      : join(home, '.claude', 'memory', `vault-${note.file}.md`);

    const memoryContent = [
      `# ${note.title}`,
      `Type: ${note.type}`,
      `Tags: ${note.tags.join(', ')}`,
      `Updated: ${note.updated}`,
      ``,
      body,
    ].join('\n');

    if (!dryRun) {
      const dir = memoryPath.split('/').slice(0, -1).join('/');
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(memoryPath, memoryContent);
      results.synced.push(note.file);
    } else {
      results.pending.push(note.file);
    }
  }

  console.log(JSON.stringify({
    status: dryRun ? 'preview' : 'synced',
    synced: results.synced.length,
    pending: results.pending.length,
    notes: results.synced.concat(results.pending),
  }));

  return results;
}

export function memoryPush(vaultRoot, noteName, options = {}) {
  const vault = new Vault(vaultRoot);
  const home = process.env.HOME || process.env.USERPROFILE;

  const note = vault.findNote(noteName);
  if (!note) {
    console.log(JSON.stringify({ status: 'error', reason: 'note not found', note: noteName }));
    return;
  }

  const content = vault.read(note.dir, `${note.file}.md`);
  if (!content) {
    console.log(JSON.stringify({ status: 'error', reason: 'cannot read note' }));
    return;
  }

  const fm = vault.parseFrontmatter(content);
  const body = vault.extractBody(content);

  const memoryPath = note.type === 'project'
    ? join(home, '.claude', 'projects', note.file.replace(/[^a-z0-9-]/g, ''), 'memory', `vault-${note.file}.md`)
    : join(home, '.claude', 'memory', `vault-${note.file}.md`);

  const memoryContent = [
    `# ${note.title}`,
    `Type: ${note.type}`,
    `Tags: ${note.tags.join(', ')}`,
    `Updated: ${note.updated}`,
    ``,
    body,
  ].join('\n');

  const dir = memoryPath.split('/').slice(0, -1).join('/');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(memoryPath, memoryContent);

  console.log(JSON.stringify({
    status: 'pushed',
    note: note.file,
    path: memoryPath,
    type: note.type,
  }));
}

export function memoryStatus(vaultRoot, options = {}) {
  const vault = new Vault(vaultRoot);
  const home = process.env.HOME || process.env.USERPROFILE;

  const notes = vault.scanNotes();
  const memoryNotes = notes.filter(n => {
    const content = vault.read(n.dir, `${n.file}.md`);
    if (!content) return false;
    const fm = vault.parseFrontmatter(content);
    return fm.memory === 'true' || fm.pin === 'true';
  });

  const synced = [];
  const pending = [];

  for (const note of memoryNotes) {
    const memoryPath = note.type === 'project'
      ? join(home, '.claude', 'projects', note.file.replace(/[^a-z0-9-]/g, ''), 'memory', `vault-${note.file}.md`)
      : join(home, '.claude', 'memory', `vault-${note.file}.md`);

    if (existsSync(memoryPath)) {
      synced.push(note.file);
    } else {
      pending.push(note.file);
    }
  }

  console.log(JSON.stringify({
    status: 'ok',
    synced,
    pending,
    syncedCount: synced.length,
    pendingCount: pending.length,
  }));

  return { synced, pending };
}

export function contextForTopic(vaultRoot, topic, options = {}) {
  const vault = new Vault(vaultRoot);
  const depth = options.depth || 1;

  // Search for topic
  const searchResults = vault.search(topic).slice(0, 5);
  const relatedNotes = new Set();

  for (const result of searchResults) {
    relatedNotes.add(result.file);

    // Add neighbors
    const neighbors = vault.findRelated(result.file, depth);
    for (const neighbor of neighbors) {
      relatedNotes.add(neighbor.file);
    }

    // Add backlinks
    const backlinks = vault.scanNotes()
      .filter(n => n.related && n.related.includes(result.file));
    for (const bl of backlinks) {
      relatedNotes.add(bl.file);
    }
  }

  // Build context for each note
  const allNotes = vault.scanNotes({ includeBody: true });
  const contextNotes = [];

  for (const file of relatedNotes) {
    const note = allNotes.find(n => n.file === file);
    if (note) {
      const body = vault.extractBody(note.content || vault.read(note.dir, `${note.file}.md`));
      contextNotes.push({
        file: note.file,
        title: note.title,
        type: note.type,
        summary: note.summary,
        body: body.slice(0, 200),
        tags: note.tags,
      });
    }
  }

  console.log(JSON.stringify({
    status: 'ok',
    topic,
    totalNotes: contextNotes.length,
    notes: contextNotes,
  }));

  return { topic, notes: contextNotes };
}
