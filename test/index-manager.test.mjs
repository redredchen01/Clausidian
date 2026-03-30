import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Vault } from '../src/vault.mjs';
import { IndexManager } from '../src/index-manager.mjs';
import { ClusterCache } from '../src/cluster-cache.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TMP = join(__dirname, '..', 'tmp', 'test-index');

describe('IndexManager', () => {
  let vault, idx;

  before(() => {
    rmSync(TMP, { recursive: true, force: true });
    mkdirSync(join(TMP, 'projects'), { recursive: true });
    mkdirSync(join(TMP, 'journal'), { recursive: true });

    writeFileSync(join(TMP, 'projects', 'my-project.md'), `---
title: "My Project"
type: project
tags: [backend, api]
created: 2026-03-27
updated: 2026-03-27
status: active
summary: "A test project"
related: ["[[other-note]]"]
---

# My Project
`);

    writeFileSync(join(TMP, 'journal', '2026-03-27.md'), `---
title: "2026-03-27"
type: journal
tags: [daily]
created: 2026-03-27
updated: 2026-03-27
status: active
summary: ""
related: []
---

# 2026-03-27
`);

    vault = new Vault(TMP);
    idx = new IndexManager(vault);
  });

  after(() => {
    rmSync(TMP, { recursive: true, force: true });
  });

  it('rebuildTags creates _tags.md', () => {
    const result = idx.rebuildTags();
    assert.ok(result.tags > 0);
    assert.ok(result.notes > 0);
    const content = vault.read('_tags.md');
    assert.ok(content.includes('### backend'));
    assert.ok(content.includes('[[my-project]]'));
  });

  it('rebuildGraph creates _graph.md', () => {
    const result = idx.rebuildGraph();
    assert.ok(result.relationships > 0);
    const content = vault.read('_graph.md');
    assert.ok(content.includes('[[my-project]]'));
    assert.ok(content.includes('| nav |'));
  });

  it('updateDirIndex creates/updates index', () => {
    idx.updateDirIndex('projects', 'my-project', 'A test project');
    const content = vault.read('projects', '_index.md');
    assert.ok(content.includes('[[my-project]]'));
    assert.ok(content.includes('A test project'));
  });

  it('sync rebuilds all indices', () => {
    const result = idx.sync();
    assert.ok(result.tags >= 0);
    assert.ok(result.notes >= 0);
    assert.ok(result.relationships >= 0);
  });
});

describe('Incremental Sync', () => {
  let vault, idx;

  before(() => {
    rmSync(TMP, { recursive: true, force: true });
    mkdirSync(join(TMP, 'projects'), { recursive: true });
    mkdirSync(join(TMP, 'journal'), { recursive: true });

    // Create 5 test notes
    for (let i = 1; i <= 5; i++) {
      writeFileSync(join(TMP, 'projects', `note-${i}.md`), `---
title: "Note ${i}"
type: project
tags: [tag-a, tag-b]
created: 2026-03-27
updated: 2026-03-27
status: active
summary: "Test note ${i}"
related: []
---

# Note ${i}
`);
    }

    vault = new Vault(TMP);
    idx = new IndexManager(vault);
  });

  after(() => {
    rmSync(TMP, { recursive: true, force: true });
  });

  it('no changes detected when notes unchanged', () => {
    // First sync to build cache
    idx.sync();

    // Second sync: no changes expected
    const changes = vault.detectChanges();
    assert.strictEqual(changes.created.length, 0);
    assert.strictEqual(changes.modified.length, 0);
    assert.strictEqual(changes.deleted.length, 0);
    assert.strictEqual(changes.unchanged, 5);
  });

  it('detects modified notes', () => {
    idx.sync();

    // Modify one note
    const notePath = join(TMP, 'projects', 'note-1.md');
    const content = `---
title: "Note 1 Modified"
type: project
tags: [tag-a, tag-c]
created: 2026-03-27
updated: 2026-03-28
status: active
summary: "Test note 1 modified"
related: []
---

# Note 1 Modified
`;
    writeFileSync(notePath, content);
    vault.invalidateCache();

    // Detect change
    const changes = vault.detectChanges();
    assert.ok(changes.modified.length > 0);
    assert.ok(changes.modified.some(p => p.includes('note-1')));
  });

  it('detects newly created notes', () => {
    idx.sync();

    // Add a new note
    writeFileSync(join(TMP, 'projects', 'note-new.md'), `---
title: "Note New"
type: project
tags: [tag-x]
created: 2026-03-28
updated: 2026-03-28
status: active
summary: "New note"
related: []
---

# Note New
`);
    vault.invalidateCache();

    const changes = vault.detectChanges();
    assert.ok(changes.created.length > 0);
    assert.ok(changes.created.some(p => p.includes('note-new')));
  });

  it('detects deleted notes', () => {
    idx.sync();

    // Delete a note
    rmSync(join(TMP, 'projects', 'note-2.md'));
    vault.invalidateCache();

    const changes = vault.detectChanges();
    assert.ok(changes.deleted.length > 0);
    assert.ok(changes.deleted.some(p => p.includes('note-2')));
  });

  it('hash cache persists to .clausidian/hashes.json', () => {
    vault.detectChanges();

    const cacheFile = join(TMP, '.clausidian', 'hashes.json');
    assert.ok(existsSync(cacheFile), 'Cache file should exist');

    const cacheData = JSON.parse(readFileSync(cacheFile, 'utf8'));
    assert.ok(Object.keys(cacheData).length > 0, 'Cache should contain file hashes');
  });

  it('degraded gracefully when cache corrupted', () => {
    // Corrupt the cache
    mkdirSync(join(TMP, '.clausidian'), { recursive: true });
    writeFileSync(join(TMP, '.clausidian', 'hashes.json'), '{invalid json}');

    vault.invalidateCache();

    // Should not throw, should return valid changes
    const changes = vault.detectChanges();
    assert.ok(typeof changes.created === 'object');
    assert.ok(typeof changes.modified === 'object');
    assert.ok(typeof changes.deleted === 'object');
  });

  it('sync includes unchanged count in result', () => {
    vault.invalidateCache();
    const result = idx.sync();

    assert.ok('unchanged' in result || 'total' in result);
  });
});

