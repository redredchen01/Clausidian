/**
 * Search result caching with TTL
 * Improves performance for repeated searches
 */

import { promises as fs } from 'fs';
import { dirname } from 'path';

class SearchCache {
  constructor(ttlMs = 10 * 60 * 1000) { // 10 minutes default
    this.cache = new Map();
    this.ttl = ttlMs;
    this.hitCount = 0;
    this.missCount = 0;
    this.diskPath = null;
    this.vaultVersion = null;
  }

  /**
   * Generate cache key from search parameters using fast hashing.
   * Uses simple string concatenation for O(1) speed on typical inputs.
   * @param {string} keyword - Search keyword
   * @param {Object} options - Search options
   * @returns {string} Cache key
   */
  _getCacheKey(keyword, options = {}) {
    const { type, tag, status, regex } = options;
    // Simple concatenation is fast and deterministic
    return `${keyword}|${type || ''}|${tag || ''}|${status || ''}|${regex ? 'regex' : ''}`;
  }

  /**
   * Get cached search result if valid
   * @param {string} keyword - Search keyword
   * @param {Object} options - Search options
   * @returns {Array|null} Cached results or null if expired/missing
   */
  get(keyword, options = {}) {
    const key = this._getCacheKey(keyword, options);
    const entry = this.cache.get(key);

    if (!entry) {
      this.missCount++;
      return null;
    }

    // Check if expired
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      this.missCount++;
      return null;
    }

    this.hitCount++;
    return entry.results;
  }

  /**
   * Cache search results
   * @param {string} keyword - Search keyword
   * @param {Object} options - Search options
   * @param {Array} results - Search results
   */
  set(keyword, options = {}, results) {
    const key = this._getCacheKey(keyword, options);
    this.cache.set(key, {
      results,
      timestamp: Date.now(),
    });
    // Non-blocking write-through to disk
    if (this.diskPath && this.vaultVersion) {
      setImmediate(() => this.saveToDisk(this.diskPath, this.vaultVersion));
    }
  }

  /**
   * Invalidate all cache entries
   * Used when vault changes
   */
  clear() {
    this.cache.clear();
    this.hitCount = 0;
    this.missCount = 0;
  }

  /**
   * Invalidate specific cache entry
   * @param {string} keyword - Search keyword
   * @param {Object} options - Search options
   */
  invalidate(keyword, options = {}) {
    const key = this._getCacheKey(keyword, options);
    this.cache.delete(key);
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache stats
   */
  stats() {
    let validEntries = 0;
    let expiredEntries = 0;

    this.cache.forEach(entry => {
      if (Date.now() - entry.timestamp > this.ttl) {
        expiredEntries++;
      } else {
        validEntries++;
      }
    });

    const total = this.hitCount + this.missCount;
    const hitRate = total > 0 ? ((this.hitCount / total) * 100).toFixed(2) : 0;

    return {
      totalEntries: this.cache.size,
      validEntries,
      expiredEntries,
      ttlMs: this.ttl,
      hits: this.hitCount,
      misses: this.missCount,
      hitRate: parseFloat(hitRate),
    };
  }

  /**
   * Load cache from disk (async)
   * Called on process startup to restore cache if valid
   * @param {string} diskPath - Path to cache.json file
   * @param {string} vaultVersion - Current vault version
   */
  async loadFromDisk(diskPath, vaultVersion) {
    this.diskPath = diskPath;
    this.vaultVersion = vaultVersion;

    try {
      const data = await fs.readFile(diskPath, 'utf8');
      const cached = JSON.parse(data);

      // Validate vault version match
      if (cached.vaultVersion !== vaultVersion) {
        return; // Silent fail: version mismatch
      }

      // Skip if cache is too old
      const age = Date.now() - cached.timestamp;
      if (age > this.ttl) {
        return; // Silent fail: expired
      }

      // Restore valid entries only
      if (cached.entries && Array.isArray(cached.entries)) {
        cached.entries.forEach(([key, entry]) => {
          // Skip expired entries
          const entryAge = Date.now() - entry.timestamp;
          if (entryAge <= this.ttl) {
            this.cache.set(key, entry);
          }
        });
      }
    } catch (err) {
      // Silent fail on any I/O error: file missing, parse error, etc.
    }
  }

  /**
   * Save cache to disk (async, non-blocking)
   * Write-through: serialize valid entries only
   * @param {string} diskPath - Path to cache.json file
   * @param {string} vaultVersion - Current vault version
   */
  async saveToDisk(diskPath, vaultVersion) {
    try {
      // Serialize only valid entries
      const entries = [];
      this.cache.forEach((entry, key) => {
        const age = Date.now() - entry.timestamp;
        if (age <= this.ttl) {
          entries.push([key, entry]);
        }
      });

      const data = {
        vaultVersion,
        timestamp: Date.now(),
        entries,
      };

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
