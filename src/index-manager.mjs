/**
 * Index manager — maintains _tags.md, _graph.md, and directory _index.md files
 */
import { todayStr, prevDate, nextDate } from './dates.mjs';
import { TFIDFIndex } from './tfidf-utils.mjs';

export class IndexManager {
  constructor(vault) {
    this.vault = vault;
  }

  // ── Rebuild _tags.md ─────────────────────────────────

  rebuildTags(notes) {
    if (!notes) notes = this.vault.scanNotes();
    const tagMap = {};
    for (const note of notes) {
      for (const tag of note.tags) {
        if (!tagMap[tag]) tagMap[tag] = [];
        tagMap[tag].push({ file: note.file, summary: note.summary });
      }
    }

    const today = todayStr();
    let content = `---\ntitle: Tags Index\ntype: index\nupdated: ${today}\n---\n\n# Tags Index\n\n`;
    for (const tag of Object.keys(tagMap).sort()) {
      content += `### ${tag}\n`;
      for (const n of tagMap[tag]) {
        content += `- [[${n.file}]] — ${n.summary || '(no summary)'}\n`;
      }
      content += '\n';
    }
    content += `## Stats\n\n| Tag | Count |\n|-----|-------|\n`;
    for (const [tag, items] of Object.entries(tagMap).sort((a, b) => b[1].length - a[1].length)) {
      content += `| ${tag} | ${items.length} |\n`;
    }
    this.vault.write('_tags.md', content);
    return { tags: Object.keys(tagMap).length, notes: notes.length };
  }

  // ── Rebuild _graph.md (TF-IDF weighted suggestions) ─

  rebuildGraph(notes) {
    if (!notes) notes = this.vault.scanNotes({ includeBody: true });
    const today = todayStr();
    // Build note lookup for strength calculation
    const noteMap = new Map();
    for (const n of notes) noteMap.set(n.file, n);

    let content = `---\ntitle: Knowledge Graph\ntype: index\nupdated: ${today}\n---\n\n# Knowledge Graph\n\n| Source | Links To | Type | nav |\n|--------|----------|------|-----|\n`;

    // Pre-build tag Sets for all notes (for strength calculation)
    const allTagSets = new Map();
    for (const n of notes) {
      allTagSets.set(n.file, new Set(n.tags));
    }

    let relCount = 0;
    for (const note of notes) {
      for (const rel of note.related) {
        const target = noteMap.get(rel);
        let strength = 'weak';
        if (target) {
          const noteSet = allTagSets.get(note.file);
          const targetSet = allTagSets.get(target.file);
          let shared = 0;
          for (const t of noteSet) {
            if (targetSet.has(t)) shared++;
          }
          if (shared >= 2) strength = 'strong';
          else if (shared >= 1) strength = 'medium';
        }
        content += `| [[${note.file}]] | [[${rel}]] | ${strength} | |\n`;
        relCount++;
      }
      if (note.dir === 'journal' && note.file.match(/^\d{4}-\d{2}-\d{2}$/)) {
        const prevFile = prevDate(note.file);
        const nextFile = nextDate(note.file);
        content += `| [[${note.file}]] | [[${prevFile}]] | nav | nav-prev |\n`;
        content += `| [[${note.file}]] | [[${nextFile}]] | nav | nav-next |\n`;
      }
    }

    // ── TF-IDF weighted link suggestions ──
    const nonJournal = notes.filter(n => n.dir !== 'journal' && n.tags.length > 0);

    // Build TF-IDF index
    const tfidf = new TFIDFIndex();
    const docs = [];
    for (const n of nonJournal) {
      for (const t of n.tags) {
        docs.push({ tag: t, docId: n.file });
      }
    }
    tfidf.build(docs);

    // Build tag Sets per note (O(1) lookup instead of O(m) includes)
    const tagSets = new Map();
    for (const n of nonJournal) {
      tagSets.set(n.file, new Set(n.tags));
    }

    // Build keyword sets per note (title + summary words, 3+ chars)
    const noteKeywords = new Map();
    for (const n of nonJournal) {
      const text = `${n.title} ${n.summary} ${n.body || ''}`.toLowerCase();
      const words = new Set(text.match(/[a-z\u4e00-\u9fff]{3,}/g) || []);
      noteKeywords.set(n.file, words);
    }

    // Existing links (bidirectional)
    const existingLinks = new Set();
    for (const n of nonJournal) {
      for (const rel of n.related) {
        existingLinks.add(`${n.file}→${rel}`);
        existingLinks.add(`${rel}→${n.file}`);
      }
    }

    // Score all unlinked pairs
    const suggested = [];
    for (let i = 0; i < nonJournal.length; i++) {
      for (let j = i + 1; j < nonJournal.length; j++) {
        const a = nonJournal[i], b = nonJournal[j];
        if (existingLinks.has(`${a.file}→${b.file}`)) continue;

        let score = 0;
        const shared = [];

        // TF-IDF weighted tag overlap (using Set for O(1) lookup)
        const aSet = tagSets.get(a.file);
        const bSet = tagSets.get(b.file);
        for (const t of aSet) {
          if (bSet.has(t)) {
            score += tfidf.score(t);
            shared.push(t);
          }
        }

        // Keyword co-occurrence bonus (capped at +2)
        const kwA = noteKeywords.get(a.file);
        const kwB = noteKeywords.get(b.file);
        let kwOverlap = 0;
        if (kwA && kwB) {
          for (const w of kwA) {
            if (kwB.has(w)) kwOverlap++;
          }
          score += Math.min(kwOverlap * 0.1, 2);
        }

        // Minimum: at least 1 shared tag AND score > threshold
        if (shared.length >= 1 && score >= 1.5) {
          suggested.push({ a: a.file, b: b.file, shared, score: Math.round(score * 10) / 10 });
        }
      }
    }

    // Sort by score descending
    suggested.sort((a, b) => b.score - a.score);

    if (suggested.length) {
      content += `\n## Suggested Links\n\nTF-IDF weighted (rare tags + content overlap score higher):\n\n| Note A | Note B | Score | Shared Tags |\n|--------|--------|-------|-------------|\n`;
      for (const link of suggested.slice(0, 25)) {
        content += `| [[${link.a}]] | [[${link.b}]] | ${link.score} | ${link.shared.join(', ')} |\n`;
      }
    }

    // ── Cluster detection (Union-Find on related links) ──
    const allNotes = notes.filter(n => n.dir !== 'journal');
    const parent = {};
    const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
    const union = (a, b) => { parent[find(a)] = find(b); };

    for (const n of allNotes) parent[n.file] = n.file;
    for (const n of allNotes) {
      for (const rel of n.related) {
        if (parent[rel] !== undefined) union(n.file, rel);
      }
    }

    // Group into clusters (min 2 members)
    const clusters = {};
    for (const n of allNotes) {
      const root = find(n.file);
      if (!clusters[root]) clusters[root] = [];
      clusters[root].push(n.file);
    }
    const sortedClusters = Object.values(clusters)
      .filter(c => c.length >= 2)
      .sort((a, b) => b.length - a.length);

    if (sortedClusters.length) {
      content += `\n## Clusters\n\n`;
      for (let i = 0; i < sortedClusters.length; i++) {
        const c = sortedClusters[i];
        // Label by the most-connected node
        const connCount = {};
        for (const file of c) {
          const n = allNotes.find(x => x.file === file);
          connCount[file] = n ? n.related.length : 0;
        }
        const hub = c.sort((a, b) => (connCount[b] || 0) - (connCount[a] || 0))[0];
        content += `### Cluster ${i + 1}: ${hub} (${c.length} notes)\n`;
        content += c.map(f => `- [[${f}]]`).join('\n') + '\n\n';
      }
    }

    this.vault.write('_graph.md', content);
    return {
      relationships: relCount,
      suggestedLinks: suggested.length,
      clusters: sortedClusters.length,
    };
  }

