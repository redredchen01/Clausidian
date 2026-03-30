/**
 * FileHasher — quick change detection using mtime and size
 */
import { statSync, existsSync, readdirSync } from 'fs';
import { join, relative } from 'path';

export class FileHasher {
  /**
   * Compute hash (mtime, size) for a single file.
   * @param {string} filePath
   * @returns {Object|null} {mtime, size} or null if file doesn't exist
   */
  static hash(filePath) {
    if (!existsSync(filePath)) return null;
    try {
      const stat = statSync(filePath);
      return { mtime: stat.mtimeMs, size: stat.size };
    } catch {
      return null;
    }
  }

  /**
   * Hash all .md files in a directory recursively.
   * @param {string} dirPath - Root directory
   * @param {string} [pattern='**\/*.md'] - File glob pattern (unused, always scans .md files)
   * @returns {Object} {[relPath]: {mtime, size}}
   */
  static hashDir(dirPath, pattern = '**/*.md') {
    const result = {};
    const walk = (dir) => {
      if (!existsSync(dir)) return;
      try {
        const entries = readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = join(dir, entry.name);
          if (entry.isDirectory()) {
            if (!entry.name.startsWith('.')) walk(fullPath);
          } else if (entry.name.endsWith('.md') && !entry.name.startsWith('_')) {
            const relPath = relative(dirPath, fullPath);
            const hash = this.hash(fullPath);
            if (hash) result[relPath] = hash;
          }
        }
      } catch {
        // Graceful degradation on permission errors
      }
    };
    walk(dirPath);
    return result;
  }

  /**
   * Compare two hash snapshots.
   * @param {Object} before - Previous hashes {[path]: {mtime, size}}
   * @param {Object} after - Current hashes {[path]: {mtime, size}}
   * @returns {Object} {created, modified, deleted}
   */
  static compare(before, after) {
    before = before || {};
    after = after || {};

    const created = [];
    const modified = [];
    const deleted = [];

    // Find created and modified
    for (const [path, hash] of Object.entries(after)) {
      if (!(path in before)) {
        created.push(path);
      } else if (before[path].mtime !== hash.mtime || before[path].size !== hash.size) {
        modified.push(path);
      }
    }

    // Find deleted
    for (const path of Object.keys(before)) {
      if (!(path in after)) {
        deleted.push(path);
      }
    }

    return { created, modified, deleted };
  }
}
