/**
 * Selective cache invalidation strategy
 * Replaces vault-wide invalidation with per-note invalidation
 */

/**
 * Selective cache invalidation for vault notes
 * Only clears indices for affected notes, not entire vault
 */
export class SelectiveInvalidation {
  constructor() {
    this.noteDirty = new Map();  // noteId → { tags, graph, updated }
  }

  /**
   * Mark a note as dirty (needs index rebuild)
   * @param {string} noteId - Note file identifier
   * @param {Array<string>} indices - Which indices are affected: ['tags', 'graph']
   */
  markDirty(noteId, indices = ['tags', 'graph']) {
    if (!this.noteDirty.has(noteId)) {
      this.noteDirty.set(noteId, { updated: Date.now() });
    }
    const entry = this.noteDirty.get(noteId);
    for (const idx of indices) {
      entry[idx] = true;
    }
  }

  /**
   * Get all notes needing index rebuild for a specific index
   * @param {string} indexType - Index type: 'tags' or 'graph'
   * @returns {Array<string>} Note IDs that need rebuild
   */
  getDirty(indexType = 'tags') {
    const result = [];
    for (const [noteId, entry] of this.noteDirty) {
      if (entry[indexType]) result.push(noteId);
    }
    return result;
  }

  /**
   * Check if a note is dirty for a specific index
   * @param {string} noteId - Note file identifier
   * @param {string} indexType - Index type: 'tags' or 'graph'
   * @returns {boolean} True if dirty
   */
  isDirty(noteId, indexType = 'tags') {
    const entry = this.noteDirty.get(noteId);
    return entry && entry[indexType];
  }

  /**
   * Clear dirty marker for a note
   * @param {string} noteId - Note file identifier
   * @param {Array<string>} [indices] - Which indices to clear (all if omitted)
   */
  clearDirty(noteId, indices) {
    if (!this.noteDirty.has(noteId)) return;
    const entry = this.noteDirty.get(noteId);
    if (indices) {
      for (const idx of indices) delete entry[idx];
      if (Object.keys(entry).length === 1) this.noteDirty.delete(noteId);  // only 'updated' left
    } else {
      this.noteDirty.delete(noteId);
    }
  }

  /**
   * Clear all dirty markers
   */
  clearAll() {
    this.noteDirty.clear();
  }

  /**
   * Get invalidation stats
   */
  stats() {
    const tagsDirty = Array.from(this.noteDirty.values()).filter(e => e.tags).length;
    const graphDirty = Array.from(this.noteDirty.values()).filter(e => e.graph).length;
    return {
      totalDirty: this.noteDirty.size,
      tagsDirty,
      graphDirty,
    };
  }
}
