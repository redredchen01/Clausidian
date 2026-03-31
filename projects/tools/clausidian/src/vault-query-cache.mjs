/**
 * Vault Query Cache (Initiative B, Sub-task 2.2)
 * Smart caching layer for vault queries with TTL management
 */

import { promises as fs } from 'fs';
import { createHash } from 'crypto';
import { homedir } from 'os';
import { resolve } from 'path';

class VaultQueryCache {
  constructor(cachePath = null, vaultIndexer = null) {
    this.cachePath = cachePath || resolve(homedir(), '.claude', 'vault-query-cache.json');
    this.vaultIndexer = vaultIndexer;
    this.cache = new Map();
    this.cacheMeta = new Map();
    this.stats = {
      hits: 0,
      misses: 0,
      invalidations: 0,
      warmups: 0,
      expirations: 0,
    };
    this.ttlPatterns = {
      stable: 24 * 60 * 60 * 1000,
      timeSensitive: 5 * 60 * 1000,
      general: 60 * 60 * 1000,
      default: 60 * 60 * 1000,
    };
    this.patterns = {
      stable: /^(ideas|skills|templates|projects|archive)/i,
      timeSensitive: /^(urgent|recent|today|unread|inbox)/i,
      general: /^(api|database|config|settings|schema|frontend|backend|devops|tools|libraries)/i,
    };
  }

  getCacheKey(query, params = {}) {
    const normalized = JSON.stringify({
      q: query.toLowerCase().trim(),
      p: params,
    });
    return createHash('sha256').update(normalized).digest('hex');
  }

  _getTTLCategory(query) {
    const lowerQuery = query.toLowerCase();
    if (this.patterns.stable.test(lowerQuery)) {
      return 'stable';
    }
    if (this.patterns.timeSensitive.test(lowerQuery)) {
      return 'timeSensitive';
    }
    if (this.patterns.general.test(lowerQuery)) {
      return 'general';
    }
    return 'default';
  }

  async queryWithCache(query, queryFn, params = {}) {
    const cacheKey = this.getCacheKey(query, params);
    const cached = this.getCached(cacheKey);
    if (cached !== null) {
      this.stats.hits++;
      return cached;
    }
    this.stats.misses++;
    const result = await queryFn();
    const category = this._getTTLCategory(query);
    const ttl = this.ttlPatterns[category];
    this.setCached(cacheKey, result, ttl, query);
    return result;
  }

  getCached(key) {
    const cached = this.cache.get(key);
    if (!cached) return null;
    const meta = this.cacheMeta.get(key);
    if (!meta) return null;
    const now = Date.now();
    if (meta.expiresAt && now > meta.expiresAt) {
      this.cache.delete(key);
      this.cacheMeta.delete(key);
      this.stats.expirations++;
      return null;
    }
    return cached;
  }

  setCached(key, value, ttl, query = '') {
    const now = Date.now();
    const expiresAt = now + ttl;
    this.cache.set(key, value);
    this.cacheMeta.set(key, {
      createdAt: now,
      expiresAt,
      ttl,
      query,
      pattern: this._getTTLCategory(query),
    });
  }

  invalidateCache(pattern) {
    let count = 0;
    if (typeof pattern === 'string') {
      const lower = pattern.toLowerCase();
      for (const [key, meta] of this.cacheMeta.entries()) {
        if (meta.query.toLowerCase().includes(lower)) {
          this.cache.delete(key);
          this.cacheMeta.delete(key);
          count++;
        }
      }
    } else if (pattern instanceof RegExp) {
      for (const [key, meta] of this.cacheMeta.entries()) {
        if (pattern.test(meta.query)) {
          this.cache.delete(key);
          this.cacheMeta.delete(key);
          count++;
        }
      }
    }
    this.stats.invalidations += count;
    return count;
  }

