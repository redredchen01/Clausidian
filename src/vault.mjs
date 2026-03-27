/**
 * Vault — core operations for reading/writing Obsidian notes
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'fs';
import { resolve, join } from 'path';

export class Vault {
  constructor(root) {
    this.root = resolve(root);
    this.dirs = ['areas', 'projects', 'resources', 'journal', 'ideas'];
  }

  // ── Path helpers ─────────────────────────────────────

  path(...segments) {
    return join(this.root, ...segments);
  }

  exists(...segments) {
    return existsSync(this.path(...segments));
  }

  // ── Read/Write ───────────────────────────────────────

  read(...segments) {
    const p = this.path(...segments);
    return existsSync(p) ? readFileSync(p, 'utf8') : null;
  }

  write(...args) {
    const content = args.pop();
    const p = this.path(...args);
    const dir = p.substring(0, p.lastIndexOf('/'));
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(p, content);
  }

  // ── Frontmatter parsing ──────────────────────────────

  parseFrontmatter(content) {
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (!match) return {};
    const fm = match[1];
    const result = {};
    for (const line of fm.split('\n')) {
      const m = line.match(/^(\w[\w-]*):\s*(.+)$/);
      if (!m) continue;
      let [, key, val] = m;
      val = val.trim().replace(/^"(.*)"$/, '$1');
      if (val.startsWith('[') && val.endsWith(']')) {
        val = val.slice(1, -1).split(',').map(s =>
          s.trim().replace(/^"(.*)"$/, '$1').replace(/^\[\[(.*)\]\]$/, '$1')
        ).filter(Boolean);
      }
      result[key] = val;
    }
    return result;
  }

  // ── Scan all notes ───────────────────────────────────

  scanNotes() {
    const notes = [];
    for (const dir of this.dirs) {
      const dirPath = this.path(dir);
      if (!existsSync(dirPath)) continue;
      for (const file of readdirSync(dirPath)) {
        if (!file.endsWith('.md') || file.startsWith('_')) continue;
        const content = this.read(dir, file);
        if (!content) continue;
        const fm = this.parseFrontmatter(content);
        notes.push({
          file: file.replace('.md', ''),
          dir,
          title: fm.title || file.replace('.md', ''),
          type: fm.type || dir.replace(/s$/, ''),
          tags: Array.isArray(fm.tags) ? fm.tags : [],
          status: fm.status || 'active',
          summary: fm.summary || '',
          related: Array.isArray(fm.related) ? fm.related : [],
          created: fm.created || '',
          updated: fm.updated || '',
        });
      }
    }
    return notes;
  }

  // ── Search notes by keyword ──────────────────────────

  search(keyword, { type, tag, status } = {}) {
    const notes = this.scanNotes();
    const kw = keyword.toLowerCase();
    return notes.filter(n => {
      if (type && n.type !== type) return false;
      if (tag && !n.tags.includes(tag)) return false;
      if (status && n.status !== status) return false;
      const haystack = `${n.title} ${n.summary} ${n.tags.join(' ')}`.toLowerCase();
      return haystack.includes(kw);
    });
  }

  // ── Find related notes ───────────────────────────────

  findRelated(title, tags = []) {
    const notes = this.scanNotes();
    const titleWords = title.toLowerCase().split(/[\s-]+/);
    return notes
      .map(n => {
        let score = 0;
        const nWords = `${n.title} ${n.summary}`.toLowerCase();
        for (const w of titleWords) {
          if (w.length > 2 && nWords.includes(w)) score += 1;
        }
        for (const t of tags) {
          if (n.tags.includes(t)) score += 2;
        }
        return { ...n, score };
      })
      .filter(n => n.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }

  // ── Type → directory mapping ─────────────────────────

  typeDir(type) {
    const map = { area: 'areas', project: 'projects', resource: 'resources', idea: 'ideas', journal: 'journal' };
    return map[type] || type;
  }
}
