/**
 * link — find and create missing links using TF-IDF weighted scoring
 *
 * Combines tag IDF weights + keyword co-occurrence to find the highest
 * value unlinked pairs, then creates bidirectional related links.
 */
import { Vault } from '../vault.mjs';
import { IndexManager } from '../index-manager.mjs';
import { todayStr } from '../dates.mjs';

function scorePairs(notes) {
  const nonJournal = notes.filter(n => n.type !== 'journal');
  const totalNotes = nonJournal.length || 1;

  // TF-IDF for tags
  const tagDF = {};
  for (const n of nonJournal) {
    for (const t of n.tags) tagDF[t] = (tagDF[t] || 0) + 1;
  }
  const tagIDF = {};
  for (const [tag, df] of Object.entries(tagDF)) {
    tagIDF[tag] = Math.log(totalNotes / df);
  }

  // Keyword sets per note
  const noteKW = new Map();
  for (const n of nonJournal) {
    const text = `${n.title} ${n.summary} ${(n.body || '').slice(0, 500)}`.toLowerCase();
    noteKW.set(n.file, new Set(text.match(/[a-z\u4e00-\u9fff]{3,}/g) || []));
  }

  // Existing links (bidirectional)
  const linked = new Set();
  for (const n of nonJournal) {
    for (const rel of n.related) {
      linked.add(`${n.file}→${rel}`);
      linked.add(`${rel}→${n.file}`);
    }
    // Also check body wikilinks
    const wl = (n.body || '').match(/\[\[([^\]]+)\]\]/g) || [];
    for (const w of wl) {
      const target = w.slice(2, -2);
      linked.add(`${n.file}→${target}`);
    }
  }

  const pairs = [];
  for (let i = 0; i < nonJournal.length; i++) {
    for (let j = i + 1; j < nonJournal.length; j++) {
      const a = nonJournal[i], b = nonJournal[j];
      if (linked.has(`${a.file}→${b.file}`) || linked.has(`${b.file}→${a.file}`)) continue;

      let score = 0;
      const shared = [];

      // TF-IDF weighted tag overlap
      for (const t of a.tags) {
        if (b.tags.includes(t)) {
          score += tagIDF[t] || 1;
          shared.push(t);
        }
      }

      // Keyword co-occurrence (capped at +2)
      const kwA = noteKW.get(a.file);
      const kwB = noteKW.get(b.file);
      let kwOverlap = 0;
      if (kwA && kwB) {
        for (const w of kwA) if (kwB.has(w)) kwOverlap++;
        score += Math.min(kwOverlap * 0.1, 2);
      }

      if (shared.length >= 1 && score >= 1.5) {
        pairs.push({
          noteA: { file: a.file, dir: a.dir, type: a.type },
          noteB: { file: b.file, dir: b.dir, type: b.type },
          score: Math.round(score * 10) / 10,
          sharedTags: shared,
        });
      }
    }
  }

  return pairs.sort((a, b) => b.score - a.score);
}

export function link(vaultRoot, { dryRun = false, threshold = 1.5, top = 10 } = {}) {
  const vault = new Vault(vaultRoot);
  const idx = new IndexManager(vault);
  const notes = vault.scanNotes({ includeBody: true });
  const suggestions = scorePairs(notes).filter(s => s.score >= threshold);

  if (!suggestions.length) {
    console.log('No missing links found above threshold.');
    return { linked: 0, suggestions: [] };
  }

  if (dryRun) {
    console.log(`\nFound ${suggestions.length} potential link(s) (showing top ${Math.min(top, suggestions.length)}):\n`);
    console.log('| Note A | Note B | Score | Shared Tags |');
    console.log('|--------|--------|-------|-------------|');
    for (const s of suggestions.slice(0, top)) {
      console.log(`| [[${s.noteA.file}]] | [[${s.noteB.file}]] | ${s.score} | ${s.sharedTags.join(', ')} |`);
    }
    return { linked: 0, suggestions };
  }

  // Apply top N links
  let linked = 0;
  for (const s of suggestions.slice(0, top)) {
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
      ).replace(/^(updated:)\s*.*$/m, `$1 ${todayStr()}`);
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
      ).replace(/^(updated:)\s*.*$/m, `$1 ${todayStr()}`);
      if (updated !== contentB) vault.write(noteB.dir, `${noteB.file}.md`, updated);
    }

    linked++;
  }

  idx.sync();
  console.log(`Created ${linked} bidirectional link(s) from ${suggestions.length} candidates`);
  return { linked, suggestions };
}
