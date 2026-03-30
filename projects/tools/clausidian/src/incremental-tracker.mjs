/**
 * IncrementalTracker — tracks dirty notes for incremental graph rebuilds
 *
 * Maintains a set of files that changed since the last rebuild, enabling
 * scorePairs() to skip unchanged pairs entirely.
 */

export class IncrementalTracker {
  constructor() {
    this.dirtySet = new Set();
  }

  /**
   * Mark a file as changed
   * @param {string} file - File path to mark dirty
   */
  markDirty(file) {
    this.dirtySet.add(file);
  }

  /**
   * Mark multiple files as changed
   * @param {Array<string>} files - File paths to mark dirty
   */
  markDirtyBulk(files) {
    for (const f of files) {
      this.dirtySet.add(f);
    }
  }

  /**
   * Get current dirty set
   * @returns {Set<string>} Files marked as changed
   */
  getDirtySet() {
    return new Set(this.dirtySet);
  }

  /**
   * Check if a file is marked as dirty
   * @param {string} file - File to check
   * @returns {boolean}
   */
  isDirty(file) {
    return this.dirtySet.has(file);
  }

  /**
   * Check if any files are marked dirty
   * @returns {boolean}
   */
  hasDirty() {
    return this.dirtySet.size > 0;
  }

  /**
   * Clear dirty set (call after rebuild completes)
   */
  clearDirty() {
    this.dirtySet.clear();
  }

  /**
   * Get count of dirty files
   * @returns {number}
   */
  count() {
    return this.dirtySet.size;
  }
}
