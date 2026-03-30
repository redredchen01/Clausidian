/**
 * link — find and create missing links between related notes
 *
 * Scans all notes, finds pairs that share significant word overlap
 * but aren't linked, and offers to link them.
 */
import { Vault } from '../vault.mjs';
import { IndexManager } from '../index-manager.mjs';
import { todayStr } from '../dates.mjs';

function tokenize(text) {
  return text.toLowerCase().split(/[\s\-_/]+/).filter(w => w.length > 2);
}

export function link(vaultRoot, { dryRun = false, threshold = 0.3 } = {}) {
  const vault = new Vault(vaultRoot);
  const idx = new IndexManager(vault);
  const notes = vault.scanNotes({ includeBody: true });
  const suggestions = [];

  for (let i = 0; i < notes.length; i++) {
    const a = notes[i];
    if (a.type === 'journal') continue;
    const tokensA = new Set(tokenize(`${a.title} ${a.summary} ${(a.body || '').slice(0, 300)}`));

    for (let j = i + 1; j < notes.length; j++) {
      const b = notes[j];
      if (b.type === 'journal') continue;

      // Already linked?
      if (a.related.includes(b.file) || b.related.includes(a.file)) continue;
      const bodyA = a.body || '';
      const bodyB = b.body || '';
      if (bodyA.includes(`[[${b.file}]]`) || bodyB.includes(`[[${a.file}]]`)) continue;

      const tokensB = new Set(tokenize(`${b.title} ${b.summary} ${(b.body || '').slice(0, 300)}`));
      let overlap = 0;
      for (const w of tokensA) if (tokensB.has(w)) overlap++;
      const sim = overlap / Math.max(tokensA.size, tokensB.size);

      // Tag overlap bonus
      const sharedTags = a.tags.filter(t => b.tags.includes(t)).length;
      const score = sim + sharedTags * 0.15;

      if (score >= threshold) {
        suggestions.push({
          noteA: { file: a.file, dir: a.dir, type: a.type },
          noteB: { file: b.file, dir: b.dir, type: b.type },
          score: Math.round(score * 100),
          sharedTags,
        });
      }
    }
  }

  suggestions.sort((a, b) => b.score - a.score);

  if (!suggestions.length) {
    console.log('No missing links found.');
    return { linked: 0, suggestions: [] };
  }

  if (dryRun) {
    console.log(`\nFound ${suggestions.length} potential link(s):\n`);
    console.log('| Note A | Note B | Score | Shared Tags |');
    console.log('|--------|--------|-------|-------------|');
    for (const s of suggestions.slice(0, 20)) {
      console.log(`| [[${s.noteA.file}]] | [[${s.noteB.file}]] | ${s.score}% | ${s.sharedTags} |`);
    }
    return { linked: 0, suggestions };
  }

  // Apply links
  let linked = 0;
  for (const s of suggestions) {
    const { noteA, noteB } = s;

    // Add B to A's related
    const contentA = vault.read(noteA.dir, `${noteA.file}.md`);
    if (contentA && !contentA.includes(`[[${noteB.file}]]`)) {
      const updated = contentA.replace(
        /^(related:)\s*\[(.*)]/m,
        (_, prefix, inner) => {
          const existing = inner.trim() ? `${inner}, ` : '';
          return `${prefix} [${existing}"[[${noteB.file}]]"]`;
        }
      ).replace(/^(updated:)\s*.*$/m, `$1 "${todayStr()}"`);
      if (updated !== contentA) vault.write(noteA.dir, `${noteA.file}.md`, updated);
    }

    // Add A to B's related
    const contentB = vault.read(noteB.dir, `${noteB.file}.md`);
    if (contentB && !contentB.includes(`[[${noteA.file}]]`)) {
      const updated = contentB.replace(
        /^(related:)\s*\[(.*)]/m,
        (_, prefix, inner) => {
          const existing = inner.trim() ? `${inner}, ` : '';
          return `${prefix} [${existing}"[[${noteA.file}]]"]`;
        }
      ).replace(/^(updated:)\s*.*$/m, `$1 "${todayStr()}"`);
      if (updated !== contentB) vault.write(noteB.dir, `${noteB.file}.md`, updated);
    }

    linked++;
  }

  idx.sync();
  console.log(`Created ${linked} bidirectional link(s)`);
  return { linked, suggestions };
}