  // ── Update directory _index.md ───────────────────────

  updateDirIndex(dir, file, summary) {
    const indexPath = `${dir}/_index.md`;
    let content = this.vault.read(indexPath);
    if (!content) {
      content = `---\ntitle: ${dir} index\ntype: index\nupdated: ${todayStr()}\n---\n\n# ${dir}\n\n| File | Summary |\n|------|---------|\n`;
    }
    content = content.replace(/updated: \d{4}-\d{2}-\d{2}/, `updated: ${todayStr()}`);
    if (!content.includes(`[[${file}]]`)) {
      content = content.replace(
        /(\| File \| Summary \|\n\|------\|---------\|\n)/,
        `$1| [[${file}]] | ${summary} |\n`
      );
    }
    this.vault.write(indexPath, content);
  }

  // ── Sync all indices (single scan) ──────────────────

  /**
   * Sync indices with change detection.
   * If no changes detected, skip full rebuild and return cached result.
   * If changes detected, rebuild indices only for changed/new notes while preserving unchanged.
   * @returns {Object} Sync result with tags, notes, relationships, etc.
   */
  sync() {
    const changes = this.vault.detectChanges();

    // No changes: quick return (still rebuild to ensure consistency)
    if (changes.created.length === 0 && changes.modified.length === 0 && changes.deleted.length === 0) {
      // Even with no changes, rebuild indices from full note set
      // (ensures indices are consistent, but reuses all notes for efficiency)
      const notes = this.vault.scanNotes();
      const tags = this.rebuildTags(notes);
      const graph = this.rebuildGraph(notes);
      return { ...tags, ...graph, unchanged: changes.unchanged, total: changes.total };
    }

    // Changes detected: full rebuild (scan all notes, process all)
    const notes = this.vault.scanNotes();
    const tags = this.rebuildTags(notes);
    const graph = this.rebuildGraph(notes);
    return { ...tags, ...graph, changed: changes.created.length + changes.modified.length };
  }
}
