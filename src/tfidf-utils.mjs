/**
 * TF-IDF Index — unified term frequency-inverse document frequency weighting
 */

export class TFIDFIndex {
  constructor() {
    this.documentFrequency = {};
    this.inverseFrequency = {};
    this.totalDocuments = 0;
  }

  /**
   * Build TF-IDF index from documents.
   * @param {Array<Object>} documents - Array of {tag, docId}
   * @returns {void}
   */
  build(documents) {
    this.documentFrequency = {};
    this.totalDocuments = 0;

    // Count document frequency per tag
    const seenDocs = new Set();
    for (const doc of documents) {
      const key = `${doc.tag}|${doc.docId}`;
      if (!seenDocs.has(key)) {
        this.documentFrequency[doc.tag] = (this.documentFrequency[doc.tag] || 0) + 1;
        seenDocs.add(key);
      }
    }

    // Count total unique documents
    this.totalDocuments = new Set(documents.map(d => d.docId)).size;

    // Calculate IDF (Inverse Document Frequency)
    this.inverseFrequency = {};
    for (const [tag, df] of Object.entries(this.documentFrequency)) {
      this.inverseFrequency[tag] = Math.log(this.totalDocuments / df);
    }
  }

  /**
   * Score a single tag by its IDF weight.
   * @param {string} tag - Tag to score
   * @returns {number} IDF weight (default 1 if tag not in index)
   */
  score(tag) {
    return this.inverseFrequency[tag] ?? 1;
  }

  /**
   * Get all document weights for a set of tags.
   * @param {Array<string>} tags - Tags to weight
   * @returns {Array<{tag: string, weight: number}>} Sorted by weight descending
   */
  getAllDocWeights(tags) {
    return tags
      .map(tag => ({ tag, weight: this.score(tag) }))
      .sort((a, b) => b.weight - a.weight);
  }

  /**
   * Get document frequency for a tag.
   * @param {string} tag - Tag to check
   * @returns {number} Number of documents containing tag
   */
  getDocumentFrequency(tag) {
    return this.documentFrequency[tag] ?? 0;
  }

  /**
   * Get inverse frequency for a tag.
   * @param {string} tag - Tag to check
   * @returns {number} IDF weight
   */
  getInverseFrequency(tag) {
    return this.inverseFrequency[tag] ?? 1;
  }
}
