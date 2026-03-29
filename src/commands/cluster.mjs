/**
 * cluster — discover topic clusters via tag co-occurrence and suggest missing links
 *
 * Combines: scanNotes, findRelated, backlinks, search, stats, updateNote, indexManager
 */
import { Vault } from '../vault.mjs';
import { IndexManager } from '../index-manager.mjs';
import { todayStr } from '../dates.mjs';

// Union-Find for clustering
class UnionFind {
  constructor(n) { this.parent = Array.from({ length: n }, (_, i) => i); this.rank = new Array(n).fill(0); }
  find(x) { return this.parent[x] === x ? x : (this.parent[x] = this.find(this.parent[x])); }
  union(a, b) {
    const ra = this.find(a), rb = this.find(b);
    if (ra === rb) return;
    if (this.rank[ra] < this.rank[rb]) this.parent[ra] = rb;
    else if (this.rank[ra] > this.rank[rb]) this.parent[rb] = ra;
    else { this.parent[rb] = ra; this.rank[ra]++; }
  }
}

export function cluster(vaultRoot, { autoLink = false, minSize = 2 } = {}) {
  const vault = new Vault(vaultRoot);
  const idx = new IndexManager(vault);
  const today = todayStr();

  const notes = vault.scanNotes({ includeBody: true });
  // Exclude journals and archived notes from clustering
  const eligible = notes.filter(n => n.type !== 'journal' && n.status !== 'archived');

  if (eligible.length < 2) {
    console.log('Not enough notes for cluster analysis.');
    return { status: 'insufficient', clusters: [] };
  }

  // Index for fast lookup
  const noteIdx = {};
  eligible.forEach((n, i) => { noteIdx[n.file] = i; });

  // Build edges: notes sharing 2+ tags
  const uf = new UnionFind(eligible.length);
  for (let i = 0; i < eligible.length; i++) {
    for (let j = i + 1; j < eligible.length; j++) {
      const shared = eligible[i].tags.filter(t => eligible[j].tags.includes(t));
      if (shared.length >= 2) {
        uf.union(i, j);
      }
    }
  }

  // Also cluster notes connected via related field
  for (let i = 0; i < eligible.length; i++) {
    for (const rel of eligible[i].related) {
      if (noteIdx[rel] !== undefined) {
        uf.union(i, noteIdx[rel]);
      }
    }
  }

  // Group by cluster root
  const groups = {};
  for (let i = 0; i < eligible.length; i++) {
    const root = uf.find(i);
    if (!groups[root]) groups[root] = [];
    groups[root].push(eligible[i]);
  }

  // Filter by min size and build cluster info
  const clusters = [];
  for (const members of Object.values(groups)) {
    if (members.length < minSize) continue;

    // Find core tags (appearing in 2+ members)
    const tagCounts = {};
    for (const m of members) {
      for (const t of m.tags) tagCounts[t] = (tagCounts[t] || 0) + 1;
    }
    const coreTags = Object.entries(tagCounts)
      .filter(([, c]) => c >= 2)
      .sort((a, b) => b[1] - a[1])
      .map(([t]) => t);

    // Name the cluster by its top tags
    const clusterName = coreTags.slice(0, 3).join(' + ') || members[0].type;

    // Compute existing links between members
    const memberSet = new Set(members.map(m => m.file));
    let existingLinks = 0;
    const possiblePairs = [];
    const missingLinks = [];

    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        const a = members[i], b = members[j];
        const aLinksB = a.related.includes(b.file) || (a.body || '').includes(`[[${b.file}]]`);
        const bLinksA = b.related.includes(a.file) || (b.body || '').includes(`[[${a.file}]]`);

        possiblePairs.push([a.file, b.file]);

        if (aLinksB || bLinksA) {
          existingLinks++;
        } else {
          // Score the missing link
          const sharedTags = a.tags.filter(t => b.tags.includes(t));
          const related = vault.findRelated(a.title, a.tags);
          const matchScore = related.find(r => r.file === b.file)?.score || 0;
          const score = sharedTags.length * 2 + matchScore;
          if (score > 0) {
            missingLinks.push({
              from: a.file,
              to: b.file,
              score,
              reason: sharedTags.length
                ? `shared tags: ${sharedTags.join(', ')}`
                : 'content similarity',
            });
          }
        }
      }
    }

    missingLinks.sort((a, b) => b.score - a.score);

    const totalPossible = possiblePairs.length;
    const connectivity = totalPossible > 0
      ? Math.round((existingLinks / totalPossible) * 100)
      : 100;

    clusters.push({
      name: clusterName,
      tags: coreTags,
      notes: members.map(m => m.file),
      existingLinks,
      possibleLinks: totalPossible,
      connectivity,
      missingLinks,
    });
  }

  clusters.sort((a, b) => b.notes.length - a.notes.length);

  // Auto-link if requested
  let linkedCount = 0;
  if (autoLink) {
    for (const c of clusters) {
      for (const link of c.missingLinks) {
        const noteA = vault.findNote(link.from);
        const noteB = vault.findNote(link.to);
        if (!noteA || !noteB) continue;

        // Add B to A's related
        const contentA = vault.read(`${noteA.dir}/${noteA.file}.md`);
        if (contentA && !contentA.includes(`[[${link.to}]]`)) {
          const updatedA = contentA.replace(
            /related: \[(.*)]/,
            (match, inner) => {
              const existing = inner ? `${inner}, ` : '';
              return `related: [${existing}"[[${link.to}]]"]`;
            }
          ).replace(/updated: "\d{4}-\d{2}-\d{2}"/, `updated: "${today}"`);
          vault.write(`${noteA.dir}/${noteA.file}.md`, updatedA);
        }

        // Add A to B's related
        const contentB = vault.read(`${noteB.dir}/${noteB.file}.md`);
        if (contentB && !contentB.includes(`[[${link.from}]]`)) {
          const updatedB = contentB.replace(
            /related: \[(.*)]/,
            (match, inner) => {
              const existing = inner ? `${inner}, ` : '';
              return `related: [${existing}"[[${link.from}]]"]`;
            }
          ).replace(/updated: "\d{4}-\d{2}-\d{2}"/, `updated: "${today}"`);
          vault.write(`${noteB.dir}/${noteB.file}.md`, updatedB);
        }

        linkedCount++;
      }
    }
    if (linkedCount > 0) idx.sync();
  }

  // Console output
  const totalSuggestions = clusters.reduce((sum, c) => sum + c.missingLinks.length, 0);

  console.log(`\nCluster Analysis — ${today}\n`);
  console.log(`Found ${clusters.length} topic cluster(s) across ${notes.filter(n => n.type !== 'journal').length} notes:\n`);

  for (const c of clusters) {
    console.log(`  ${c.name} (${c.notes.length} notes, ${c.connectivity}% connected)`);
    console.log(`    Tags: ${c.tags.join(', ')}`);
    console.log(`    Members: ${c.notes.map(n => `[[${n}]]`).join(', ')}`);
    if (c.missingLinks.length) {
      console.log(`    Missing links:`);
      for (const ml of c.missingLinks.slice(0, 5)) {
        console.log(`      [[${ml.from}]] ↔ [[${ml.to}]] (${ml.reason})`);
      }
      if (c.missingLinks.length > 5) {
        console.log(`      ... and ${c.missingLinks.length - 5} more`);
      }
    }
    console.log('');
  }

  console.log(`| Cluster | Notes | Links | Missing |`);
  console.log(`|---------|-------|-------|---------|`);
  for (const c of clusters) {
    console.log(`| ${c.name} | ${c.notes.length} | ${c.existingLinks}/${c.possibleLinks} (${c.connectivity}%) | ${c.missingLinks.length} |`);
  }

  console.log(`\nTotal suggestions: ${totalSuggestions}`);
  if (autoLink) {
    console.log(`Auto-linked: ${linkedCount} pairs`);
  } else if (totalSuggestions > 0) {
    console.log(`To auto-link: obsidian-agent cluster --auto-link`);
  }

  return {
    status: 'ok',
    clusterCount: clusters.length,
    totalSuggestions,
    autoLinked: autoLink ? linkedCount : undefined,
    clusters: clusters.map(c => ({
      name: c.name,
      tags: c.tags,
      notes: c.notes,
      existingLinks: c.existingLinks,
      possibleLinks: c.possibleLinks,
      connectivity: c.connectivity,
      missingLinks: c.missingLinks,
    })),
  };
}
