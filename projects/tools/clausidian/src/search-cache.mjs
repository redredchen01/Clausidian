/**
 * Search result caching with TTL
 * Improves performance for repeated searches
 */

import crypto from 'crypto';
import { promises as fs } from 'fs';
import { dirname } from 'path';

class SearchCache {
  constructor(vault, options = {}) {
    this.vault = vault;
    this.cache = new Map();
    this.ttl = options.ttl ?? (10 * 60 * 1000); // 10 minutes default

    if (typeof this.ttl !== 'number' || this.ttl < 0) {
      throw new Error('TTL must be a non-negative number');
    }

    this._hits = 0;
    this._misses = 0;
    this._lastStatTime = Date.now();
    this.diskPath = null;
  }

  /**
   * Generate cache key from search parameters using SHA256 hash.
   * Ensures collision-free keys for complex option objects.
   * @param {string} keyword - Search keyword
   * @param {Object} opts - Search options
   * @returns {string} Cache key
   */
  _generateKey(keyword, opts) {
    const combined = JSON.stringify({ keyword, opts: JSON.parse(JSON.stringify(opts)) });
    return crypto.createHash('sha256').update(combined).digest('hex');
  }

  /**
   * Get cached search result if valid
   * @param {string} keyword - Search keyword
   * @param {Object} opts - Search options
   * @returns {Array|null} Cached results or null if expired/missing
   */
  get(keyword, opts = {}) {
    const key = this._generateKey(keyword, opts);
    const entry = this.cache.get(key);

    if (!entry) {
      this._misses++;
      return null;
    }

    // Check if expired
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      this._misses++;
      return null;
    }

    this._hits++;
    return entry.results;
  }

  /**
   * Cache search results
   * Trigger async disk write if diskPath is set
   * @param {string} keyword - Search keyword
   * @param {Object} opts - Search options
   * @param {Array} results - Search results
   */
  set(keyword, opts = {}, results) {
    const key = this._generateKey(keyword, opts);
    this.cache.set(key, {
      results,
      timestamp: Date.now(),
      keyword,
      opts
    });

    // Non-blocking write-through to disk via setImmediate
    if (this.diskPath) {
      setImmediate(() => this.saveToDisk(this.diskPath).catch(() => {
        // Silent fail on disk write errors
      }));
    }
  }

  /**
   * Invalidate all cache entries
   * Used when vault changes
   */
  invalidate() {
    this.cache.clear();
    this._hits = 0;
    this._misses = 0;
    this._lastStatTime = Date.now();
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache stats including hits, misses, size, age, timestamp, vaultVersion
   */
  stats() {
    const now = Date.now();
    let size = 0;

    // Calculate total size of cached results
    for (const entry of this.cache.values()) {
      size += JSON.stringify(entry.results).length;
    }

    return {
      hits: this._hits,
      misses: this._misses,
      size,
      age: now - this._lastStatTime,
      timestamp: now,
      vaultVersion: this.vault?._vaultVersion || 'unknown'
    };
  }

  /**
   * Serialize cache state for persistence
   * @returns {Object} Serializable cache state
   */
  toDisk() {
    const entries = Array.from(this.cache.values()).map(entry => ({
      keyHash: this._generateKey(entry.keyword, entry.opts),
      keyword: entry.keyword,
      opts: entry.opts,
      results: entry.results,
      timestamp: entry.timestamp
    }));

    return {
      version: '1',
      vaultVersion: this.vault?._vaultVersion || 'unknown',
      ttl: this.ttl,
      hits: this._hits,
      misses: this._misses,
      entries,
      savedAt: Date.now()
    };
  }

  /**
   * Restore cache state from persisted data
   * @param {Object} state - Serialized cache state from toDisk()
   */
  fromDisk(state) {
    if (!state || !Array.isArray(state.entries)) {
      return; // Invalid state, use empty cache
    }

    this.ttl = state.ttl ?? this.ttl;
    this._hits = state.hits ?? 0;
    this._misses = state.misses ?? 0;
    this.cache.clear();

    // Restore entries from disk
    for (const entry of state.entries) {
      this.cache.set(
        entry.keyHash,
        {
          results: entry.results,
          timestamp: entry.timestamp,
          keyword: entry.keyword,
          opts: entry.opts
        }
      );
    }
  }

  /**
   * Load cache from disk (async, non-blocking)
   * Called on process startup to restore cache if valid
   * @param {string} diskPath - Path to cache.json file
   */
  async loadFromDisk(diskPath) {
    this.diskPath = diskPath;

    try {
      const data = await fs.readFile(diskPath, 'utf8');
      const cached = JSON.parse(data);

      // Validate vault version match
      if (this.vault && cached.vaultVersion !== this.vault._vaultVersion) {
        return; // Silent fail: version mismatch
      }

      // Skip if cache is too old
      const age = Date.now() - cached.savedAt;
      if (age > this.ttl) {
        return; // Silent fail: expired
      }

      // Restore valid entries
      this.fromDisk(cached);
    } catch (err) {
      // Silent fail on any I/O error: file missing, parse error, etc.
    }
  }

  /**
   * Save cache to disk (async, non-blocking)
   * Write-through: serialize valid entries only
   * @param {string} diskPath - Path to cache.json file
   */
  async saveToDisk(diskPath) {
    try {
      const data = this.toDisk();

      // Ensure directory exists
      const dir = dirname(diskPath);
      await fs.mkdir(dir, { recursive: true });

      // Write atomically: write to temp, then rename
      const tmpPath = `${diskPath}.tmp`;
      await fs.writeFile(tmpPath, JSON.stringify(data));
      await fs.rename(tmpPath, diskPath);
    } catch (err) {
      // Silent fail on any I/O error
    }
  }
}

export { SearchCache };
