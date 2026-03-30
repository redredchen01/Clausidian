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

  // ── Rebuild _graph.md ────────────────────────────────

  rebuildGraph(notes) {
    if (!notes) notes = this.vault.scanNotes();
    const today = todayStr();
    let content = `---\ntitle: Knowledge Graph\ntype: index\nupdated: ${today}\n---\n\n# Knowledge Graph\n\n| Source | Links To | Relation |\n|--------|----------|----------|\n`;

    for (const note of notes) {
      for (const rel of note.related) {
        content += `| [[${note.file}]] | [[${rel}]] | related |\n`;
      }
      if (note.dir === 'journal' && note.file.match(/^\d{4}-\d{2}-\d{2}$/)) {
        content += `| [[${note.file}]] | [[${prevDate(note.file)}]] | nav-prev |\n`;
        content += `| [[${note.file}]] | [[${nextDate(note.file)}]] | nav-next |\n`;
      }
    }
    // A5: Suggested links — note pairs sharing 2+ tags but no related link
    const nonJournal = notes.filter(n => n.dir !== 'journal' && n.tags.length > 0);
    const existingLinks = new Set();
    for (const n of nonJournal) {
      for (const rel of n.related) {
        existingLinks.add(`${n.file}→${rel}`);
        existingLinks.add(`${rel}→${n.file}`);
      }
    }
    const suggested = [];
    for (let i = 0; i < nonJournal.length; i++) {
      for (let j = i + 1; j < nonJournal.length; j++) {
        const a = nonJournal[i], b = nonJournal[j];
        const shared = a.tags.filter(t => b.tags.includes(t));
        if (shared.length >= 2 && !existingLinks.has(`${a.file}→${b.file}`)) {
          suggested.push({ a: a.file, b: b.file, shared });
        }
      }
    }
    if (suggested.length) {
      content += `\n## Suggested Links\n\nNote pairs sharing 2+ tags but no related link:\n\n| Note A | Note B | Shared Tags |\n|--------|--------|-------------|\n`;
      for (const link of suggested.slice(0, 20)) {
        content += `| [[${link.a}]] | [[${link.b}]] | ${link.shared.join(', ')} |\n`;
      }
    }

    this.vault.write('_graph.md', content);
    return {
      relationships: content.split('\n').filter(l => l.startsWith('|') && !l.startsWith('| Source') && !l.startsWith('| Note A') && !l.startsWith('|--')).length,
      suggestedLinks: suggested.length,
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