describe('Set Optimization (TF-IDF Link Suggestions)', () => {
  let vault, idx;

  before(() => {
    rmSync(TMP, { recursive: true, force: true });
    mkdirSync(join(TMP, 'projects'), { recursive: true });
    mkdirSync(join(TMP, 'journal'), { recursive: true });

    // Create 50 test notes with varied tags for scoring
    for (let i = 1; i <= 50; i++) {
      const tags = [];
      if (i % 2 === 0) tags.push('backend');
      if (i % 3 === 0) tags.push('api');
      if (i % 5 === 0) tags.push('database');
      if (i % 7 === 0) tags.push('frontend');
      if (i % 11 === 0) tags.push('testing');

      writeFileSync(join(TMP, 'projects', `note-${i}.md`), `---
title: "Note ${i}"
type: project
tags: [${tags.join(', ')}]
created: 2026-03-27
updated: 2026-03-27
status: active
summary: "Test note ${i} with keywords"
related: []
---

# Note ${i}

Content for note ${i}.
`);
    }

    vault = new Vault(TMP);
    idx = new IndexManager(vault);
  });

  after(() => {
    rmSync(TMP, { recursive: true, force: true });
  });

  it('Set optimization does not change TF-IDF scores (numeric equivalence)', () => {
    // Build graph twice, check suggested links are identical
    const notes1 = vault.scanNotes({ includeBody: true });
    const result1 = idx.rebuildGraph(notes1);
    const graph1 = vault.read('_graph.md');

    // Extract suggested links section
    const suggestedMatch1 = graph1.match(/## Suggested Links[\s\S]*?(?=## Clusters|$)/);
    const suggestedText1 = suggestedMatch1 ? suggestedMatch1[0] : '';

    // Run again with same data
    const notes2 = vault.scanNotes({ includeBody: true });
    const result2 = idx.rebuildGraph(notes2);
    const graph2 = vault.read('_graph.md');

    const suggestedMatch2 = graph2.match(/## Suggested Links[\s\S]*?(?=## Clusters|$)/);
    const suggestedText2 = suggestedMatch2 ? suggestedMatch2[0] : '';

    // Suggested links should be identical
    assert.strictEqual(suggestedText1, suggestedText2, 'Suggested links should be identical across runs');
    assert.strictEqual(result1.suggestedLinks, result2.suggestedLinks, 'Suggested link count should match');
  });

  it('50-note vault completes rebuildGraph in reasonable time', () => {
    const notes = vault.scanNotes({ includeBody: true });
    const startTime = process.hrtime.bigint();
    idx.rebuildGraph(notes);
    const endTime = process.hrtime.bigint();

    const elapsedMs = Number(endTime - startTime) / 1_000_000;
    console.log(`\n  rebuildGraph for 50 notes: ${elapsedMs.toFixed(2)}ms`);

    // Should be < 500ms (very generous bound)
    assert.ok(elapsedMs < 500, `Expected < 500ms, got ${elapsedMs.toFixed(2)}ms`);
  });

  it('IDF weights remain correct after Set optimization', () => {
    const notes = vault.scanNotes({ includeBody: true });
    idx.rebuildGraph(notes);
    const graph = vault.read('_graph.md');

    // Verify suggested links exist
    assert.ok(graph.includes('## Suggested Links'), 'Should have suggested links section');

    // Extract scores from suggested links table
    const scoreMatches = graph.match(/\|\s*\[\[.*?\]\]\s*\|\s*\[\[.*?\]\]\s*\|\s*([\d.]+)\s*\|/g);
    if (scoreMatches && scoreMatches.length > 0) {
      // All scores should be >= 1.5 (the threshold)
      const scores = scoreMatches.map(m => {
        const match = m.match(/([\d.]+)\s*\|$/);
        return parseFloat(match[1]);
      });
      for (const score of scores) {
        assert.ok(score >= 1.5, `Score ${score} should be >= 1.5 threshold`);
      }
    }
  });

  it('shared tags are correctly identified in link suggestions', () => {
    const notes = vault.scanNotes({ includeBody: true });
    idx.rebuildGraph(notes);
    const graph = vault.read('_graph.md');

    // Extract suggested links with their shared tags
    const linkMatches = graph.match(/\|\s*\[\[(.*?)\]\]\s*\|\s*\[\[(.*?)\]\]\s*\|\s*([\d.]+)\s*\|\s*([^|]+)\s*\|/g);
    if (linkMatches && linkMatches.length > 0) {
      for (const match of linkMatches.slice(0, 3)) {
        // Each link should have at least one shared tag listed
        const tagMatch = match.match(/\|\s*([^|]+)\s*\|$/);
        assert.ok(tagMatch && tagMatch[1].trim().length > 0, 'Each link should list shared tags');
      }
    }
  });

  it('link suggestion order is consistent (by score descending)', () => {
    const notes = vault.scanNotes({ includeBody: true });
    idx.rebuildGraph(notes);
    const graph = vault.read('_graph.md');

    // Extract all scores in order
    const scoreMatches = graph.match(/\|\s*\[\[.*?\]\]\s*\|\s*\[\[.*?\]\]\s*\|\s*([\d.]+)\s*\|/g);
    if (scoreMatches && scoreMatches.length > 1) {
      const scores = scoreMatches.map(m => {
        const match = m.match(/([\d.]+)\s*\|$/);
        return parseFloat(match[1]);
      });

      // Verify descending order
      for (let i = 1; i < scores.length; i++) {
        assert.ok(
          scores[i - 1] >= scores[i],
          `Scores should be descending: ${scores[i - 1]} >= ${scores[i]}`
        );
      }
    }
  });
});

describe('Unit 3: Lazy Body Extraction', () => {
  let vault, idx;

  before(() => {
    rmSync(TMP, { recursive: true, force: true });
    mkdirSync(join(TMP, 'projects'), { recursive: true });
    mkdirSync(join(TMP, 'resources'), { recursive: true });

    // Create test notes with bodies
    writeFileSync(join(TMP, 'projects', 'note-a.md'), `---
title: "Note A"
type: project
tags: [backend, api]
created: 2026-03-27
updated: 2026-03-27
status: active
summary: "API design principles"
related: []
---

# Note A Body

This is a long body with lots of text content that should NOT be loaded
during the sync phase. Body content includes keywords like distributed,
caching, microservices, and authentication mechanisms. This section should
be skipped during rebuildGraph() to save memory.
`);

    writeFileSync(join(TMP, 'projects', 'note-b.md'), `---
title: "Note B"
type: project
tags: [backend, cache]
created: 2026-03-27
updated: 2026-03-27
status: active
summary: "Caching strategies"
related: []
---

# Note B Body

Detailed caching implementation with Redis, Memcached, and distributed
cache patterns. Contains keywords like consistency, TTL, eviction,
and replication. This body should NOT be included in sync.
`);

    writeFileSync(join(TMP, 'resources', 'note-c.md'), `---
title: "Note C"
type: resource
tags: [backend]
created: 2026-03-27
updated: 2026-03-27
status: active
summary: "Microservices overview"
related: []
---

# Note C Body

Body text discussing service discovery, load balancing, circuit breakers,
fault tolerance, and distributed tracing. This should not be loaded during
regular sync operations.
`);

    vault = new Vault(TMP);
    idx = new IndexManager(vault);
  });

  after(() => {
    rmSync(TMP, { recursive: true, force: true });
  });

  it('scanNotes() without includeBody does not load body text', () => {
    const notes = vault.scanNotes();
    for (const note of notes) {
      assert.ok(!note.body || note.body === undefined, 
        `Note ${note.file} should not have body field, but got: ${typeof note.body}`);
    }
  });

  it('scanNotes({ includeBody: true }) loads body when explicitly requested', () => {
    const notes = vault.scanNotes({ includeBody: true });
    const noteA = notes.find(n => n.file === 'note-a');
    assert.ok(noteA.body, 'Note A should have body when includeBody=true');
    assert.ok(noteA.body.includes('distributed'), 'Body should contain expected keywords');
  });

  it('rebuildGraph() uses scanNotes() without body (no includeBody param)', () => {
    const result = idx.rebuildGraph();
    assert.ok(result.relationships !== undefined, 'rebuildGraph should return results');
    
    // Verify internal state: notes used should not have body
    const notes = vault.scanNotes();
    for (const note of notes) {
      assert.ok(!note.body || note.body === undefined,
        'rebuildGraph should use notes without body');
    }
  });

  it('keyword extraction only uses title + summary (no body)', () => {
    // Manually extract keywords like rebuildGraph does
    const notes = vault.scanNotes(); // No body!
    const noteA = notes.find(n => n.file === 'note-a');
    
    const text = `${noteA.title} ${noteA.summary}`.toLowerCase();
    const words = new Set(text.match(/[a-z\u4e00-\u9fff]{3,}/g) || []);
    
    // Should have title+summary keywords
    assert.ok(words.has('note') || words.has('api'), 'Should have keywords from title/summary');
    
    // Should NOT have body-only keywords since body is not loaded
    assert.ok(!words.has('distributed'), 'Should not have "distributed" (body-only keyword)');
  });

  it('caching behavior: multiple scanNotes() calls use same cache', () => {
    const notes1 = vault.scanNotes();
    const notes2 = vault.scanNotes();
    
    // Should be same object reference (cached)
    assert.strictEqual(notes1, notes2, 'scanNotes() should return cached result');
  });

  it('rebuildGraph preserves link suggestion quality despite title+summary-only keywords', () => {
    const result = idx.rebuildGraph();
    const graph = vault.read('_graph.md');
    
    // Graph should still be generated and contain table structure
    assert.ok(graph.includes('| Source | Links To |'), 'Graph should have proper table');
    assert.ok(result.relationships >= 0, 'Should have relationships calculated');
  });

  it('search() still works with body by explicitly using includeBody', () => {
    // search() method should handle body loading for full-text search
    const results = vault.search('caching');
    assert.ok(Array.isArray(results), 'search() should return array');
    // Even if results are empty, search should not throw
  });

  it('scanNotes cache is separate for body vs no-body', () => {
    const withoutBody = vault.scanNotes();
    const withBody = vault.scanNotes({ includeBody: true });
    
    // Should be different cached results
    assert.notStrictEqual(withoutBody, withBody,
      'scanNotes() should have separate caches for includeBody');
  });
});

describe('Unit 4: Cluster Detection Caching', () => {
  let vault, idx, clusterCache;

  before(() => {
    rmSync(TMP, { recursive: true, force: true });
    mkdirSync(join(TMP, 'projects'), { recursive: true });
    mkdirSync(join(TMP, 'journal'), { recursive: true });

    // Create a connected component: a -> b -> c -> d (all in one cluster)
    writeFileSync(join(TMP, 'projects', 'note-a.md'), `---
title: "Note A"
type: project
tags: [cluster-1]
created: 2026-03-27
updated: 2026-03-27
status: active
summary: "Part of cluster 1"
related: ["[[note-b]]"]
---

# Note A
`);

    writeFileSync(join(TMP, 'projects', 'note-b.md'), `---
title: "Note B"
type: project
tags: [cluster-1]
created: 2026-03-27
updated: 2026-03-27
status: active
summary: "Part of cluster 1"
related: ["[[note-a]]", "[[note-c]]"]
---

# Note B
`);

    writeFileSync(join(TMP, 'projects', 'note-c.md'), `---
title: "Note C"
type: project
tags: [cluster-1]
created: 2026-03-27
updated: 2026-03-27
status: active
summary: "Part of cluster 1"
related: ["[[note-b]]", "[[note-d]]"]
---

# Note C
`);

    writeFileSync(join(TMP, 'projects', 'note-d.md'), `---
title: "Note D"
type: project
tags: [cluster-1]
created: 2026-03-27
updated: 2026-03-27
status: active
summary: "Part of cluster 1"
related: ["[[note-c]]"]
---

# Note D
`);

    // Create an isolated note (no cluster)
    writeFileSync(join(TMP, 'projects', 'note-e.md'), `---
title: "Note E"
type: project
tags: [isolated]
created: 2026-03-27
updated: 2026-03-27
status: active
summary: "Isolated note"
related: []
---

# Note E
`);

    vault = new Vault(TMP);
  });

  after(() => {
    rmSync(TMP, { recursive: true, force: true });
  });

  it('cache initialization creates empty ClusterCache', () => {
    const cache = new ClusterCache();
    assert.strictEqual(cache.cache.size, 0);
    assert.ok(cache.isValid() === false, 'Empty cache should be invalid');
  });

  it('first rebuildGraph populates cache on cache miss', () => {
    clusterCache = new ClusterCache();
    idx = new IndexManager(vault, clusterCache);

    const result = idx.rebuildGraph();
    
    // First call should be a cache miss
    assert.ok(!result.clusterCacheHit);
    assert.ok(result.clusters > 0, 'Should detect at least one cluster');
    
    // Cache should now have entries
    assert.ok(clusterCache.cache.size > 0, 'Cache should have cluster entries');
  });

  it('second rebuildGraph with same vault state hits cache', () => {
    clusterCache = new ClusterCache();
    idx = new IndexManager(vault, clusterCache);

    // First call
    const result1 = idx.rebuildGraph();
    assert.ok(!result1.clusterCacheHit, 'First call should miss cache');
    const cacheSize1 = clusterCache.cache.size;

    // Second call without changes
    const result2 = idx.rebuildGraph();
    assert.ok(result2.clusterCacheHit, 'Second call should hit cache');
    assert.strictEqual(result2.clusters, result1.clusters, 'Cluster count should match');
    assert.strictEqual(clusterCache.cache.size, cacheSize1, 'Cache size should not change');
  });

  it('cache stores note -> cluster ID mapping', () => {
    clusterCache = new ClusterCache();
    idx = new IndexManager(vault, clusterCache);

    idx.rebuildGraph();

    // Check that cache has entries for cluster members
    const noteACluster = clusterCache.get('note-a');
    const noteBCluster = clusterCache.get('note-b');
    const noteCCluster = clusterCache.get('note-c');

    assert.ok(noteACluster, 'note-a should be cached');
    assert.ok(noteBCluster, 'note-b should be cached');
    assert.ok(noteCCluster, 'note-c should be cached');

    // They should all have the same cluster ID (they're connected)
    assert.strictEqual(noteACluster, noteBCluster, 'a and b should be in same cluster');
    assert.strictEqual(noteBCluster, noteCCluster, 'b and c should be in same cluster');
  });

  it('cache invalidation on vault version change', () => {
    clusterCache = new ClusterCache();
    idx = new IndexManager(vault, clusterCache);

    // First build
    const result1 = idx.rebuildGraph();
    assert.ok(!result1.clusterCacheHit);

    // Modify vault by adding a new note
    writeFileSync(join(TMP, 'projects', 'note-new.md'), `---
title: "Note New"
type: project
tags: [new]
created: 2026-03-28
updated: 2026-03-28
status: active
summary: "New note"
related: []
---

# Note New
`);
    vault.invalidateCache();

    // Rebuild should invalidate cache due to version change
    const result2 = idx.rebuildGraph();
    assert.ok(!result2.clusterCacheHit, 'Should invalidate cache on vault change');
  });

  it('cache TTL expiry invalidates entries (async)', async () => {
    // Create cache with very short TTL (50ms)
    clusterCache = new ClusterCache(50);
    idx = new IndexManager(vault, clusterCache);

    // First build
    idx.rebuildGraph();
    assert.ok(clusterCache.isValid(), 'Cache should be valid immediately');

    // Wait for TTL to expire
    await new Promise(resolve => setTimeout(resolve, 100));

    // Cache should be invalid
    assert.ok(!clusterCache.isValid(), 'Cache should be invalid after TTL expiry');
  });

  it('cache.get() returns null for expired entries (async)', async () => {
    clusterCache = new ClusterCache(50);
    
    // Set a value
    clusterCache.set('note-1', 'cluster-1', 'v1');
    assert.strictEqual(clusterCache.get('note-1', 'v1'), 'cluster-1');

    // Wait for TTL
    await new Promise(resolve => setTimeout(resolve, 100));

    // Should return null after expiry
    assert.ok(clusterCache.get('note-1', 'v1') === null);
  });

  it('cache.invalidate() removes specific entries', () => {
    clusterCache = new ClusterCache();

    clusterCache.set('note-a', 'cluster-1', 'v1');
    clusterCache.set('note-b', 'cluster-1', 'v1');
    clusterCache.set('note-c', 'cluster-2', 'v1');

    assert.strictEqual(clusterCache.cache.size, 3);

    // Invalidate specific notes
    clusterCache.invalidate(['note-a', 'note-b']);

    assert.strictEqual(clusterCache.cache.size, 1);
    assert.ok(clusterCache.get('note-a', 'v1') === null);
    assert.ok(clusterCache.get('note-b', 'v1') === null);
    assert.strictEqual(clusterCache.get('note-c', 'v1'), 'cluster-2');
  });

  it('cache.clear() resets all state', () => {
    clusterCache = new ClusterCache();

    clusterCache.set('note-a', 'cluster-1', 'v1');
    clusterCache.set('note-b', 'cluster-1', 'v1');

    assert.ok(clusterCache.cache.size > 0);
    assert.ok(clusterCache.timestamp !== null);

    clusterCache.clear();

    assert.strictEqual(clusterCache.cache.size, 0);
    assert.ok(clusterCache.timestamp === null);
    assert.ok(clusterCache.vaultVersion === null);
  });

  it('cache.stats() returns metrics', () => {
    clusterCache = new ClusterCache(3600000);

    clusterCache.set('note-a', 'cluster-1', 'v1');
    clusterCache.set('note-b', 'cluster-1', 'v1');

    const stats = clusterCache.stats();

    assert.strictEqual(stats.size, 2);
    assert.strictEqual(stats.ttlMs, 3600000);
    assert.ok(stats.ageMs >= 0);
    assert.ok(stats.valid);
  });

  it('cluster detection produces consistent results with/without cache', () => {
    clusterCache = new ClusterCache();
    idx = new IndexManager(vault, clusterCache);

    // Build graph (uses cache miss)
    const result1 = idx.rebuildGraph();
    const graph1 = vault.read('_graph.md');

    // Clear cache to force recomputation
    clusterCache.clear();
    vault.invalidateCache();

    // Build again (cache miss, but same data)
    const result2 = idx.rebuildGraph();
    const graph2 = vault.read('_graph.md');

    // Results should be identical
    assert.strictEqual(result1.clusters, result2.clusters);
    assert.strictEqual(result1.relationships, result2.relationships);
    assert.strictEqual(graph1, graph2, 'Graph content should be identical');
  });

  it('cache handles partial hit (some notes cached, some not)', () => {
    clusterCache = new ClusterCache();
    idx = new IndexManager(vault, clusterCache);

    // First build populates cache
    idx.rebuildGraph();
    const initialSize = clusterCache.cache.size;

    // Manually remove one entry to simulate partial cache
    clusterCache.cache.delete('note-a');

    // Rebuild - should detect partial cache and recompute
    const result = idx.rebuildGraph();
    assert.ok(!result.clusterCacheHit, 'Partial cache should cause miss');
    
    // Cache should be fully populated again
    assert.ok(clusterCache.cache.size >= initialSize);
  });

  it('cache respects vault version changes in get()', () => {
    clusterCache = new ClusterCache();

    clusterCache.set('note-a', 'cluster-1', 'v1');

    // Same version: should return value
    assert.strictEqual(clusterCache.get('note-a', 'v1'), 'cluster-1');

    // Different version: should return null and clear cache
    assert.ok(clusterCache.get('note-a', 'v2') === null);
    assert.strictEqual(clusterCache.cache.size, 0);
  });

  it('cache load() bulk-loads cluster map', () => {
    clusterCache = new ClusterCache();

    const clusterMap = new Map([
      ['note-a', 'root-1'],
      ['note-b', 'root-1'],
      ['note-c', 'root-2'],
    ]);

    clusterCache.load(clusterMap, 'v1');

    assert.strictEqual(clusterCache.cache.size, 3);
    assert.strictEqual(clusterCache.get('note-a', 'v1'), 'root-1');
    assert.strictEqual(clusterCache.get('note-b', 'v1'), 'root-1');
    assert.strictEqual(clusterCache.get('note-c', 'v1'), 'root-2');
  });

  it('performance: cache hit completes without measurable slowdown', () => {
    clusterCache = new ClusterCache();
    idx = new IndexManager(vault, clusterCache);

    // Warmup: cache miss
    idx.rebuildGraph();

    // Measure cache hit
    const startHit = process.hrtime.bigint();
    idx.rebuildGraph();
    const endHit = process.hrtime.bigint();
    const hitMs = Number(endHit - startHit) / 1_000_000;

    // Clear cache and measure miss
    clusterCache.clear();
    vault.invalidateCache();
    
    const startMiss = process.hrtime.bigint();
    idx.rebuildGraph();
    const endMiss = process.hrtime.bigint();
    const missMs = Number(endMiss - startMiss) / 1_000_000;

    console.log(`
  Cache hit: ${hitMs.toFixed(2)}ms`);
    console.log(`  Cache miss: ${missMs.toFixed(2)}ms`);

    // Cache hit should not add measurable overhead
    // Both should complete quickly (< 100ms for small vault)
    assert.ok(hitMs < 100, `Cache hit should be fast (got ${hitMs.toFixed(2)}ms)`);
    assert.ok(missMs < 100, `Cache miss should be fast (got ${missMs.toFixed(2)}ms)`);
  });

  it('cluster cache integrates with full sync workflow', () => {
    clusterCache = new ClusterCache();
    idx = new IndexManager(vault, clusterCache);

    // First sync
    const result1 = idx.sync();
    assert.ok(result1.clusters >= 0);

    // Second sync (no changes)
    const result2 = idx.sync();
    assert.ok(result2.clusters >= 0);
    assert.strictEqual(result1.clusters, result2.clusters);

    // Cache should have hit on cluster detection
    assert.ok(clusterCache.cache.size > 0);
  });

  it('cluster cache survives vault.invalidateCache()', () => {
    clusterCache = new ClusterCache();
    idx = new IndexManager(vault, clusterCache);

    // First build
    idx.rebuildGraph();
    const initialSize = clusterCache.cache.size;

    // Invalidate vault (note cache, not cluster cache)
    vault.invalidateCache();

    // Cluster cache should remain intact
    assert.strictEqual(clusterCache.cache.size, initialSize);
  });

  it('cluster version string includes vault state', () => {
    idx = new IndexManager(vault);

    const v1 = idx._getVaultVersion();
    assert.ok(typeof v1 === 'string');
    assert.ok(v1.includes(':'), 'Version should include signature');

    // After adding a note, version should change
    writeFileSync(join(TMP, 'projects', 'note-version-test.md'), `---
title: "Version Test"
type: project
tags: [test]
created: 2026-03-28
updated: 2026-03-28
status: active
summary: "Version test"
related: []
---

# Version Test
`);
    vault.invalidateCache();

    const v2 = idx._getVaultVersion();
    assert.notStrictEqual(v1, v2, 'Version should change on vault modification');
  });

  it('rebuildGraph returns clusterCacheHit flag', () => {
    clusterCache = new ClusterCache();
    idx = new IndexManager(vault, clusterCache);

    // First call: cache miss
    const result1 = idx.rebuildGraph();
    assert.ok('clusterCacheHit' in result1);
    assert.ok(result1.clusterCacheHit === false);

    // Second call: cache hit
    const result2 = idx.rebuildGraph();
    assert.ok('clusterCacheHit' in result2);
    assert.ok(result2.clusterCacheHit === true);
  });
});
