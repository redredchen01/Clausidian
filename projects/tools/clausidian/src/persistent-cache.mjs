/**
 * PersistentCache — Disk-based caching for graph operations
 *
 * Persists similarity scoring results to disk to avoid cold-start penalties
 * when MCP restarts (e.g., during server reload or new Claude session).
 * Cache is invalidated when note count or important timestamps change.
 */

import { writeFileSync, readFileSync, existsSync, unlinkSync, mkdirSync } from 'fs';
import { dirname } from 'path';

export class PersistentCache {
  constructor(cacheDir = '.clausidian/cache') {
    this.cacheDir = cacheDir;
    this.cacheFile = `${cacheDir}/graph-cache.json`;
    this.ensureCacheDir();
  }

  ensureCacheDir() {
    if (!existsSync(this.cacheDir)) {
      mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  /**
   * Generate cache key from vault state
   * @param {number} noteCount - Total notes in vault
   * @param {string} lastModified - Latest note modified timestamp
   * @returns {string} Cache key
   */
  getCacheKey(noteCount, lastModified) {
    return `notes:${noteCount}:${lastModified}`;
  }

  /**
   * Save scoring results to disk
   * @param {Object} key - Cache key object {noteCount, lastModified}
   * @param {Object} results - SimilarityEngine results {suggested, stats}
   */
  save(key, results) {
    try {
      const cacheKey = this.getCacheKey(key.noteCount, key.lastModified);
      const data = {
        version: 1,
        key: cacheKey,
        timestamp: new Date().toISOString(),
        results,
      };
      writeFileSync(this.cacheFile, JSON.stringify(data, null, 2));
    } catch (err) {
      // Fail silently - cache is optional
      console.warn(`Failed to save cache: ${err.message}`);
    }
  }

  /**
   * Load scoring results from disk if valid
   * @param {Object} key - Cache key object {noteCount, lastModified}
   * @returns {Object|null} Cached results or null if invalid/missing
   */
  load(key) {
    try {
      if (!existsSync(this.cacheFile)) return null;

      const data = JSON.parse(readFileSync(this.cacheFile, 'utf8'));
      const cacheKey = this.getCacheKey(key.noteCount, key.lastModified);

      // Validate cache key matches
      if (data.key !== cacheKey) return null;

      // Validate cache age (24h TTL)
      const cacheAge = Date.now() - new Date(data.timestamp).getTime();
      if (cacheAge > 24 * 60 * 60 * 1000) return null;

      return data.results;
    } catch (err) {
      // Return null on any error
      return null;
    }
  }

  /**
   * Check if cache exists and is valid
   * @param {Object} key - Cache key object
   * @returns {boolean}
   */
  isValid(key) {
    return this.load(key) !== null;
  }

  /**
   * Clear cache file
   */
  clear() {
    try {
      if (existsSync(this.cacheFile)) {
        unlinkSync(this.cacheFile);
      }
    } catch (err) {
      // Fail silently
    }
  }
}
