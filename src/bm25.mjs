/**
 * BM25 search engine — zero-dependency relevance ranking
 *
 * Implements Okapi BM25 with an inverted index for fast retrieval.
 * Significantly better than keyword matching for multi-word queries.
 */

// Common English + Chinese stop words
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'shall', 'can', 'need', 'dare', 'ought',
  'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as',
  'into', 'through', 'during', 'before', 'after', 'above', 'below',
  'between', 'under', 'again', 'further', 'then', 'once',
  'and', 'but', 'or', 'nor', 'not', 'so', 'yet', 'both', 'either',
  'neither', 'each', 'every', 'all', 'any', 'few', 'more', 'most',
  'other', 'some', 'such', 'no', 'only', 'own', 'same', 'than',
  'too', 'very', 'just', 'because', 'if', 'when', 'where', 'how',
  'what', 'which', 'who', 'whom', 'this', 'that', 'these', 'those',
  'it', 'its', 'he', 'she', 'they', 'them', 'his', 'her', 'their',
  'my', 'your', 'our', 'me', 'him', 'us', 'we', 'you', 'i',
  'about', 'up', 'out', 'off', 'over', 'also',
  // Chinese
  '的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一',
  '一个', '上', '也', '很', '到', '说', '要', '去', '你', '会', '着',
  '没有', '看', '好', '自己', '这', '他', '她', '它', '们',
]);

/**
 * Unicode-aware tokenizer for mixed CJK + Latin text.
 */
export function tokenize(text) {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1 && !STOP_WORDS.has(w));
}

/**
 * Simple English stemmer — strips common suffixes.
 * Not as good as Porter but zero-dependency and handles 80% of cases.
 */
function stem(word) {
  if (word.length < 4) return word;
  if (word.endsWith('ing') && word.length > 5) return word.slice(0, -3);
  if (word.endsWith('tion')) return word.slice(0, -4);
  if (word.endsWith('sion')) return word.slice(0, -4);
  if (word.endsWith('ness')) return word.slice(0, -4);
  if (word.endsWith('ment')) return word.slice(0, -4);
  if (word.endsWith('able')) return word.slice(0, -4);
  if (word.endsWith('ible')) return word.slice(0, -4);
  if (word.endsWith('ies') && word.length > 4) return word.slice(0, -3) + 'y';
  if (word.endsWith('ed') && word.length > 4) return word.slice(0, -2);
  if (word.endsWith('ly') && word.length > 4) return word.slice(0, -2);
  if (word.endsWith('er') && word.length > 4) return word.slice(0, -2);
  if (word.endsWith('es') && word.length > 4) return word.slice(0, -2);
  if (word.endsWith('s') && !word.endsWith('ss') && word.length > 3) return word.slice(0, -1);
  return word;
}

/**
 * Tokenize + stem a text string.
 */
export function analyze(text) {
  return tokenize(text).map(stem);
}

export class BM25Index {
  constructor({ k1 = 1.2, b = 0.75 } = {}) {
    this.k1 = k1;
    this.b = b;
    this.invertedIndex = new Map();  // term → [{docId, tf}, ...]
    this.docLengths = [];
    this.docMeta = [];               // [{file, title, type, ...}]
    this.avgDL = 0;
    this.docCount = 0;
  }

  /**
   * Build index from vault notes.
   * @param {Array} notes - from vault.scanNotes({ includeBody: true })
   */
  build(notes) {
    this.invertedIndex.clear();
    this.docLengths = [];
    this.docMeta = [];

    for (let docId = 0; docId < notes.length; docId++) {
      const note = notes[docId];
      // Weight different fields: title × 3, tags × 2, summary × 2, body × 1
      const titleTokens = analyze(note.title || '');
      const tagTokens = (note.tags || []).flatMap(t => analyze(t));
      const summaryTokens = analyze(note.summary || '');
      const bodyTokens = analyze(note.body || '');

      const allTokens = [
        ...titleTokens, ...titleTokens, ...titleTokens,  // 3× weight
        ...tagTokens, ...tagTokens,                       // 2× weight
        ...summaryTokens, ...summaryTokens,               // 2× weight
        ...bodyTokens,
      ];

      this.docLengths.push(allTokens.length);
      this.docMeta.push({
        file: note.file,
        title: note.title,
        type: note.type,
        status: note.status,
        summary: note.summary,
        tags: note.tags,
      });

      // Build inverted index
      const termFreqs = new Map();
      for (const token of allTokens) {
        termFreqs.set(token, (termFreqs.get(token) || 0) + 1);
      }
      for (const [term, tf] of termFreqs) {
        if (!this.invertedIndex.has(term)) this.invertedIndex.set(term, []);
        this.invertedIndex.get(term).push({ docId, tf });
      }
    }

    this.docCount = notes.length;
    this.avgDL = this.docLengths.length > 0
      ? this.docLengths.reduce((a, b) => a + b, 0) / this.docLengths.length
      : 0;
  }

  /**
   * IDF for a term.
   */
  idf(term) {
    const df = this.invertedIndex.get(term)?.length || 0;
    return Math.log((this.docCount - df + 0.5) / (df + 0.5) + 1);
  }

  /**
   * Search with BM25 scoring.
   * @param {string} query - search query
   * @param {Object} opts - { type, tag, status, limit }
   * @returns {Array<{file, title, type, status, summary, score}>}
   */
  search(query, { type, tag, status, limit = 20 } = {}) {
    const queryTerms = analyze(query);
    if (queryTerms.length === 0) return [];

    const scores = new Float64Array(this.docCount);

    for (const term of queryTerms) {
      const postings = this.invertedIndex.get(term);
      if (!postings) continue;
      const termIdf = this.idf(term);

      for (const { docId, tf } of postings) {
        const dl = this.docLengths[docId];
        const numerator = tf * (this.k1 + 1);
        const denominator = tf + this.k1 * (1 - this.b + this.b * dl / this.avgDL);
        scores[docId] += termIdf * numerator / denominator;
      }
    }

    // Pre-compile filter predicates to avoid repeated checks
    const typeFilter = type ? (m) => m.type === type : null;
    const tagFilter = tag ? (m) => (m.tags || []).includes(tag) : null;
    const statusFilter = status ? (m) => m.status === status : null;

    // Collect and filter results
    const results = [];
    for (let i = 0; i < this.docCount; i++) {
      if (scores[i] <= 0) continue;
      const meta = this.docMeta[i];
      if (typeFilter && !typeFilter(meta)) continue;
      if (statusFilter && !statusFilter(meta)) continue;
      if (tagFilter && !tagFilter(meta)) continue;
      results.push({ ...meta, score: Math.round(scores[i] * 100) / 100 });
    }

    // Sort by score descending
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }
}
