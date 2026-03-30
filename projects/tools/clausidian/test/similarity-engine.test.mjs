/**
 * Test similarity-engine — unified scoring logic
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Vault } from '../src/vault.mjs';
import { SimilarityEngine } from '../src/similarity-engine.mjs';

// Mock notes for testing
const mockNotes = [
  {
    file: 'note-a',
    type: 'resource',
    title: 'JavaScript Fundamentals',
    summary: 'Core concepts of JS',
    body: 'JavaScript is a programming language. Variables, functions, closures.',
    tags: ['javascript', 'programming'],
    related: [],
  },
  {
    file: 'note-b',
    type: 'resource',
    title: 'Python Basics',
    summary: 'Intro to Python',
    body: 'Python is a language. Variables, functions, loops.',
    tags: ['python', 'programming'],
    related: [],
  },
  {
    file: 'note-c',
    type: 'resource',
    title: 'Web Development',
    summary: 'Building web apps',
    body: 'JavaScript and HTML for web. Functions and closures in JS.',
    tags: ['javascript', 'web'],
    related: [],
  },
  {
    file: 'note-d',
    type: 'resource',
    title: 'No Tags Note',
    summary: 'Orphan',
    body: 'This note has no tags.',
    tags: [],
    related: [],
  },
  {
    file: 'note-e',
    type: 'journal',
    title: '2026-03-30',
    summary: 'Daily entry',
    body: '',
    tags: ['daily'],
    related: [],
  },
];

describe('SimilarityEngine', () => {
  it('should score pairs with shared tags', () => {
    const vault = { scanNotes: () => mockNotes };
    const engine = new SimilarityEngine(vault);

    const pairs = engine.scorePairs(mockNotes);

    // Should find note-a (javascript, programming) and note-c (javascript, web) similar
    const noteAC = pairs.find(p => (p.a === 'note-a' && p.b === 'note-c') || (p.a === 'note-c' && p.b === 'note-a'));
    assert.ok(noteAC, 'Should find note-a and note-c as similar');
    assert.ok(noteAC.score >= 1.5, 'Score should be above threshold');
    assert.ok(noteAC.shared.includes('javascript'), 'Should have javascript as shared tag');
  });

  it('should ignore journal notes', () => {
    const vault = { scanNotes: () => mockNotes };
    const engine = new SimilarityEngine(vault);

    const pairs = engine.scorePairs(mockNotes);

    // Should not score any pairs involving note-e (journal)
    const hasJournal = pairs.some(p => p.a === 'note-e' || p.b === 'note-e');
    assert.ok(!hasJournal, 'Should not include journal notes');
  });

  it('should not score notes without tags', () => {
    const vault = { scanNotes: () => mockNotes };
    const engine = new SimilarityEngine(vault);

    const pairs = engine.scorePairs(mockNotes);

    // Should not include note-d (no tags)
    const hasNoteD = pairs.some(p => p.a === 'note-d' || p.b === 'note-d');
    assert.ok(!hasNoteD, 'Should not include notes without tags');
  });

  it('should score based on TF-IDF weights', () => {
    const vault = { scanNotes: () => mockNotes };
    const engine = new SimilarityEngine(vault);

    const pairs = engine.scorePairs(mockNotes);

    // All pairs should have score >= minScore (1.5)
    for (const p of pairs) {
      assert.ok(p.score >= 1.5, `All pairs should have score >= 1.5, got ${p.score}`);
    }
  });

  it('should respect maxResults limit', () => {
    const vault = { scanNotes: () => mockNotes };
    const engine = new SimilarityEngine(vault, { maxResults: 2 });

    const pairs = engine.scorePairs(mockNotes);

    assert.ok(pairs.length <= 2, `Should limit results to 2, got ${pairs.length}`);
  });

  it('should cache TF-IDF weights', () => {
    const vault = { scanNotes: () => mockNotes };
    const engine = new SimilarityEngine(vault);

    // First call
    const pairs1 = engine.scorePairs(mockNotes);
    const cached = engine.tfidfCache;
    assert.ok(cached, 'Should cache TF-IDF weights');

    // Second call with same notes
    const pairs2 = engine.scorePairs(mockNotes);
    assert.strictEqual(engine.tfidfCache, cached, 'Should return cached weights');
    assert.deepStrictEqual(pairs1, pairs2, 'Results should be identical');
  });

  it('should invalidate cache when notes change', () => {
    const vault = { scanNotes: () => mockNotes };
    const engine = new SimilarityEngine(vault);

    // First call
    engine.scorePairs(mockNotes);
    const cached1 = engine.tfidfCache;

    // Call with different notes
    const newNotes = mockNotes.map(n => ({ ...n, tags: n.tags }));
    newNotes[0].tags = ['different', 'tags'];
    engine.scorePairs(newNotes);

    assert.notStrictEqual(engine.tfidfCache, cached1, 'Cache should be invalidated on note changes');
  });

  it('findRelated should score by title and tags', () => {
    const vault = { scanNotes: () => mockNotes };
    vault.scanNotes = () => mockNotes;

    const engine = new SimilarityEngine(vault);
    const related = engine.findRelated('JavaScript', ['programming'], 5);

    assert.ok(related.length > 0, 'Should find related notes');
    assert.ok(related[0].score > 0, 'Top result should have positive score');
    // Note-a should score high (title contains 'JavaScript', has 'programming' tag)
    const noteA = related.find(n => n.file === 'note-a');
    assert.ok(noteA, 'Should find note-a');
  });

  it('findRelated should cap results', () => {
    const vault = { scanNotes: () => mockNotes };
    vault.scanNotes = () => mockNotes;

    const engine = new SimilarityEngine(vault);
    const related = engine.findRelated('test', [], 2);

    assert.ok(related.length <= 2, `Should limit to 2 results, got ${related.length}`);
  });

  it('should support incremental scoring', () => {
    const vault = { scanNotes: () => mockNotes };
    const engine = new SimilarityEngine(vault);

    // Full scan
    const allPairs = engine.scorePairs(mockNotes);

    // Incremental: only rescore pairs involving note-a
    const dirtySet = new Set(['note-a']);
    const incrPairs = engine.scorePairs(mockNotes, { incremental: true, dirtySet });

    // Incremental should have fewer pairs (only those involving note-a)
    assert.ok(incrPairs.length <= allPairs.length, 'Incremental should have same or fewer pairs');
    assert.ok(incrPairs.every(p => p.a === 'note-a' || p.b === 'note-a'), 'All pairs should involve note-a');
  });
});
