/**
 * Index manager — maintains _tags.md, _graph.md, and directory _index.md files
 */
import { todayStr, prevDate, nextDate } from './dates.mjs';

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

    let content = `---\ntitle: Knowledge Graph\ntype: index\nupdated: ${today}\n---\n\n# Knowledge Graph\n\n| Source | Links To | Strength |\n|--------|----------|----------|\n`;

    let relCount = 0;
    for (const note of notes) {
      for (const rel of note.related) {
        const target = noteMap.get(rel);
        let strength = 'weak';
        if (target) {
          const shared = note.tags.filter(t => target.tags.includes(t)).length;
          if (shared >= 2) strength = 'strong';
          else if (shared >= 1) strength = 'medium';
        }
        content += `| [[${note.file}]] | [[${rel}]] | ${strength} |\n`;
        relCount++;
      }
      if (note.dir === 'journal' && note.file.match(/^\d{4}-\d{2}-\d{2}$/)) {
        content += `| [[${note.file}]] | [[${prevDate(note.file)}]] | nav-prev |\n`;
        content += `| [[${note.file}]] | [[${nextDate(note.file)}]] | nav-next |\n`;
      }
    }

    // ── TF-IDF weighted link suggestions ──
    const nonJournal = notes.filter(n => n.dir !== 'journal' && n.tags.length > 0);
    const totalNotes = nonJournal.length;

    // Build tag document frequency (how many notes have each tag)
    const tagDF = {};
    for (const n of nonJournal) {
      for (const t of n.tags) tagDF[t] = (tagDF[t] || 0) + 1;
    }

    // IDF weight: rarer tags score higher — log(N / df)
    const tagIDF = {};
    for (const [tag, df] of Object.entries(tagDF)) {
      tagIDF[tag] = Math.log(totalNotes / df);
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

        // TF-IDF weighted tag overlap
        for (const t of a.tags) {
          if (b.tags.includes(t)) {
            score += tagIDF[t] || 1;
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

  sync() {
    const notes = this.vault.scanNotes();
    const tags = this.rebuildTags(notes);
    const graph = this.rebuildGraph(notes);
    return { ...tags, ...graph };
  }
}
