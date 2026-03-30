import { Vault } from '../vault.mjs';
import { BM25Index } from '../bm25.mjs';

/**
 * AI-powered context-aware suggestions based on recent activity
 * Analyzes vault patterns and recommends next actions
 *
 * @type {import('../types').CliCommand}
 */
export default {
  name: 'smart-suggest',
  description: 'Context-aware suggestions: tag patterns, related notes, next actions',
  flags: {
    'limit': 'Number of suggestions (default: 10)',
    'type': 'Filter by note type (area/project/resource/idea)',
    'days': 'Look back N days (default: 7)',
  },

  async run(vaultPath, flags, positional) {
    const vault = new Vault(vaultPath);
    const limit = parseInt(flags.limit || '10');
    const filterType = flags.type || null;
    const days = parseInt(flags.days || '7');

    const allNotes = vault.scanNotes({ includeBody: true });
    if (!allNotes.length) {
      return { success: true, suggestions: [] };
    }

    // Filter by type if specified
    const notes = filterType
      ? allNotes.filter(n => n.type === filterType)
      : allNotes;

    // Analyze patterns
    const suggestions = [];

    // 1. Tag pattern analysis
    const tagFreq = analyzeTagPatterns(notes);
    const tagSuggestions = getTagSuggestions(tagFreq, notes);
    suggestions.push(...tagSuggestions.slice(0, Math.ceil(limit * 0.3)));

    // 2. Related notes analysis
    const relatedSuggestions = getRelatedNoteSuggestions(vault, notes);
    suggestions.push(...relatedSuggestions.slice(0, Math.ceil(limit * 0.3)));

    // 3. Stale notes that need attention
    const staleSuggestions = getStaleSuggestions(notes, days);
    suggestions.push(...staleSuggestions.slice(0, Math.ceil(limit * 0.2)));

    // 4. Unlinked notes that might need connections
    const unlinkSuggestions = getUnlinkedSuggestions(notes);
    suggestions.push(...unlinkSuggestions.slice(0, Math.ceil(limit * 0.2)));

    // Sort by score and limit
    suggestions.sort((a, b) => b.score - a.score);
    const result = suggestions.slice(0, limit);

    if (flags.json) {
      return result;
    }

    // Pretty print
    console.log(`\n📊 Smart Suggestions for ${filterType || 'all'} notes\n`);
    result.forEach((s, i) => {
      console.log(`${i + 1}. ${s.title}`);
      console.log(`   Category: ${s.category}`);
      console.log(`   Action: ${s.action}`);
      console.log(`   Score: ${s.score.toFixed(2)}`);
      console.log('');
    });

    return { success: true, count: result.length, suggestions: result };
  }
};

/**
 * Analyze tag frequency patterns
 * @param {Array} notes - All notes
 * @returns {Object} Tag → frequency mapping
 */
function analyzeTagPatterns(notes) {
  const freq = {};
  const cooccurrence = {};

  notes.forEach(note => {
    if (!note.tags || !Array.isArray(note.tags)) return;

    // Count frequency
    note.tags.forEach(tag => {
      freq[tag] = (freq[tag] || 0) + 1;
    });

    // Track co-occurrence (tags appearing together)
    for (let i = 0; i < note.tags.length; i++) {
      for (let j = i + 1; j < note.tags.length; j++) {
        const pair = [note.tags[i], note.tags[j]].sort().join('|');
        cooccurrence[pair] = (cooccurrence[pair] || 0) + 1;
      }
    }
  });

  return { freq, cooccurrence };
}

/**
 * Generate tag-related suggestions
 * @param {Object} analysis - Tag frequency analysis
 * @param {Array} notes - All notes
 * @returns {Array} Suggestion objects
 */
