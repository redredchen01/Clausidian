/**
 * Index manager — maintains _tags.md, _graph.md, and directory _index.md files
 */
export class IndexManager {
  constructor(vault) {
    this.vault = vault;
  }

  // ── Rebuild _tags.md ─────────────────────────────────

  rebuildTags() {
    const notes = this.vault.scanNotes();
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

  rebuildGraph() {
    const notes = this.vault.scanNotes();
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
    this.vault.write('_graph.md', content);
    return { relationships: content.split('\n').filter(l => l.startsWith('|') && !l.startsWith('| Source') && !l.startsWith('|--')).length };
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

  // ── Sync all indices ─────────────────────────────────

  sync() {
    const tags = this.rebuildTags();
    const graph = this.rebuildGraph();
    return { ...tags, ...graph };
  }
}

// ── Date helpers ─────────────────────────────────────

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function prevDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function nextDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}
