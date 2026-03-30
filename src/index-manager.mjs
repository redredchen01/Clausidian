/**
 * Index manager — maintains _tags.md, _graph.md, and directory _index.md files
 */
import { todayStr, prevDate, nextDate } from './dates.mjs';
import { TFIDFIndex } from './tfidf-utils.mjs';
import { ClusterCache } from './cluster-cache.mjs';

export class IndexManager {
  constructor(vault, clusterCache = null) {
    this.vault = vault;
    this.clusterCache = clusterCache || new ClusterCache();
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

  /**
   * Compute vault version hash from current file state.
   * Used to invalidate cluster cache when vault structure changes.
   * @returns {string} Simple hash of vault state
   */
  _getVaultVersion() {
    const changes = this.vault.detectChanges();
    // Create a version string from changes signature
    const sig = `${changes.total}:${Object.keys(changes).toString()}`;
    return sig;
  }

  /**
   * Detect notes that have had cluster membership changes.
   * Returns list of note files whose cluster assignment may have changed.
   * @param {Array} allNotes - All non-journal notes
   * @returns {Array} Note files to invalidate from cache
   */
  _getClusterChangedNotes(allNotes) {
    const changes = this.vault.detectChanges();
    const changedNotes = [];
    
    // Collect changed note files
    for (const path of [...changes.created, ...changes.modified, ...changes.deleted]) {
      // Extract note filename from path (e.g., "projects/note.md" -> "note")
      const match = path.match(/([^/]+)\.md$/);
      if (match) {
        changedNotes.push(match[1]);
      }
    }
    
    // Also invalidate any notes that have a direct relation to changed notes
    // since their cluster membership might change
    const relatedNotes = new Set(changedNotes);
    for (const note of allNotes) {
      for (const rel of note.related) {
        if (changedNotes.includes(rel)) {
          relatedNotes.add(note.file);
        }
      }
    }
    
    return Array.from(relatedNotes);
  }

  // ── Rebuild _graph.md (TF-IDF weighted suggestions) ─

  rebuildGraph(notes) {
    if (!notes) notes = this.vault.scanNotes();
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
      const text = `${n.title} ${n.summary}`.toLowerCase(); // lazy load body on demand
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

    // ── Cluster detection (Union-Find on related links) with caching ──
    const allNotes = notes.filter(n => n.dir !== 'journal');
    const allNotesMap = new Map(allNotes.map(n => [n.file, n])); // O(1) lookup instead of O(n)
    const vaultVersion = this._getVaultVersion();
    
    // Attempt to use cached cluster assignments
    const useCache = this.clusterCache.isValid(vaultVersion);
    const noteToCluster = new Map();
    
    if (useCache) {
      // Load cluster assignments from cache
      for (const note of allNotes) {
        const cached = this.clusterCache.get(note.file, vaultVersion);
        if (cached) {
          noteToCluster.set(note.file, cached);
        }
      }
      
      // If all notes are cached, we can skip the union-find computation
      if (noteToCluster.size === allNotes.length) {
        // Use cached cluster map directly
        const clusters = {};
        for (const note of allNotes) {
          const root = noteToCluster.get(note.file);
          if (!clusters[root]) clusters[root] = [];
          clusters[root].push(note.file);
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
              const n = allNotesMap.get(file);
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
          clusterCacheHit: true,
        };
      }
    }
    
    // Cache miss or invalid: perform full union-find computation
    const parent = {};
    const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
    const union = (a, b) => { parent[find(a)] = find(b); };

    for (const n of allNotes) parent[n.file] = n.file;
    for (const n of allNotes) {
      for (const rel of n.related) {
        if (parent[rel] !== undefined) union(n.file, rel);
      }
    }

    // Group into clusters (min 2 members) and update cache
    const clusters = {};
    const clusterMap = new Map();
    for (const n of allNotes) {
      const root = find(n.file);
      if (!clusters[root]) clusters[root] = [];
      clusters[root].push(n.file);
      clusterMap.set(n.file, root);
      
      // Cache individual cluster assignments
      this.clusterCache.set(n.file, root, vaultVersion);
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
          const n = allNotesMap.get(file);
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
      clusterCacheHit: false,
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
