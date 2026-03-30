/**
 * SimilarityEngine — unified similarity scoring for notes
 *
 * Consolidates TF-IDF weighted scoring, keyword overlap, and link suggestion
 * logic that was previously duplicated across index-manager, link, and vault.
 */

import { buildTagIDF, extractKeywords, calculateKeywordOverlap } from './scoring.mjs';

export class SimilarityEngine {
  constructor(vault, options = {}) {
    this.vault = vault;
    this.includeBody = options.includeBody ?? false;
    this.minScore = options.minScore ?? 1.5;
    this.maxResults = options.maxResults ?? 25;

    // Cache for TF-IDF weights
    this.tfidfCache = null;
    this.tfidfVersion = null;
  }

  /**
   * Get or build TF-IDF weights (cached)
   */
  getTFIDF(notes) {
    // Check cache validity: if notes haven't changed, return cached
    const version = notes.map(n => `${n.file}:${n.tags.join(',')}` ).join('|');
    if (this.tfidfVersion === version) {
      return this.tfidfCache;
    }

    this.tfidfCache = buildTagIDF(notes, 'journal');
    this.tfidfVersion = version;
    return this.tfidfCache;
  }

  /**
   * Score all unlinked pairs and return suggested links
   *
   * @param {Array<Object>} notes - All notes from vault
   * @param {Object} options - Scoring options
   *   - incremental: boolean - if true, only score pairs involving dirty notes
   *   - dirtySet: Set<string> - files that changed (for incremental mode)
   * @returns {Array<Object>} Suggested links sorted by score
   */
  scorePairs(notes, options = {}) {
    // Filter non-journal notes with tags (handle both n.type and n.dir properties)
    const nonJournal = notes.filter(n => {
      const isJournal = n.type === 'journal' || n.dir === 'journal';
      return !isJournal && n.tags && n.tags.length > 0;
    });

    if (nonJournal.length < 2) return [];

    // Get TF-IDF weights (cached)
    const tagIDF = this.getTFIDF(notes);

    // Build keyword sets per note (with optional body limit)
    // Default: slice body to 500 chars for performance; includeBody=false disables body entirely
    const noteKeywords = new Map();
    for (const n of nonJournal) {
      let bodyText = '';
      if (this.includeBody !== false) {
        // includeBody unset or true: use 500 char default
        // This reduces O(N²×W²) keyword overlap calculation
        bodyText = (n.body || '').slice(0, 500);
      }
      const text = `${n.title} ${n.summary} ${bodyText}`;
      const words = extractKeywords(text);
      noteKeywords.set(n.file, words);
    }

    // Track existing links (bidirectional)
    const existingLinks = new Set();
    for (const n of nonJournal) {
      for (const rel of n.related) {
        existingLinks.add(`${n.file}→${rel}`);
        existingLinks.add(`${rel}→${n.file}`);
      }
      // Also check body wikilinks
      const wikilinks = (n.body || '').match(/\[\[([^\]]+)\]\]/g) || [];
      for (const w of wikilinks) {
        const target = w.slice(2, -2);
        existingLinks.add(`${n.file}→${target}`);
        existingLinks.add(`${target}→${n.file}`);
      }
    }

    // Determine which pairs to score
    let pairsToScore = [];
    if (options.incremental && options.dirtySet && options.dirtySet.size > 0) {
      // Incremental: only score pairs involving dirty notes
      for (let i = 0; i < nonJournal.length; i++) {
        const a = nonJournal[i];
        if (!options.dirtySet.has(a.file)) continue;

        for (let j = i + 1; j < nonJournal.length; j++) {
          const b = nonJournal[j];
          if (!existingLinks.has(`${a.file}→${b.file}`)) {
            pairsToScore.push([a, b]);
          }
        }
      }
    } else {
      // Full scan: all pairs
      for (let i = 0; i < nonJournal.length; i++) {
        for (let j = i + 1; j < nonJournal.length; j++) {
          const a = nonJournal[i], b = nonJournal[j];
          if (!existingLinks.has(`${a.file}→${b.file}`)) {
            pairsToScore.push([a, b]);
          }
        }
      }
    }

    // Score all pairs
    const suggested = [];
    for (const [a, b] of pairsToScore) {
      let score = 0;
      const shared = [];

      // TF-IDF weighted tag overlap
      for (const t of a.tags) {
        if (b.tags.includes(t)) {
          score += tagIDF[t] || 1;
          shared.push(t);
        }
      }

      // Keyword co-occurrence bonus (capped at +2)
      score += calculateKeywordOverlap(noteKeywords.get(a.file), noteKeywords.get(b.file));

      // Filter: at least 1 shared tag AND score >= threshold
      if (shared.length >= 1 && score >= this.minScore) {
        suggested.push({
          a: a.file,
          b: b.file,
          shared,
          score: Math.round(score * 10) / 10,
        });
      }
    }

    // Sort by score descending
    suggested.sort((a, b) => b.score - a.score);

    return suggested.slice(0, this.maxResults);
  }

  /**
   * Score related notes for a given title and tags
   * Used by vault.findRelated() for search results
   *
   * @param {string} title - Search title
   * @param {Array<string>} tags - Search tags
   * @param {number} maxResults - Max results to return (default 5)
   * @returns {Array<Object>} Related notes sorted by score
   */
  findRelated(title, tags = [], maxResults = 5) {
    const notes = this.vault.scanNotes({ includeBody: true });
    const nonJournal = notes.filter(n => n.type !== 'journal');

    // Get TF-IDF weights
    const tagIDF = this.getTFIDF(notes);
    const titleWords = title.toLowerCase().split(/[\s-]+/).filter(w => w.length > 2);

    const results = nonJournal.map(n => {
      let score = 0;
      const nText = `${n.title} ${n.summary} ${n.body || ''}`.toLowerCase();

      // Title keyword matches (+1 each, +3 for exact title substring)
      for (const w of titleWords) {
        const re = new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        if (re.test(nText)) score += 1;
      }
      if (nText.includes(title.toLowerCase())) score += 3;

      // TF-IDF weighted tag matches
      for (const t of tags) {
        if (n.tags.includes(t)) score += tagIDF[t] || 2;
      }

      const { body, ...rest } = n;
      return { ...rest, score: Math.round(score * 10) / 10 };
    })
      .filter(n => n.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults);

    return results;
  }
}