  async warmupCache() {
    if (!this.vaultIndexer) return 0;
    const commonPatterns = [
      { query: 'ideas', fn: () => this._searchVault('ideas') },
      { query: 'skills', fn: () => this._searchVault('skills') },
      { query: 'recent', fn: () => this._searchVault('recent') },
      { query: 'urgent', fn: () => this._searchVault('urgent') },
      { query: 'api', fn: () => this._searchVault('api') },
      { query: 'database', fn: () => this._searchVault('database') },
      { query: 'config', fn: () => this._searchVault('config') },
      { query: 'templates', fn: () => this._searchVault('templates') },
      { query: 'projects', fn: () => this._searchVault('projects') },
      { query: 'archive', fn: () => this._searchVault('archive') },
    ];
    let warmedUp = 0;
    for (const pattern of commonPatterns) {
      try {
        await this.queryWithCache(pattern.query, pattern.fn);
        warmedUp++;
      } catch (err) {
        // Silent fail
      }
    }
    this.stats.warmups += warmedUp;
    return warmedUp;
  }

  async _searchVault(query) {
    if (!this.vaultIndexer) return [];
    const results = [];
    const lower = query.toLowerCase();
    const metadata = this.vaultIndexer.index?.metadata || {};
    for (const [filePath, meta] of Object.entries(metadata)) {
      const relevance = this._computeRelevance(meta, lower);
      if (relevance > 0) {
        results.push({ filePath, relevance, ...meta });
      }
    }
    return results.sort((a, b) => b.relevance - a.relevance);
  }

  _computeRelevance(metadata, query) {
    let score = 0;
    if (metadata.tags && metadata.tags.some(t => t.includes(query))) {
      score += 30;
    }
    if (metadata.keywords && metadata.keywords.some(k => k.includes(query))) {
      score += 20;
    }
    if (metadata.title && metadata.title.toLowerCase().includes(query)) {
      score += 10;
    }
    if (metadata.snippet && metadata.snippet.toLowerCase().includes(query)) {
      score += 5;
    }
    return Math.min(100, score);
  }

  getCacheStats() {
    const total = this.stats.hits + this.stats.misses;
    const hitRate = total > 0 ? (this.stats.hits / total * 100).toFixed(2) : '0.00';
    return {
      ...this.stats,
      hitRate: `${hitRate}%`,
      cacheSize: this.cache.size,
      memoryEstimate: this._estimateMemory(),
      topPatterns: this._getTopPatterns(),
    };
  }

  _estimateMemory() {
    let bytes = 0;
    for (const value of this.cache.values()) {
      bytes += JSON.stringify(value).length;
    }
    return `${(bytes / 1024).toFixed(2)} KB`;
  }

  _getTopPatterns() {
    const patternCounts = {};
    for (const meta of this.cacheMeta.values()) {
      const pattern = meta.pattern || 'unknown';
      patternCounts[pattern] = (patternCounts[pattern] || 0) + 1;
    }
    return Object.entries(patternCounts)
      .map(([pattern, count]) => ({ pattern, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }

  clearCache() {
    const size = this.cache.size;
    this.cache.clear();
    this.cacheMeta.clear();
    this.stats.invalidations += size;
    return size;
  }

  async saveCache() {
    try {
      const dir = this.cachePath.substring(0, this.cachePath.lastIndexOf('/'));
      await fs.mkdir(dir, { recursive: true });
      const cacheData = {
        version: '1.0',
        savedAt: new Date().toISOString(),
        entries: Array.from(this.cache.entries()).map(([key, value]) => ({
          key,
          value,
          meta: this.cacheMeta.get(key),
        })),
      };
      const tmpPath = `${this.cachePath}.tmp`;
      await fs.writeFile(tmpPath, JSON.stringify(cacheData, null, 2));
      await fs.rename(tmpPath, this.cachePath);
      return true;
    } catch (err) {
      return false;
    }
  }

  async loadCache() {
    try {
      const data = await fs.readFile(this.cachePath, 'utf8');
      const cacheData = JSON.parse(data);
      if (cacheData.version !== '1.0') {
        return false;
      }
      const now = Date.now();
      for (const entry of cacheData.entries) {
        if (entry.meta.expiresAt && now > entry.meta.expiresAt) {
          continue;
        }
        this.cache.set(entry.key, entry.value);
        this.cacheMeta.set(entry.key, entry.meta);
      }
      return true;
    } catch (err) {
      return false;
    }
  }

  resetStats() {
    this.stats = {
      hits: 0,
      misses: 0,
      invalidations: 0,
      warmups: 0,
      expirations: 0,
    };
  }
}

export { VaultQueryCache };
