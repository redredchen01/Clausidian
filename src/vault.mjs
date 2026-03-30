/**
 * Vault — core operations for reading/writing Obsidian notes
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'fs';
import { resolve, join, dirname } from 'path';
import { FileHasher } from './file-hasher.mjs';
import { SelectiveInvalidation } from './vault-selective-invalidation.mjs';

const DEFAULT_DIRS = ['areas', 'projects', 'resources', 'journal', 'ideas'];

export class Vault {
  constructor(root, { dirs } = {}) {
    this.root = resolve(root);
    this.dirs = dirs || this._detectDirs() || DEFAULT_DIRS;
    this._notesCache = null;
    this._notesCacheWithBody = null;
    this._fileHashes = null;
    this._selectiveInvalidation = new SelectiveInvalidation();
  }

  _detectDirs() {
    const configPath = this.path('.clausidian.json');
    if (existsSync(configPath)) {
      try {
        const config = JSON.parse(readFileSync(configPath, 'utf8'));
        if (Array.isArray(config.dirs)) return config.dirs;
      } catch { /* ignore */ }
    }
    return null;
  }

  invalidateCache() {
    this._notesCache = null;
    this._notesCacheWithBody = null;
    this._fileHashes = null;
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
    const content = args.pop().replace(/\r\n/g, '\n');
    const p = this.path(...args);
    const dir = dirname(p);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(p, content);

    // Mark note as dirty for selective invalidation
    // args = ['dir', 'filename.md'], so build noteId by stripping .md from last segment
    if (args.length > 0) {
      const lastIdx = args.length - 1;
      const segments = [...args];
      segments[lastIdx] = segments[lastIdx].replace(/\.md$/, '');
      const noteId = segments.join('/');
      this._selectiveInvalidation.markDirty(noteId, ['tags', 'graph']);
    }

    this.invalidateCache();
  }

  // ── Frontmatter parsing ──────────────────────────────

  /**
   * Parse YAML frontmatter from note content.
   * @param {string} content - Full note content (including frontmatter)
   * @returns {Object} Parsed frontmatter object {title, type, tags, status, ...}
   */
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

  /**
   * Extract body content (after frontmatter).
   * @param {string} content - Full note content (including frontmatter)
   * @returns {string} Body text without frontmatter
   */
  extractBody(content) {
    return content.replace(/^---\n[\s\S]*?\n---\n?/, '').trim();
  }

  // ── Scan all notes (cached) ──────────────────────────

  /**
   * Scan all notes in the vault (with caching).
   * @param {Object} options - Scan options
   * @param {boolean} [options.includeBody=false] - Include note body content
   * @returns {Array<Object>} Array of note objects with metadata
   */
  scanNotes({ includeBody = false } = {}) {
    const cacheKey = includeBody ? '_notesCacheWithBody' : '_notesCache';
    if (this[cacheKey]) return this[cacheKey];

    const notes = [];
    for (const dir of this.dirs) {
      this._scanDir(dir, dir, notes, includeBody);
    }
    this[cacheKey] = notes;
    return notes;
  }

  _scanDir(dir, topDir, notes, includeBody) {
    const dirPath = this.path(dir);
    if (!existsSync(dirPath)) return;
    for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
      if (entry.isDirectory() && !entry.name.startsWith('.') && !entry.name.startsWith('_')) {
        this._scanDir(`${dir}/${entry.name}`, topDir, notes, includeBody);
        continue;
      }
      if (!entry.name.endsWith('.md') || entry.name.startsWith('_')) continue;
      const content = this.read(dir, entry.name);
      if (!content) continue;
      const fm = this.parseFrontmatter(content);
      const note = {
        file: entry.name.replace('.md', ''),
        dir: topDir,
        subdir: dir !== topDir ? dir : undefined,
        title: fm.title || entry.name.replace('.md', ''),
        type: fm.type || topDir.replace(/s$/, ''),
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

  // ── Search notes by keyword (relevance-scored) ─────

  /**
   * Full-text search notes by keyword (relevance-scored).
   * @param {string} keyword - Search term (or regex if opts.regex = true)
   * @param {Object} options - Search options
   * @param {string} [options.type] - Filter by note type
   * @param {string} [options.tag] - Filter by tag
   * @param {string} [options.status] - Filter by status
   * @param {boolean} [options.regex=false] - Treat keyword as regex pattern
   * @returns {Array<Object>} Sorted by relevance score (highest first)
   */
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

  /**
   * Find all notes that link to a given note (backlinks).
   * @param {string} noteName - Target note filename (without .md)
   * @returns {Array<Object>} Notes that link to the target
   */
  backlinks(noteName) {
    const notes = this.scanNotes({ includeBody: true });
    return notes.filter(n => {
      if (n.file === noteName) return false;
      if (n.related.includes(noteName)) return true;
      const content = `${n.body || ''}`;
      return content.includes(`[[${noteName}]]`);
    }).map(({ body, ...rest }) => rest);
  }

  // ── Find orphan notes (no inbound links) ─────────────

  /**
   * Find notes with no inbound links (excluding journal entries).
   * @returns {Array<Object>} Orphaned notes
   */
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

  /**
   * Update frontmatter fields on a note.
   * @param {string} dir - Directory path (e.g., "projects")
   * @param {string} filename - Note filename (without .md extension)
   * @param {Object} updates - Key-value pairs to update in frontmatter
   * @returns {boolean|null} True if successful, null if note not found
   */
  updateNote(dir, filename, updates) {
    const filePath = `${dir}/${filename}.md`;
    let content = this.read(filePath);
    if (!content) return null;
    for (const [key, val] of Object.entries(updates)) {
      let strVal;
      if (Array.isArray(val)) {
        strVal = `[${val.join(', ')}]`;
      } else if (key === 'status') {
        strVal = val;
      } else {
        strVal = `"${val}"`;
      }
      const regex = new RegExp(`^(${key}:)\\s*.*$`, 'm');
      if (content.match(regex)) {
        content = content.replace(regex, `$1 ${strVal}`);
      }
    }
    this.write(filePath, content);
    return true;
  }

  // ── Vault stats (single-pass, no rescan) ────────────

  /**
   * Compute vault statistics (single pass).
   * @returns {Object} Stats object with total count, type/status/tag distribution, orphan count
   */
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

  // ── Find related notes (TF-IDF weighted) ────────────

  /**
   * Find related notes by title keywords and tags (TF-IDF weighted).
   * @param {string} title - Reference title
   * @param {Array<string>} [tags=[]] - Reference tags
   * @returns {Array<Object>} Related notes sorted by relevance score (max 5)
   */
  findRelated(title, tags = []) {
    const notes = this.scanNotes({ includeBody: true });
    const nonJournal = notes.filter(n => n.type !== 'journal');

    // Build tag IDF weights
    const tagDF = {};
    for (const n of nonJournal) {
      for (const t of n.tags) tagDF[t] = (tagDF[t] || 0) + 1;
    }
    const totalNotes = nonJournal.length || 1;
    const tagIDF = {};
    for (const [tag, df] of Object.entries(tagDF)) {
      tagIDF[tag] = Math.log(totalNotes / df);
    }

    const titleWords = title.toLowerCase().split(/[\s-]+/).filter(w => w.length > 2);

    return nonJournal
      .map(n => {
        let score = 0;
        const nText = `${n.title} ${n.summary} ${n.body || ''}`.toLowerCase();

        // Title keyword matches (+1 each, +3 for exact title substring)
        for (const w of titleWords) {
          const re = new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
          if (re.test(nText)) score += 1;
        }
        if (nText.includes(title.toLowerCase())) score += 3;

        // TF-IDF weighted tag matches (rare tags = higher score)
        for (const t of tags) {
          if (n.tags.includes(t)) score += tagIDF[t] || 2;
        }

        const { body, ...rest } = n;
        return { ...rest, score: Math.round(score * 10) / 10 };
      })
      .filter(n => n.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }

  // ── Find note by name (fuzzy) ───────────────────────

  /**
   * Find a note by name using fuzzy matching (exact → case-insensitive → partial → title).
   * @param {string} name - Note name or title (with or without .md)
   * @returns {Object|null} Matched note or null if not found
   */
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

  /**
   * Map note type to vault directory name.
   * @param {string} type - Note type (area, project, resource, idea, journal)
   * @returns {string} Directory name
   */
  typeDir(type) {
    const map = { area: 'areas', project: 'projects', resource: 'resources', idea: 'ideas', journal: 'journal' };
    return map[type] || type;
  }

  // ── Detect file changes (incremental sync) ──────────

  /**
   * Detect which notes were created, modified, or deleted since last sync.
   * Returns total unchanged count for efficiency.
   * @returns {Object} {created, modified, deleted, unchanged, total}
   */
  detectChanges() {
    const cacheFile = this.path('.clausidian', 'hashes.json');
    let prevHashes = {};

    if (existsSync(cacheFile)) {
      try {
        const data = readFileSync(cacheFile, 'utf8');
        prevHashes = JSON.parse(data);
      } catch {
        // Cache corrupted or invalid — fall back to empty
        prevHashes = {};
      }
    }

    // Hash all current .md files in directories
    const currentHashes = {};
    for (const dir of this.dirs) {
      const hashes = FileHasher.hashDir(this.path(dir));
      Object.assign(currentHashes, hashes);
    }

    const { created, modified, deleted } = FileHasher.compare(prevHashes, currentHashes);
    const total = Object.keys(currentHashes).length;
    const unchanged = total - (created.length + modified.length);

    // Save updated hashes for next sync
    try {
      mkdirSync(this.path('.clausidian'), { recursive: true });
      writeFileSync(cacheFile, JSON.stringify(currentHashes, null, 2));
    } catch {
      // Graceful degradation on write failure
    }

    return { created, modified, deleted, unchanged, total };
  }
}
