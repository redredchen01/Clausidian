/**
 * Cluster detection cache with TTL
 * Memoizes note→cluster mapping to avoid rebuilding per scoring loop
 */

/**
 * ClusterCache stores computed cluster assignments with TTL
 */
export class ClusterCache {
  constructor(ttlMs = 60 * 60 * 1000) { // 1 hour default
    this.cache = new Map();  // noteId → clusterId
    this.ttl = ttlMs;
    this.timestamp = null;
    this.vaultVersion = null;
  }

  /**
   * Get cached cluster ID for a note
   * @param {string} noteId - Note file identifier
   * @param {string} [vaultVersion] - Optional vault version to check staleness
   * @returns {string|null} Cluster ID or null if expired/missing
   */
  get(noteId, vaultVersion) {
    if (!this.cache.has(noteId)) return null;

    // Check TTL
    if (this.timestamp && Date.now() - this.timestamp > this.ttl) {
      this.clear();
      return null;
    }

    // Check vault version (invalidate on any vault change)
    if (vaultVersion && vaultVersion !== this.vaultVersion) {
      this.clear();
      return null;
    }

    return this.cache.get(noteId);
  }

  /**
   * Set cluster ID for a note
   * @param {string} noteId - Note file identifier
   * @param {string} clusterId - Cluster ID (root of union-find)
   * @param {string} [vaultVersion] - Current vault version
   */
  set(noteId, clusterId, vaultVersion) {
    this.cache.set(noteId, clusterId);
    this.timestamp = Date.now();
    this.vaultVersion = vaultVersion;
  }

  /**
   * Bulk load cluster map
   * @param {Map<string, string>} clusterMap - noteId → clusterId mapping
   * @param {string} [vaultVersion] - Current vault version
   */
  load(clusterMap, vaultVersion) {
    this.cache = new Map(clusterMap);
    this.timestamp = Date.now();
    this.vaultVersion = vaultVersion;
  }

  /**
   * Check if cache is valid (not expired, version matches)
   * @param {string} [vaultVersion] - Current vault version
   * @returns {boolean} True if cache is valid
   */
  isValid(vaultVersion) {
    if (this.cache.size === 0) return false;
    if (this.timestamp && Date.now() - this.timestamp > this.ttl) return false;
    if (vaultVersion && vaultVersion !== this.vaultVersion) return false;
    return true;
  }

  /**
   * Invalidate specific cluster entries
   * @param {Array<string>} noteIds - Notes to remove from cache
   */
  invalidate(noteIds) {
    for (const id of noteIds) {
      this.cache.delete(id);
    }
  }

  /**
   * Clear all cached clusters
   */
  clear() {
    this.cache.clear();
    this.timestamp = null;
    this.vaultVersion = null;
  }

  /**
   * Get cache stats
   */
  stats() {
    return {
      size: this.cache.size,
      ttlMs: this.ttl,
      ageMs: this.timestamp ? Date.now() - this.timestamp : null,
      valid: this.isValid(),
    };
  }
}