function getTagSuggestions(analysis, notes) {
  const suggestions = [];
  const { freq, cooccurrence } = analysis;

  // Find frequently co-occurring tags
  Object.entries(cooccurrence)
    .filter(([_, count]) => count >= 2)
    .forEach(([pair, count]) => {
      const [tag1, tag2] = pair.split('|');
      const notesWithBoth = notes.filter(n =>
        n.tags && n.tags.includes(tag1) && n.tags.includes(tag2)
      ).length;

      suggestions.push({
        title: `Consolidate tags: "${tag1}" + "${tag2}"`,
        category: 'Tag Management',
        action: `Consider if these ${notesWithBoth} notes should share a parent tag`,
        score: count * 0.8,
        tags: [tag1, tag2],
      });
    });

  // Find rare tags (used only once) that could be merged
  Object.entries(freq)
    .filter(([_, count]) => count === 1)
    .slice(0, 3)
    .forEach(([tag, _]) => {
      suggestions.push({
        title: `Review singleton tag: "${tag}"`,
        category: 'Tag Cleanup',
        action: 'This tag appears only once. Consider removing or renaming',
        score: 1.0,
        tag,
      });
    });

  return suggestions;
}

/**
 * Find related notes that should be linked
 * @param {Vault} vault - Vault instance
 * @param {Array} notes - All notes
 * @returns {Array} Suggestion objects
 */
function getRelatedNoteSuggestions(vault, notes) {
  const suggestions = [];
  const checked = new Set();

  notes.forEach(note => {
    const related = vault.findRelated(note, 5);

    // Find pairs that share tags but aren't linked
    related.forEach(rel => {
      const pair = [note.filename, rel.filename].sort().join('|');
      if (checked.has(pair)) return;
      checked.add(pair);

      const sharedTags = (note.tags || []).filter(t =>
        (rel.tags || []).includes(t)
      );

      if (sharedTags.length >= 2 && !note.related?.includes(`[[${rel.filename}]]`)) {
        suggestions.push({
          title: `Link: [[${note.filename}]] ↔ [[${rel.filename}]]`,
          category: 'Relationship',
          action: `Both notes use tags: ${sharedTags.join(', ')}`,
          score: sharedTags.length * 2,
          notes: [note.filename, rel.filename],
          sharedTags,
        });
      }
    });
  });

  return suggestions;
}

/**
 * Find notes that haven't been updated recently
 * @param {Array} notes - All notes
 * @param {number} days - Lookback period in days
 * @returns {Array} Suggestion objects
 */
function getStaleSuggestions(notes, days) {
  const suggestions = [];
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const stale = notes.filter(n => {
    if (!n.updated) return false;
    const updated = new Date(n.updated);
    return updated < cutoff && n.status !== 'archived';
  });

  stale.slice(0, 5).forEach(note => {
    const daysAgo = Math.floor(
      (Date.now() - new Date(note.updated).getTime()) / (1000 * 60 * 60 * 24)
    );

    suggestions.push({
      title: `Review stale note: [[${note.filename}]]`,
      category: 'Maintenance',
      action: `Last updated ${daysAgo} days ago. Still relevant?`,
      score: Math.min(daysAgo / 30, 5),
      note: note.filename,
      daysAgo,
    });
  });

  return suggestions;
}

/**
 * Find notes with no inbound links
 * @param {Array} notes - All notes
 * @returns {Array} Suggestion objects
 */
function getUnlinkedSuggestions(notes) {
  const suggestions = [];
  const linked = new Set();

  // Track all referenced notes
  notes.forEach(n => {
    if (!n.related) return;
    n.related.forEach(ref => {
      const match = ref.match(/\[\[([^\]]+)\]\]/);
      if (match) linked.add(match[1]);
    });
  });

  // Find orphaned notes
  const orphans = notes.filter(n =>
    !linked.has(n.filename) && n.status !== 'archived'
  );

  orphans.slice(0, 5).forEach(note => {
    suggestions.push({
      title: `Connect orphaned note: [[${note.filename}]]`,
      category: 'Connectivity',
      action: `No other notes link to this. Should it be connected?`,
      score: 3,
      note: note.filename,
    });
  });

  return suggestions;
}
