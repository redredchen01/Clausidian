import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync, existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TMP = join(__dirname, '..', 'tmp', 'test-commands-search');

describe('commands: search and filtering', () => {
  before(async () => {
    rmSync(TMP, { recursive: true, force: true });

    const { init } = await import('../src/commands/init.mjs');
    const { note } = await import('../src/commands/note.mjs');
    const { capture } = await import('../src/commands/capture.mjs');
    init(TMP);

    // Create diverse test notes
    note(TMP, 'Machine Learning Basics', 'resource', { tags: ['ai', 'learning'] });
    note(TMP, 'Deep Learning Tutorial', 'resource', { tags: ['ai', 'tutorial'] });
    note(TMP, 'Neural Network Architecture', 'project', { tags: ['ai', 'research'] });
    note(TMP, 'Data Processing Pipeline', 'project', { tags: ['data', 'pipeline'] });
    note(TMP, 'Vector Database Integration', 'project', { tags: ['data', 'vectors'] });
    note(TMP, 'Frontend Performance Guide', 'resource', { tags: ['frontend', 'performance'] });
    note(TMP, 'Backend Optimization', 'resource', { tags: ['backend', 'performance'] });
    note(TMP, 'System Design Patterns', 'area', { tags: ['design', 'architecture'] });
    note(TMP, 'Testing Best Practices', 'area', { tags: ['testing', 'quality'] });
    note(TMP, 'Unit Test Framework', 'resource', { tags: ['testing', 'quality'] });

    capture(TMP, 'Quick search implementation idea');

    // Add body content to some notes
    const { Vault } = await import('../src/vault.mjs');
    const vault = new Vault(TMP);

    let mlContent = vault.read('resources', 'machine-learning-basics.md');
    mlContent += '\n\n## Content\nThis document covers fundamental concepts of machine learning including supervised learning, unsupervised learning, and reinforcement learning.';
    vault.write('resources', 'machine-learning-basics.md', mlContent);

    let dlContent = vault.read('resources', 'deep-learning-tutorial.md');
    dlContent += '\n\n## Content\nDeep learning uses neural networks with multiple layers to learn representations from raw input.';
    vault.write('resources', 'deep-learning-tutorial.md', dlContent);

    let dpContent = vault.read('projects', 'data-processing-pipeline.md');
    dpContent += '\n\n## Implementation\nThe pipeline processes raw data through cleaning, transformation, and validation stages.';
    vault.write('projects', 'data-processing-pipeline.md', dpContent);
  });

  after(() => {
    rmSync(TMP, { recursive: true, force: true });
  });

  // ── Basic search tests (5 tests) ────────────────────────────

  describe('search: keyword matching', () => {
    it('finds notes by keyword in title', async () => {
      const { search } = await import('../src/commands/search.mjs');
      const result = search(TMP, 'learning', {});
      assert.ok(result.results.length >= 1);
      assert.ok(result.results.some(r => r.file.includes('learning')));
    });

    it('performs case-insensitive search', async () => {
      const { search } = await import('../src/commands/search.mjs');
      const resultLower = search(TMP, 'neural', {});
      const resultUpper = search(TMP, 'NEURAL', {});
      assert.equal(resultLower.results.length, resultUpper.results.length);
    });

    it('finds multiple matching results', async () => {
      const { search } = await import('../src/commands/search.mjs');
      const result = search(TMP, 'Learning', {});
      assert.ok(result.results.length >= 1);
    });

    it('returns empty results for no matches', async () => {
      const { search } = await import('../src/commands/search.mjs');
      const result = search(TMP, 'xyznonexistent', {});
      assert.equal(result.results.length, 0);
    });

    it('searches in note body content', async () => {
      const { search } = await import('../src/commands/search.mjs');
      const result = search(TMP, 'supervised learning', {});
      assert.ok(result.results.length >= 1);
    });
  });

  // ── Type filtering tests (5 tests) ────────────────────────────

  describe('search: type filtering', () => {
    it('filters results by type: resource', async () => {
      const { search } = await import('../src/commands/search.mjs');
      const result = search(TMP, '', { type: 'resource' });
      assert.ok(result.results.every(r => r.type === 'resource'));
    });

    it('filters results by type: project', async () => {
      const { search } = await import('../src/commands/search.mjs');
      const result = search(TMP, '', { type: 'project' });
      assert.ok(result.results.every(r => r.type === 'project'));
    });

    it('filters results by type: area', async () => {
      const { search } = await import('../src/commands/search.mjs');
      const result = search(TMP, '', { type: 'area' });
      assert.ok(result.results.every(r => r.type === 'area'));
    });

    it('filters results by type: idea', async () => {
      const { search } = await import('../src/commands/search.mjs');
      const result = search(TMP, '', { type: 'idea' });
      assert.ok(result.results.every(r => r.type === 'idea'));
    });

    it('combined: keyword + type filter', async () => {
      const { search } = await import('../src/commands/search.mjs');
      const result = search(TMP, 'performance', { type: 'resource' });
      assert.ok(result.results.every(r => r.type === 'resource'));
      assert.ok(result.results.length >= 1);
    });
  });

  // ── Tag filtering tests (5 tests) ────────────────────────────

  describe('search: tag filtering', () => {
    it('filters by single tag', async () => {
      const { search } = await import('../src/commands/search.mjs');
      const result = search(TMP, 'learning', { tag: 'ai' });
      assert.ok(result.results.length >= 1);
      assert.ok(result.results.every(r => r.tags.includes('ai')));
    });

    it('filters by performance tag', async () => {
      const { search } = await import('../src/commands/search.mjs');
      const result = search(TMP, 'performance', { tag: 'performance' });
      assert.ok(result.results.length >= 1);
    });

    it('filters by data tag', async () => {
      const { search } = await import('../src/commands/search.mjs');
      const result = search(TMP, 'data', { tag: 'data' });
      assert.ok(result.results.length >= 1);
    });

    it('combines keyword + tag filter', async () => {
      const { search } = await import('../src/commands/search.mjs');
      const result = search(TMP, 'learning', { tag: 'ai' });
      assert.ok(result.results.length >= 1);
      assert.ok(result.results.every(r => r.tags.includes('ai')));
    });

    it('returns empty for tag without matches', async () => {
      const { search } = await import('../src/commands/search.mjs');
      const result = search(TMP, '', { tag: 'nonexistent-tag' });
      assert.equal(result.results.length, 0);
    });
  });

  // ── Status filtering tests (5 tests) ────────────────────────────

  describe('search: status filtering', () => {
    before(async () => {
      const { archive } = await import('../src/commands/archive.mjs');
      archive(TMP, 'vector-database-integration');
      archive(TMP, 'quick-search-implementation-idea');
    });

    it('filters by active status', async () => {
      const { search } = await import('../src/commands/search.mjs');
      const result = search(TMP, 'learning', { status: 'active' });
      assert.ok(result.results.every(r => r.status !== 'archived'));
    });

    it('filters by archived status', async () => {
      const { search } = await import('../src/commands/search.mjs');
      const result = search(TMP, 'vector', { status: 'archived' });
      assert.ok(result.results.every(r => r.status === 'archived'));
    });

    it('combined: keyword + status filter', async () => {
      const { search } = await import('../src/commands/search.mjs');
      const result = search(TMP, 'vector', { status: 'archived' });
      assert.ok(result.results.length >= 1);
    });

    it('returns empty for inactive filter without matches', async () => {
      const { search } = await import('../src/commands/search.mjs');
      const result = search(TMP, 'xyznonexistent', { status: 'archived' });
      assert.equal(result.results.length, 0);
    });

    it('type + tag + status combined filter', async () => {
      const { search } = await import('../src/commands/search.mjs');
      const result = search(TMP, 'data', { type: 'project', tag: 'data', status: 'active' });
      assert.ok(result.results.every(r => r.type === 'project'));
      assert.ok(result.results.every(r => r.tags.includes('data')));
    });
  });

  // ── Regex search tests (5 tests) ────────────────────────────

  describe('search: regex patterns', () => {
    it('searches using regex pattern', async () => {
      const { search } = await import('../src/commands/search.mjs');
      const result = search(TMP, 'learn.*', { regex: true });
      assert.ok(result.results.length >= 1);
    });

    it('regex matches case-insensitive by default', async () => {
      const { search } = await import('../src/commands/search.mjs');
      const result = search(TMP, '(machine|deep).*learning', { regex: true });
      assert.ok(result.results.length >= 2);
    });

    it('regex alternation pattern', async () => {
      const { search } = await import('../src/commands/search.mjs');
      const result = search(TMP, '(neural|architecture)', { regex: true });
      assert.ok(result.results.length >= 2);
    });

    it('regex with word boundaries', async () => {
      const { search } = await import('../src/commands/search.mjs');
      const result = search(TMP, '\\btest\\b', { regex: true });
      assert.ok(result.results.length >= 1);
    });

    it('combined: regex + type filter', async () => {
      const { search } = await import('../src/commands/search.mjs');
      const result = search(TMP, '.*performance.*', { regex: true, type: 'resource' });
      assert.ok(result.results.every(r => r.type === 'resource'));
      assert.ok(result.results.length >= 1);
    });
  });

  // ── Advanced filtering tests (5 tests) ────────────────────────────

  describe('search: advanced combinations', () => {
    it('filters by multiple conditions: type + tag + keyword', async () => {
      const { search } = await import('../src/commands/search.mjs');
      const result = search(TMP, 'learning', { type: 'resource', tag: 'ai' });
      assert.ok(result.results.every(r => r.type === 'resource'));
      assert.ok(result.results.every(r => r.tags.includes('ai')));
    });

    it('searches for phrase across results', async () => {
      const { search } = await import('../src/commands/search.mjs');
      const result = search(TMP, 'processing pipeline', {});
      assert.ok(result.results.length >= 1);
    });

    it('finds notes with multiple tags', async () => {
      const { search } = await import('../src/commands/search.mjs');
      const result = search(TMP, '', { tag: 'ai' });
      const multiTag = result.results.filter(r => r.tags.length > 1);
      assert.ok(multiTag.length >= 1);
    });

    it('partial word matching', async () => {
      const { search } = await import('../src/commands/search.mjs');
      const result = search(TMP, 'optim', {});
      assert.ok(result.results.length >= 1);
    });

    it('handles special characters in search', async () => {
      const { search } = await import('../src/commands/search.mjs');
      const result = search(TMP, 'C++', {});
      // Should not crash even if no results
      assert.ok(Array.isArray(result.results));
    });
  });

  // ── Result structure tests (5 tests) ────────────────────────────

  describe('search: result structure', () => {
    it('result includes file, type, tags, status', async () => {
      const { search } = await import('../src/commands/search.mjs');
      const result = search(TMP, 'learning', {});
      assert.ok(result.results.length > 0);
      const firstResult = result.results[0];
      assert.ok(firstResult.file);
      assert.ok(firstResult.type);
      assert.ok(Array.isArray(firstResult.tags));
      assert.ok(firstResult.status);
    });

    it('result includes summary field', async () => {
      const { search } = await import('../src/commands/search.mjs');
      const result = search(TMP, 'architecture', {});
      assert.ok(result.results.length > 0);
      assert.ok('summary' in result.results[0]);
    });

    it('results are ordered consistently', async () => {
      const { search } = await import('../src/commands/search.mjs');
      const result1 = search(TMP, 'learning', {});
      const result2 = search(TMP, 'learning', {});
      assert.equal(result1.results.length, result2.results.length);
      if (result1.results.length > 0) {
        assert.equal(result1.results[0].file, result2.results[0].file);
      }
    });

    it('truncated results show count', async () => {
      const { search } = await import('../src/commands/search.mjs');
      const result = search(TMP, 'a', {});
      assert.ok(Array.isArray(result.results));
      assert.ok(result.results.length <= 20);
    });

    it('empty results return results array', async () => {
      const { search } = await import('../src/commands/search.mjs');
      const result = search(TMP, 'zzznonexistent', {});
      assert.ok(Array.isArray(result.results));
      assert.equal(result.results.length, 0);
    });
  });

  // ── Performance and edge cases (5 tests) ────────────────────────────

  describe('search: edge cases', () => {
    it('handles very short keywords', async () => {
      const { search } = await import('../src/commands/search.mjs');
      const result = search(TMP, 'a', {});
      assert.ok(Array.isArray(result.results));
    });

    it('handles very long keyword without crashing', async () => {
      const { search } = await import('../src/commands/search.mjs');
      const longKeyword = 'a'.repeat(200);
      const result = search(TMP, longKeyword, {});
      assert.equal(result.results.length, 0);
    });

    it('handles whitespace-only search', async () => {
      const { search } = await import('../src/commands/search.mjs');
      // This should error due to empty keyword validation
      assert.throws(
        () => search(TMP, '   ', {}),
        /keyword/i
      );
    });

    it('handles unicode search terms', async () => {
      const { search } = await import('../src/commands/search.mjs');
      const result = search(TMP, '中文', {});
      assert.ok(Array.isArray(result.results));
    });

    it('non-existent filters return empty gracefully', async () => {
      const { search } = await import('../src/commands/search.mjs');
      const result = search(TMP, 'learning', { tag: 'nonexistent-xyz', type: 'fakeType' });
      assert.equal(result.results.length, 0);
    });
  });

  // ── Integration: search workflows (5 tests) ────────────────────────────

  describe('search: integration workflows', () => {
    it('search → read pipeline', async () => {
      const { search } = await import('../src/commands/search.mjs');
      const { read } = await import('../src/commands/read.mjs');

      const searchResult = search(TMP, 'machine learning', {});
      assert.ok(searchResult.results.length >= 1);

      const firstFile = searchResult.results[0].file;
      const readResult = read(TMP, firstFile);
      assert.ok(readResult.content);
    });

    it('search by tag → list filtered results', async () => {
      const { search } = await import('../src/commands/search.mjs');
      const { list } = await import('../src/commands/list.mjs');

      const searchResult = search(TMP, '', { tag: 'ai' });
      const listResult = list(TMP, { tag: 'ai' });

      assert.equal(searchResult.results.length, listResult.notes.length);
    });

    it('search → update metadata pipeline', async () => {
      const { search } = await import('../src/commands/search.mjs');
      const { update } = await import('../src/commands/update.mjs');

      const result = search(TMP, 'neural', {});
      assert.ok(result.results.length >= 1);

      const noteName = result.results[0].file;
      const updateResult = update(TMP, noteName, { summary: 'Updated via search' });
      assert.equal(updateResult.status, 'updated');
    });

    it('search multiple tags combination', async () => {
      const { search } = await import('../src/commands/search.mjs');

      const aiResults = search(TMP, '', { tag: 'ai' });
      const learningResults = search(TMP, '', { tag: 'learning' });

      assert.ok(aiResults.results.length > 0);
      assert.ok(learningResults.results.length > 0);
    });

    it('search with nested filtering logic', async () => {
      const { search } = await import('../src/commands/search.mjs');

      // Find all active resources tagged with 'performance'
      const result = search(TMP, 'performance', {
        type: 'resource',
        tag: 'performance',
        status: 'active'
      });

      assert.ok(result.results.every(r => r.type === 'resource'));
      assert.ok(result.results.every(r => r.tags.includes('performance')));
    });
  });
});
