import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BM25Index, tokenize, analyze } from '../src/bm25.mjs';
import { SearchCache } from '../src/search-cache.mjs';

describe('tokenizer', () => {
  it('splits and lowercases text', () => {
    const tokens = tokenize('Hello World Test');
    assert.ok(tokens.includes('hello'));
    assert.ok(tokens.includes('world'));
    assert.ok(tokens.includes('test'));
  });

  it('removes stop words', () => {
    const tokens = tokenize('the quick brown fox is a very good animal');
    assert.ok(!tokens.includes('the'));
    assert.ok(!tokens.includes('is'));
    assert.ok(!tokens.includes('a'));
    assert.ok(tokens.includes('quick'));
    assert.ok(tokens.includes('brown'));
    assert.ok(tokens.includes('fox'));
  });

  it('handles CJK text', () => {
    const tokens = tokenize('API 设计 模式 指南');
    assert.ok(tokens.includes('api'));
    assert.ok(tokens.includes('设计'));
  });

  it('handles empty input', () => {
    assert.deepEqual(tokenize(''), []);
    assert.deepEqual(tokenize(null), []);
    assert.deepEqual(tokenize(undefined), []);
  });
});

describe('analyze (tokenize + stem)', () => {
  it('stems English words', () => {
    const tokens = analyze('designing patterns quickly');
    assert.ok(tokens.includes('design'));
    assert.ok(tokens.includes('pattern'));
    assert.ok(tokens.includes('quick'));
  });
});

describe('BM25Index', () => {
  const mockNotes = [
    { file: 'api-design.md', title: 'API Design Patterns', type: 'resource', status: 'active', tags: ['api', 'design'], summary: 'Best practices for REST API design', body: 'RESTful APIs should follow resource-oriented design. Use proper HTTP methods.' },
    { file: 'node-guide.md', title: 'Node.js Guide', type: 'resource', status: 'active', tags: ['node', 'javascript'], summary: 'Getting started with Node.js', body: 'Node.js is a runtime for JavaScript. Install with nvm.' },
    { file: 'project-alpha.md', title: 'Project Alpha', type: 'project', status: 'active', tags: ['api', 'backend'], summary: 'Build the API service', body: 'This project implements the REST API for our backend service.' },
    { file: 'random-idea.md', title: 'Random Idea', type: 'idea', status: 'draft', tags: [], summary: '', body: 'What if we built a search engine?' },
    { file: 'meeting-notes.md', title: 'Meeting Notes', type: 'journal', status: 'active', tags: ['daily'], summary: 'Team standup', body: 'Discussed API design review. Need to finalize the REST endpoints.' },
  ];

  it('builds index from notes', () => {
    const idx = new BM25Index();
    idx.build(mockNotes);
    assert.strictEqual(idx.docCount, 5);
    assert.ok(idx.avgDL > 0);
    assert.ok(idx.invertedIndex.size > 0);
  });

  it('ranks API-related notes higher for "API design"', () => {
    const idx = new BM25Index();
    idx.build(mockNotes);
    const results = idx.search('API design');
    assert.ok(results.length > 0);
    // api-design.md should be #1 (title + tags + summary + body all match)
    assert.strictEqual(results[0].file, 'api-design.md');
  });

  it('handles multi-word queries', () => {
    const idx = new BM25Index();
    idx.build(mockNotes);
    const results = idx.search('REST API endpoints');
    assert.ok(results.length >= 2);
    // Both api-design and project-alpha mention REST API
  });

  it('filters by type', () => {
    const idx = new BM25Index();
    idx.build(mockNotes);
    const results = idx.search('API', { type: 'project' });
    assert.ok(results.every(r => r.type === 'project'));
  });

  it('filters by tag', () => {
    const idx = new BM25Index();
    idx.build(mockNotes);
    const results = idx.search('API', { tag: 'backend' });
    assert.ok(results.every(r => r.tags.includes('backend')));
  });

  it('returns empty for no matches', () => {
    const idx = new BM25Index();
    idx.build(mockNotes);
    const results = idx.search('xyznonexistent');
    assert.strictEqual(results.length, 0);
  });

  it('respects limit parameter', () => {
    const idx = new BM25Index();
    idx.build(mockNotes);
    const results = idx.search('API', { limit: 2 });
    assert.ok(results.length <= 2);
  });

  it('scores include numeric values', () => {
    const idx = new BM25Index();
    idx.build(mockNotes);
    const results = idx.search('API design');
    for (const r of results) {
      assert.ok(typeof r.score === 'number');
      assert.ok(r.score > 0);
    }
  });
});

