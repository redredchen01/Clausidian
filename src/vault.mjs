/**
 * Vault — core operations for reading/writing Obsidian notes
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'fs';
import { resolve, join } from 'path';

export class Vault {
  constructor(root) {
    this.root = resolve(root);
    this.dirs = ['areas', 'projects', 'resources', 'journal', 'ideas'];
    this._notesCache = null;
    this._notesCacheWithBody = null;
  }

  invalidateCache() {
    this._notesCache = null;
    this._notesCacheWithBody = null;
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
    this.invalidateCache();
  }

  // ── Frontmatter parsing ──────────────────────────────

  parseFrontmatter(content) {
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (!match) return {};
    const fm = match[1];
    const result = {};
    for (const line of fm.split('\n')) {
      // Match key: value, allowing colons in value portion
      const m = line.match(/^(\w[\w-]*):\s*(.*)$/);
      if (!m) continue;
      let [, key, val] = m;
      val = val.trim();
      if (!val) continue;
      val = val.replace(/^"(.*)"$/, '$1');
      if (val.startsWith('[') && val.endsWith(']')) {
        val = val.slice(1, -1).split(',').map(s =>
          s.trim().replace(/^"(.*)"$/, '$1').replace(/^\[\[(.*)\]\]$/, '$1')
        ).filter(Boolean);
      }
      result[key] = val;
    }
    return result;
  }

  // ── Extract body (content after frontmatter) ────────

  extractBody(content) {
    return content.replace(/^---\n[\s\S]*?\n---\n?/, '').trim();
  }

  // ── Scan all notes (cached) ──────────────────────────

  scanNotes({ includeBody = false } = {}) {
    const cacheKey = includeBody ? '_notesCacheWithBody' : '_notesCache';
    if (this[cacheKey]) return this[cacheKey];

    const notes = [];
    for (const dir of this.dirs) {
      const dirPath = this.path(dir);
      if (!existsSync(dirPath)) continue;
      for (const file of readdirSync(dirPath)) {
        if (!file.endsWith('.md') || file.startsWith('_')) continue;
        const content = this.read(dir, file);
        if (!content) continue;
        const fm = this.parseFrontmatter(content);
        const note = {
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
        };
        if (includeBody) note.body = this.extractBody(content);
        notes.push(note);
      }
    }
    this[cacheKey] = notes;
    return notes;
  }

  // ── Search notes by keyword (relevance-scored) ─────

  search(keyword, { type, tag, status, regex = false } = {}) {
    const notes = this.scanNotes({ includeBody: true });
    const results = [];

    // Build matcher: regex mode or plain keyword
    let matcher;
    if (regex) {
      try {
        const re = new RegExp(keyword, 'i');
        matcher = (text) => re.test(text);
      } catch {
        throw new Error(`Invalid regex: ${keyword}`);
      }
    } else {
      const kw = keyword.toLowerCase();
      matcher = (text) => text.toLowerCase().includes(kw);
    }

    for (const n of notes) {
      if (type && n.type !== type) continue;
      if (tag && !n.tags.includes(tag)) continue;
      if (status && n.status !== status) continue;
      let score = 0;
      if (matcher(n.title)) score += 10;
      if (matcher(n.file)) score += 8;
      if (n.tags.some(t => matcher(t))) score += 5;
      if (matcher(n.summary)) score += 3;
      if (matcher(n.body || '')) score += 1;
      if (score > 0) {
        const { body, ...rest } = n;
        results.push({ ...rest, _score: score });
      }
    }
    return results.sort((a, b) => b._score - a._score).map(({ _score, ...rest }) => rest);
  }

  // ── Find backlinks (notes that link TO a given note) ─

  backlinks(noteName) {
    const notes = this.scanNotes({ includeBody: true });
    return notes.filter(n => {
      if (n.file === noteName) return false;
      const content = `${n.related.join(' ')} ${n.body || ''}`;
      return content.includes(`[[${noteName}]]`);
    }).map(({ body, ...rest }) => rest);
  }

  // ── Find orphan notes (no inbound links) ─────────────

  orphans() {
    const notes = this.scanNotes({ includeBody: true });
    const linked = new Set();
    for (const n of notes) {
      for (const rel of n.related) linked.add(rel);
      const wikilinks = (n.body || '').match(/\[\[([^\]]+)\]\]/g) || [];
      for (const wl of wikilinks) linked.add(wl.slice(2, -2));
    }
    return notes.filter(n => !linked.has(n.file) && n.type !== 'journal')
      .map(({ body, ...rest }) => rest);
  }

  // ── Update frontmatter fields on a note ──────────────

  updateNote(dir, filename, updates) {
    const filePath = `${dir}/${filename}.md`;
    let content = this.read(filePath);
    if (!content) return null;
    for (const [key, val] of Object.entries(updates)) {
      const strVal = Array.isArray(val) ? `[${val.join(', ')}]` : `"${val}"`;
      const regex = new RegExp(`^(${key}:)\\s*.*$`, 'm');
      if (content.match(regex)) {
        content = content.replace(regex, `$1 ${strVal}`);
      }
    }
    this.write(filePath, content);
    return true;
  }

  // ── Vault stats (single-pass, no rescan) ────────────

  stats() {
    const notes = this.scanNotes({ includeBody: true });
    const byType = {};
    const byStatus = {};
    const byTag = {};
    const linked = new Set();
    for (const n of notes) {
      byType[n.type] = (byType[n.type] || 0) + 1;
      byStatus[n.status] = (byStatus[n.status] || 0) + 1;
      for (const t of n.tags) byTag[t] = (byTag[t] || 0) + 1;
      for (const rel of n.related) linked.add(rel);
      const wikilinks = (n.body || '').match(/\[\[([^\]]+)\]\]/g) || [];
      for (const wl of wikilinks) linked.add(wl.slice(2, -2));
    }
    const orphanCount = notes.filter(n => !linked.has(n.file) && n.type !== 'journal').length;
    return { total: notes.length, byType, byStatus, byTag, orphans: orphanCount };
  }

  // ── Find related notes ───────────────────────────────

  findRelated(title, tags = []) {
    const notes = this.scanNotes();
    const titleWords = title.toLowerCase().split(/[\s-]+/).filter(w => w.length > 2);
    return notes
      .map(n => {
        let score = 0;
        const nWords = `${n.title} ${n.summary}`.toLowerCase();
        for (const w of titleWords) {
          const re = new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
          if (re.test(nWords)) score += 1;
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

  // ── Find note by name (fuzzy) ───────────────────────

  findNote(name) {
    if (!name) return null;
    const notes = this.scanNotes();
    // Exact match
    const exact = notes.find(n => n.file === name);
    if (exact) return exact;
    // Case-insensitive match
    const lower = name.toLowerCase();
    const ci = notes.find(n => n.file.toLowerCase() === lower);
    if (ci) return ci;
    // Partial match (contains)
    const partial = notes.filter(n => n.file.toLowerCase().includes(lower));
    if (partial.length === 1) return partial[0];
    // Title match
    const titleMatch = notes.filter(n => n.title.toLowerCase().includes(lower));
    if (titleMatch.length === 1) return titleMatch[0];
    // Multiple matches — return closest (shortest file name containing the query)
    const allMatches = [...new Set([...partial, ...titleMatch])];
    if (allMatches.length > 0) {
      return allMatches.sort((a, b) => a.file.length - b.file.length)[0];
    }
    return null;
  }

  // ── Type → directory mapping ─────────────────────────

  typeDir(type) {
    const map = { area: 'areas', project: 'projects', resource: 'resources', idea: 'ideas', journal: 'journal' };
    return map[type] || type;
  }
}
