/**
 * Search result caching with TTL
 * Improves performance for repeated searches
 */

class SearchCache {
  constructor(ttlMs = 10 * 60 * 1000) { // 10 minutes default
    this.cache = new Map();
    this.ttl = ttlMs;
    this.hitCount = 0;
    this.missCount = 0;
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
}

export { SearchCache };
