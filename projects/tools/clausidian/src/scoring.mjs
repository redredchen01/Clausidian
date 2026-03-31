/**
 * Shared scoring utilities — TF-IDF, keyword extraction, relatedness scoring
 * Consolidates scoring logic used across index-manager, vault, and commands
 */

/**
 * Build TF-IDF weights from notes
 * @param {Array<Object>} notes - All notes with tags
 * @param {string} excludeType - Note type to exclude (e.g., 'journal')
 * @returns {Object} tagIDF map with tag -> IDF weight
 */
export function buildTagIDF(notes, excludeType = 'journal') {
  const filtered = notes.filter(n => n.type !== excludeType && n.tags.length > 0);
  const tagDF = {};

  for (const n of filtered) {
    for (const t of n.tags) {
      tagDF[t] = (tagDF[t] || 0) + 1;
    }
  }

  const totalNotes = filtered.length || 1;
  const tagIDF = {};
  for (const [tag, df] of Object.entries(tagDF)) {
    tagIDF[tag] = Math.log(totalNotes / df);
  }

  return tagIDF;
}

/**
 * Extract keywords from text (3+ chars, including CJK)
 * @param {string} text - Text to extract from
 * @param {number} maxWords - Max words to return (null = no limit)
 * @returns {Set<string>} Set of keywords
 */
export function extractKeywords(text, maxWords = null) {
  const words = text.toLowerCase().match(/[a-z\u4e00-\u9fff]{3,}/g) || [];
  const set = new Set(maxWords ? words.slice(0, maxWords) : words);
  return set;
}

/**
 * Score relatedness between two notes
 * @param {Object} note1 - First note (must have tags, optional body)
 * @param {Object} note2 - Second note (must have tags, optional body)
 * @param {Object} tagIDF - TF-IDF weights from buildTagIDF
 * @returns {Object} {score, shared} where score is float and shared is array of tags
 */
export function scoreRelatedness(note1, note2, tagIDF) {
  let score = 0;
  const shared = [];

  // Tag overlap with TF-IDF weighting
  for (const t of note1.tags) {
    if (note2.tags.includes(t)) {
      score += tagIDF[t] || 1;
      shared.push(t);
    }
  }

  // Keyword co-occurrence in body (if available)
  if (note1.body && note2.body) {
    const words1 = extractKeywords(note1.body, 500);
    const words2 = extractKeywords(note2.body, 500);
    let overlap = 0;
    for (const w of words1) {
      if (words2.has(w)) overlap++;
    }
    // Cap keyword bonus at +2
    score += Math.min(overlap * 0.1, 2);
  }

  return { score, shared };
}

/**
 * Calculate keyword co-occurrence bonus
 * @param {Set<string>} kwA - Keyword set A
 * @param {Set<string>} kwB - Keyword set B
 * @returns {number} Overlap count (capped at +2 when multiplied by 0.1)
 */
export function calculateKeywordOverlap(kwA, kwB) {
  if (!kwA || !kwB) return 0;
  let overlap = 0;
  for (const w of kwA) {
    if (kwB.has(w)) overlap++;
  }
  return Math.min(overlap * 0.1, 2);
}
