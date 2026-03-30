/**
 * neighbors — show notes within N hops of a given note (graph traversal)
 */
import { Vault } from '../vault.mjs';

export function neighbors(vaultRoot, noteName, { depth = 2 } = {}) {
  const vault = new Vault(vaultRoot);

  if (!noteName) {
    throw new Error('Usage: clausidian neighbors <note-name> [--depth N]');
  }

  const note = vault.findNote(noteName);
  if (!note) throw new Error(`Note not found: ${noteName}`);

  const notes = vault.scanNotes({ includeBody: true });
  const noteMap = new Map(notes.map(n => [n.file, n]));

  // Build adjacency list and reverse adjacency (for O(edges) traversal, not O(n²))
  const adj = new Map();    // file → Set of outbound links
  const revAdj = new Map(); // file → Set of inbound links
  for (const n of notes) {
    const links = new Set();
    for (const rel of n.related) links.add(rel);
    const wikilinks = (n.body || '').match(/\[\[([^\]]+)\]\]/g) || [];
    for (const wl of wikilinks) {
      const target = wl.slice(2, -2);
      if (noteMap.has(target)) links.add(target);
    }
    adj.set(n.file, links);
  }
  // Build reverse adjacency for efficient bidirectional traversal
  for (const [file, links] of adj) {
    for (const link of links) {
      if (!revAdj.has(link)) revAdj.set(link, new Set());
      revAdj.get(link).add(file);
    }
  }

  // BFS with explicit cycle protection
  const visited = new Map(); // file → depth
  const queue = [[note.file, 0]];
  visited.set(note.file, 0);

  while (queue.length) {
    const [current, d] = queue.shift();
    if (d >= depth) continue;

    // Forward links
    const links = adj.get(current) || new Set();
    for (const link of links) {
      if (!visited.has(link)) {
        visited.set(link, d + 1);
        queue.push([link, d + 1]);
      }
    }

    // Reverse links (bidirectional graph traversal)
    const revLinks = revAdj.get(current) || new Set();
    for (const link of revLinks) {
      if (!visited.has(link)) {
        visited.set(link, d + 1);
        queue.push([link, d + 1]);
      }
    }
  }

  visited.delete(note.file); // Remove self
  const result = [];
  for (const [file, d] of visited) {
    const n = noteMap.get(file);
    if (n) result.push({ file: n.file, type: n.type, summary: n.summary, depth: d });
  }
  result.sort((a, b) => a.depth - b.depth || a.file.localeCompare(b.file));

  if (!result.length) {
    console.log(`No neighbors found for [[${note.file}]]`);
    return { center: note.file, neighbors: [] };
  }

  console.log(`\n${result.length} neighbor(s) of [[${note.file}]] (depth ${depth}):\n`);
  for (let d = 1; d <= depth; d++) {
    const atDepth = result.filter(r => r.depth === d);
    if (!atDepth.length) continue;
    console.log(`  Depth ${d}:`);
    for (const r of atDepth) {
      console.log(`    [[${r.file}]] (${r.type}) ${r.summary ? '— ' + r.summary : ''}`);
    }
  }

  return { center: note.file, neighbors: result };
}
