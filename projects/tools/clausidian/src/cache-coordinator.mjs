/**
 * CacheCoordinator — Unified cache lifecycle management
 *
 * Coordinates 5 cache layers into a single coherent interface:
 * - L1: In-memory note cache (_notesCache, _notesCacheWithBody)
 * - L2: SearchCache (search results, 5min TTL)
 * - L3: ClusterCache (vault-version-aware wrapper)
 * - L4: PersistentCache (disk-based, 24h TTL, used by IndexManager)
 * - L5: IncrementalTracker (dirty note tracking)
 *
 * Responsibilities:
 * 1. Manage invalidation strategy (selective vs full)
 * 2. Maintain version numbers for cache coherency
 * 3. Track dirty notes for incremental operations
 * 4. Provide a clean API for the Vault
 *
 * Usage:
 *   const coord = new CacheCoordinator(vault);
 *   coord.markDirtyAndInvalidate('note-name', 'all');
 *   const dirty = coord.getDirty('tags');
 *   coord.clearDirty('tags');
 */

import { SearchCache } from './search-cache.mjs';
import { ClusterCache } from './cluster-cache.mjs';
import { PersistentCache } from './persistent-cache.mjs';
import { IncrementalTracker } from './incremental-tracker.mjs';

export class CacheCoordinator {
  constructor(vault) {
    this.vault = vault;

    // Use SearchCache already created in Vault (to avoid circular dependency)
    this.searchCache = vault._searchCache;

    // Initialize cache layers
    this.clusterCache = new ClusterCache(vault);
    this.persistentCache = new PersistentCache();
    this.tracker = new IncrementalTracker();

    // Version numbers for cache coherency (incremented when cache is invalidated)
    this.searchVersion = 0;   // Incremented when tags/search indices change
    this.graphVersion = 0;    // Incremented when graph structure changes
    this.tagsVersion = 0;     // Incremented when tag definitions change
  }

  /**
   * Mark a note as dirty and selectively invalidate caches
   * Called by Vault.write() when notes are modified
   *
   * @param {string} fileName - Note filename (without .md)
   * @param {string} indexType - Type of index affected ('all', 'tags', 'graph')
   */
  markDirtyAndInvalidate(fileName, indexType = 'all') {
    // Track the dirty note
    this.tracker.markDirty(fileName, indexType);

    // Increment relevant version numbers
    if (indexType === 'all' || indexType === 'tags') {
      this.tagsVersion++;
      this.searchVersion++;  // Tags change affects search results
    }
    if (indexType === 'all' || indexType === 'graph') {
      this.graphVersion++;
    }

    // Selectively clear caches (don't do full flush)
    this._selectiveInvalidate(indexType);
  }

  /**
   * Full cache invalidation (used when reliability > performance)
   * Called by Vault.invalidateCache() as a safety measure
   */
  fullInvalidate() {
    this.searchCache.invalidate();
    this.clusterCache.invalidate();
    // Don't clear persistentCache here (it has 24h TTL, let it expire naturally)

    this.tracker.clearAll?.();

    // Increment all version numbers
    this.searchVersion++;
    this.graphVersion++;
    this.tagsVersion++;
  }

  /**
   * Selectively invalidate specific cache layers
   * @private
   */
  _selectiveInvalidate(indexType) {
    if (indexType === 'all' || indexType === 'search' || indexType === 'tags') {
      this.searchCache.invalidate();
      this.clusterCache.invalidate();
    }
    if (indexType === 'all' || indexType === 'graph') {
      // Graph index changes invalidate persistent cache
      this.persistentCache.clear?.();
    }
  }

  /**
   * Get dirty notes for a specific index type
   * Called by IndexManager.rebuildGraph() to detect incremental changes
   *
   * @param {string} indexType - Type of index ('tags', 'graph', 'all')
   * @returns {Set} Set of dirty note filenames
   */
  getDirty(indexType) {
    return this.tracker.getDirty(indexType);
  }

  /**
   * Clear dirty node tracking (after successful rebuild)
   * Called by IndexManager after rebuildGraph() completes
   *
   * @param {Set|null} partial - Optional subset of notes to clear (null = clear all)
   */
  clearDirty(partial = null) {
    this.tracker.clearDirty(partial);
  }

  /**
   * Check if there are any dirty notes
   * @param {string} indexType - Type of index to check
   * @returns {boolean}
   */
  hasDirty(indexType = 'all') {
    return this.tracker.hasDirty(indexType);
  }

  /**
   * Get cache statistics (for diagnostics and debugging)
   * @returns {Object} Cache stats
   */
  getStats() {
    return {
      searchCache: {
        size: this.searchCache.cache?.size || 0,
        hits: this.searchCache.hits || 0,
        misses: this.searchCache.misses || 0
      },
      versions: {
        search: this.searchVersion,
        graph: this.graphVersion,
        tags: this.tagsVersion
      },
      dirty: {
        count: this.tracker.getDirty('all').size,
        tags: this.tracker.getDirty('tags').size,
        graph: this.tracker.getDirty('graph').size
      }
    };
  }
}
