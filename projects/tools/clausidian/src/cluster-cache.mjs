import crypto from 'crypto';
import { statSync } from 'fs';
import { join } from 'path';

/**
 * ClusterCache - Vault-level cache wrapper with version tracking
 * Decorates SearchCache and invalidates on vault structure changes
 */
export class ClusterCache {
  /**
   * Create a new ClusterCache
   * @param {Vault} vault - Reference to the Vault instance
   * @param {Object} options - Configuration options
   * @param {number} options.ttl - Time-to-live in milliseconds
   */
  constructor(vault, options = {}) {
    this.vault = vault;
    this._searchCache = vault._searchCache;
    this._currentVersion = this._computeVaultVersion();
  }

  /**
   * Compute vault version based on _tags.md and _graph.md modification times
   * @private
   * @returns {string} SHA256 hash of combined mtime values
   */
  _computeVaultVersion() {
    try {
      const tagsPath = join(this.vault.root, '_tags.md');
      const graphPath = join(this.vault.root, '_graph.md');

      const stats1 = statSync(tagsPath);
      const stats2 = statSync(graphPath);

      const combined = `${stats1.mtime.getTime()}|${stats2.mtime.getTime()}`;
      return crypto.createHash('sha256').update(combined).digest('hex');
    } catch {
      return 'unknown';
    }
  }

  /**
   * Get current vault version
   * @returns {string} Current vault version hash
   */
  currentVersion() {
    return this._computeVaultVersion();
  }

  /**
   * Retrieve cached search result with version check
   * Returns null if version mismatch or cache miss
   * @param {string} keyword - Search keyword
   * @param {Object} opts - Search options
   * @returns {Array|null} Cached results or null
   */
  get(keyword, opts = {}) {
    const version = this.currentVersion();

    // Version mismatch triggers cache invalidation
    if (version !== this._currentVersion) {
      this.invalidate(null);
      return null;
    }

    return this._searchCache.get(keyword, opts);
  }

  /**
   * Store search result in cache
   * @param {string} keyword - Search keyword
   * @param {Object} opts - Search options
   * @param {Array} results - Search results to cache
   */
  set(keyword, opts = {}, results) {
    this._searchCache.set(keyword, opts, results);
  }

  /**
   * Invalidate cache entries
   * Optionally selective based on dirty notes (not yet implemented)
   * @param {Set|null} dirtyNotes - Optional set of dirty note paths
   */
  invalidate(dirtyNotes = null) {
    // Update version after invalidation
    this._currentVersion = this.currentVersion();

    // For now, full invalidation (selective invalidation deferred)
    this._searchCache.invalidate();
  }

  /**
   * Get cache statistics including vault version
   * @returns {Object} Cache stats with vaultVersion field
   */
  stats() {
    const baseStats = this._searchCache.stats();
    return {
      ...baseStats,
      vaultVersion: this._currentVersion
    };
  }

  /**
   * Serialize cache state for persistence
   * @returns {Object} Serializable cache state
   */
  toDisk() {
    const state = this._searchCache.toDisk();
    return {
      ...state,
      vaultVersion: this._currentVersion
    };
  }

  /**
   * Restore cache state from persisted data
   * @param {Object} state - Serialized cache state from toDisk()
   * @param {string} expectedVersion - Expected vault version for validation
   */
  fromDisk(state, expectedVersion = null) {
    if (!state) return;

    // Validate version if provided
    if (expectedVersion && state.vaultVersion !== expectedVersion) {
      return; // Stale cache, skip restoration
    }

    this._searchCache.fromDisk(state);
    this._currentVersion = state.vaultVersion || this.currentVersion();
  }
}