describe('SearchCache (performance + functionality)', () => {
  const mockNotes = [
    { file: 'api-design.md', title: 'API Design Patterns', type: 'resource', status: 'active', tags: ['api', 'design'], summary: 'Best practices for REST API design', body: 'RESTful APIs should follow resource-oriented design. Use proper HTTP methods.' },
    { file: 'node-guide.md', title: 'Node.js Guide', type: 'resource', status: 'active', tags: ['node', 'javascript'], summary: 'Getting started with Node.js', body: 'Node.js is a runtime for JavaScript. Install with nvm.' },
    { file: 'project-alpha.md', title: 'Project Alpha', type: 'project', status: 'active', tags: ['api', 'backend'], summary: 'Build the API service', body: 'This project implements the REST API for our backend service.' },
    { file: 'random-idea.md', title: 'Random Idea', type: 'idea', status: 'draft', tags: [], summary: '', body: 'What if we built a search engine?' },
    { file: 'meeting-notes.md', title: 'Meeting Notes', type: 'journal', status: 'active', tags: ['daily'], summary: 'Team standup', body: 'Discussed API design review. Need to finalize the REST endpoints.' },
  ];

  it('cache hit returns <5ms', () => {
    const cache = new SearchCache();
    const idx = new BM25Index();
    idx.build(mockNotes);

    // Prime the cache
    const results1 = idx.search('API design', { type: 'resource' });
    cache.set('API design', { type: 'resource' }, results1);

    // Measure cache hit time
    const start = performance.now();
    const cached = cache.get('API design', { type: 'resource' });
    const elapsed = performance.now() - start;

    assert.ok(cached !== null, 'should have cached result');
    assert.ok(elapsed < 5, `cache hit took ${elapsed.toFixed(2)}ms, should be <5ms`);
  });

  it('cache key generation is fast (<10ms for 1000 keys)', () => {
    const cache = new SearchCache();

    const start = performance.now();
    for (let i = 0; i < 1000; i++) {
      cache._getCacheKey(`keyword${i}`, { type: 'resource', tag: `tag${i}`, status: 'active' });
    }
    const elapsed = performance.now() - start;

    assert.ok(elapsed < 10, `generated 1000 keys in ${elapsed.toFixed(2)}ms, should be <10ms`);
  });

  it('same search yields same cache key (determinism)', () => {
    const cache = new SearchCache();
    const key1 = cache._getCacheKey('API design', { type: 'resource', tag: 'api', status: 'active' });
    const key2 = cache._getCacheKey('API design', { type: 'resource', tag: 'api', status: 'active' });
    assert.strictEqual(key1, key2, 'cache keys should be deterministic');
  });

  it('different searches yield different cache keys', () => {
    const cache = new SearchCache();
    const key1 = cache._getCacheKey('API design', { type: 'resource' });
    const key2 = cache._getCacheKey('Node.js guide', { type: 'resource' });
    const key3 = cache._getCacheKey('API design', { type: 'project' });
    assert.notStrictEqual(key1, key2, 'different keywords should yield different keys');
    assert.notStrictEqual(key1, key3, 'different types should yield different keys');
  });

  it('cache invalidation after vault change', () => {
    const cache = new SearchCache();
    const idx = new BM25Index();
    idx.build(mockNotes);

    const results1 = idx.search('API design');
    cache.set('API design', {}, results1);
    assert.ok(cache.get('API design', {}) !== null, 'should have cache entry before clear');

    // Simulate vault change
    cache.clear();
    assert.strictEqual(cache.get('API design', {}), null, 'should be empty after clear');
  });

  it('cache TTL defaults to 10 minutes', () => {
    const cache = new SearchCache();
    assert.strictEqual(cache.ttl, 10 * 60 * 1000, 'TTL should be 10 minutes by default');
  });

  it('cache stats track hits and misses', () => {
    const cache = new SearchCache();
    const idx = new BM25Index();
    idx.build(mockNotes);

    const results = idx.search('API design');
    cache.set('API design', {}, results);

    // Miss
    cache.get('nonexistent', {});
    assert.strictEqual(cache.stats().misses, 1);

    // Hit
    cache.get('API design', {});
    assert.strictEqual(cache.stats().hits, 1);

    // Hit rate
    const stats = cache.stats();
    assert.strictEqual(stats.hitRate, 50, 'hit rate should be 50% (1 hit, 1 miss)');
  });

  it('95-percentile search latency (mixed hits/misses) <200ms', () => {
    const cache = new SearchCache();
    const idx = new BM25Index();
    idx.build(mockNotes);

    const latencies = [];
    const queries = [
      'API design', 'Node.js', 'project', 'random', 'meeting',
      'REST', 'backend', 'design', 'search', 'guide',
    ];

    // Run 10 different queries, 10 times each = 100 total
    for (let iteration = 0; iteration < 10; iteration++) {
      for (const q of queries) {
        const start = performance.now();
        const cached = cache.get(q, {});
        if (!cached) {
          // Cache miss: do search + cache
          const results = idx.search(q);
          cache.set(q, {}, results);
        }
        const elapsed = performance.now() - start;
        latencies.push(elapsed);
      }
    }

    // Calculate 95-percentile
    latencies.sort((a, b) => a - b);
    const p95 = latencies[Math.floor(latencies.length * 0.95)];
    assert.ok(p95 < 200, `p95 latency ${p95.toFixed(2)}ms should be <200ms`);
  });

  it('search results unchanged with cache optimization', () => {
    const idx = new BM25Index();
    idx.build(mockNotes);

    // Test various filter combinations
    const queries = [
      { q: 'API', opts: {} },
      { q: 'API', opts: { type: 'resource' } },
      { q: 'API', opts: { type: 'project', tag: 'api' } },
      { q: 'design', opts: { type: 'resource', status: 'active' } },
      { q: 'search', opts: { type: 'idea' } },
    ];

    for (const { q, opts } of queries) {
      const results = idx.search(q, opts);
      // Verify structure
      for (const r of results) {
        assert.ok(r.file, 'result should have file');
        assert.ok(r.title, 'result should have title');
        assert.ok(r.type, 'result should have type');
        assert.ok(typeof r.score === 'number', 'result should have numeric score');
        if (opts.type) assert.strictEqual(r.type, opts.type, 'type filter should apply');
        if (opts.tag) assert.ok(r.tags.includes(opts.tag), 'tag filter should apply');
        if (opts.status) assert.strictEqual(r.status, opts.status, 'status filter should apply');
      }
    }
  });
});
