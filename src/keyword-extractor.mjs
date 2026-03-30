/**
 * Keyword extraction for lazy body text processing
 * Defers keyword analysis until needed for link suggestions
 */

/**
 * Extract keywords from note body text
 * @param {string} body - Note body content
 * @returns {Set<string>} Extracted keywords (3+ chars, lowercased)
 */
export function extractKeywords(body) {
  if (!body) return new Set();

  const text = body.toLowerCase();
  const keywords = new Set();

  // Match 3+ char words (Latin + CJK)
  const matches = text.match(/[a-z\u4e00-\u9fff]{3,}/g) || [];
  for (const word of matches) {
    keywords.add(word);
  }

  return keywords;
}

/**
 * Calculate keyword overlap between two sets
 * @param {Set<string>} a - First keyword set
 * @param {Set<string>} b - Second keyword set
 * @returns {number} Overlap count
 */
export function keywordOverlap(a, b) {
  if (!a || !b) return 0;
  let overlap = 0;
  for (const w of a) {
    if (b.has(w)) overlap++;
  }
  return overlap;
}
