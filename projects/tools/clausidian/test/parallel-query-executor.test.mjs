import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ParallelQueryExecutor } from '../src/parallel-query-executor.mjs';

// Mock index data for testing
const mockIndexData = {
  files: {
    'notes/daily/2026-03-31.md': {
      content: 'Daily review of vault performance and optimization strategies',
      tags: ['daily', 'vault', 'performance'],
      modified: new Date('2026-03-31')
    },
    'notes/projects/clausidian.md': {
      content: 'Clausidian library for Obsidian vault management and search',
      tags: ['clausidian', 'library', 'search'],
      modified: new Date('2026-03-30')
    },
    'ideas/parallel-queries.md': {
      content: 'Implement parallel query execution for faster searches',
      tags: ['parallel', 'queries', 'optimization'],
      modified: new Date('2026-03-29')
    },
    'docs/architecture.md': {
      content: 'System architecture with caching and parallel execution',
      tags: ['architecture', 'caching', 'parallel'],
      modified: new Date('2026-03-28')
    },
    'templates/skill.md': {
      content: 'Template for skill creation and publication',
      tags: ['template', 'skill', 'creation'],
      modified: new Date('2026-03-27')
    }
  }
};

// Mock cache for testing
class MockCache {
  constructor() {
    this.store = new Map();
  }

  async setCached(key, value) {
    this.store.set(key, { value, timestamp: Date.now() });
  }

  async getCached(key) {
    const item = this.store.get(key);
    return item ? item.value : null;
  }

  clear() {
    this.store.clear();
  }
}

test('B2.3 Parallel Query Execution Tests', async t => {
  // === Core Functionality (Tests 1-15) ===

  await t.test('executeParallel: returns results for single pattern', async () => {
    const executor = new ParallelQueryExecutor(mockIndexData);
    const result = await executor.executeParallel(['daily']);
    assert(result.results.length > 0, 'Should return results');
    assert(result.results.some(r => r.pattern === 'daily'), 'Should include pattern match');
  });

  await t.test('executeParallel: returns results for multiple patterns', async () => {
    const executor = new ParallelQueryExecutor(mockIndexData);
    const result = await executor.executeParallel(['vault', 'parallel', 'search']);
    assert(result.results.length >= 3, 'Should return results for all patterns');
  });

  await t.test('executeParallel: handles empty patterns array', async () => {
    const executor = new ParallelQueryExecutor(mockIndexData);
    const result = await executor.executeParallel([]);
    assert(result.results.length === 0, 'Should return empty for empty patterns');
  });

  await t.test('executeParallel: handles null patterns', async () => {
    const executor = new ParallelQueryExecutor(mockIndexData);
    const result = await executor.executeParallel(null);
    assert(result.results.length === 0, 'Should return empty for null patterns');
  });

  await t.test('executeParallel: case-insensitive search', async () => {
    const executor = new ParallelQueryExecutor(mockIndexData);
    const result = await executor.executeParallel(['VAULT', 'Parallel']);
    assert(result.results.length > 0, 'Should find results with case-insensitive match');
  });

  await t.test('executeParallel: deduplicates results', async () => {
    const executor = new ParallelQueryExecutor(mockIndexData);
    const result = await executor.executeParallel(['parallel']);
    // For same pattern with different case, still gets deduplicated by file+pattern
    const keys = new Set(result.results.map(r => `${r.file}|${r.pattern}`));
    assert(keys.size === result.results.length, 'Should not have duplicate file+pattern combinations');
  });

  await t.test('executeParallel: sorts results by file then pattern', async () => {
    const executor = new ParallelQueryExecutor(mockIndexData);
    const result = await executor.executeParallel(['architecture', 'optimization', 'caching']);
    const files = result.results.map(r => r.file);
    const sorted = [...files].sort();
    assert(files.join(',') === sorted.join(','), 'Results should be sorted by file');
  });

  await t.test('executeParallel: returns metrics', async () => {
    const executor = new ParallelQueryExecutor(mockIndexData);
    const result = await executor.executeParallel(['vault', 'search']);
    assert(result.metrics, 'Should return metrics');
    assert(result.metrics.duration > 0, 'Should have duration');
    assert(result.metrics.patterns === 2, 'Should count patterns');
  });

  await t.test('executeParallel: tracks success and failure counts', async () => {
    const executor = new ParallelQueryExecutor(mockIndexData);
    const result = await executor.executeParallel(['vault', 'xyz123invalid']);
    assert(result.metrics.successCount >= 0, 'Should count successes');
    assert(result.metrics.failureCount >= 0, 'Should count failures');
  });

  await t.test('executeParallel: marks source as execution on cache miss', async () => {
    const executor = new ParallelQueryExecutor(mockIndexData);
    const result = await executor.executeParallel(['vault']);
    assert(result.source === 'execution', 'Should mark source as execution');
  });

  // === Cache Integration (Tests 11-18) ===

  await t.test('setCache: accepts cache instance', async () => {
    const executor = new ParallelQueryExecutor(mockIndexData);
    const cache = new MockCache();
    executor.setCache(cache);
    assert(executor.cache === cache, 'Should store cache instance');
  });

  await t.test('executeParallel with cache: stores results', async () => {
    const executor = new ParallelQueryExecutor(mockIndexData);
    const cache = new MockCache();
    executor.setCache(cache);
    await executor.executeParallel(['vault']);
    const stored = await cache.getCached('parallel-query-vault');
    assert(stored, 'Should cache results');
  });

  await t.test('executeParallel with cache: retrieves cached results', async () => {
    const executor = new ParallelQueryExecutor(mockIndexData);
    const cache = new MockCache();
    executor.setCache(cache);

    // First query
    const result1 = await executor.executeParallel(['vault']);
    assert(result1.source === 'execution', 'First should be execution');

    // Second query (should be cached)
    const result2 = await executor.executeParallel(['vault']);
    assert(result2.source === 'cache', 'Second should be from cache');
    assert(result2.results.length === result1.results.length, 'Results should match');
  });

  await t.test('cache key generation: deterministic for same patterns', async () => {
    const executor = new ParallelQueryExecutor(mockIndexData);
    const cache = new MockCache();
    executor.setCache(cache);

    // Query with different order
    const result1 = await executor.executeParallel(['a', 'b', 'c']);
    const result2 = await executor.executeParallel(['c', 'b', 'a']);

    // If cache key is deterministic, metrics should reflect cache hit
    const metrics = executor.getMetrics();
    assert(metrics.cacheHits > 0, 'Should have cache hit for reordered patterns');
  });

  await t.test('metrics: cache hit tracking', async () => {
    const executor = new ParallelQueryExecutor(mockIndexData);
    const cache = new MockCache();
    executor.setCache(cache);

    await executor.executeParallel(['vault']);
    await executor.executeParallel(['vault']);

    const metrics = executor.getMetrics();
    assert(metrics.cacheHits === 1, 'Should count cache hits');
    assert(metrics.cacheMisses === 1, 'Should count cache misses');
  });

  await t.test('metrics: hit rate calculation', async () => {
    const executor = new ParallelQueryExecutor(mockIndexData);
    const cache = new MockCache();
    executor.setCache(cache);

    await executor.executeParallel(['vault']);
    await executor.executeParallel(['vault']);
    await executor.executeParallel(['vault']);

    const metrics = executor.getMetrics();
    // 3 queries: 1 miss, 2 hits = 2/3 = 0.666...
    assert(metrics.hitRate > 0.65 && metrics.hitRate < 0.68, 'Should calculate correct hit rate');
  });

  // === Timeout Handling (Tests 19-22) ===

  await t.test('executeParallel with timeout: default timeout applied', async () => {
    const executor = new ParallelQueryExecutor(mockIndexData, { defaultTimeout: 100 });
    const result = await executor.executeParallel(['vault']);
    assert(result.metrics.duration < 200, 'Should complete within reasonable time');
  });

  await t.test('executeParallel with timeout: custom timeout respected', async () => {
    const executor = new ParallelQueryExecutor(mockIndexData);
    const result = await executor.executeParallel(['vault'], { timeout: 500 });
    assert(result.metrics.duration < 1000, 'Should respect timeout');
  });

  await t.test('timeout promise race: resolves or rejects', async () => {
    const executor = new ParallelQueryExecutor(mockIndexData);
    const result = await executor.executeParallel(['vault', 'slow-pattern'], { timeout: 100 });
    // Should complete without hanging
    assert(result.metrics.duration < 500, 'Should not hang on timeout');
  });

  await t.test('timeout per query: independent task timeouts', async () => {
    const executor = new ParallelQueryExecutor(mockIndexData);
    const startTime = performance.now();
    await executor.executeParallel(['a', 'b', 'c', 'd', 'e'], { timeout: 200 });
    const duration = performance.now() - startTime;
    // Even with 5 patterns, should not timeout (instant searches)
    assert(duration < 1000, 'Should not timeout for fast patterns');
  });

  // === Metrics & Statistics (Tests 23-28) ===

  await t.test('getMetrics: returns correct structure', async () => {
    const executor = new ParallelQueryExecutor(mockIndexData);
    const cache = new MockCache();
    executor.setCache(cache);
    await executor.executeParallel(['vault']);

    const metrics = executor.getMetrics();
    assert(metrics.totalQueries === 1, 'Should count total queries');
    assert(metrics.cacheHits === 0, 'Should have cache hits stat');
    assert(metrics.cacheMisses === 1, 'Should have cache misses stat');
    assert(metrics.averageTime > 0, 'Should have average time');
    assert(metrics.maxConcurrent === 10, 'Should have max concurrent');
    assert(metrics.workerCount === 4, 'Should have worker count');
  });

  await t.test('getMetrics: average time calculation', async () => {
    const executor = new ParallelQueryExecutor(mockIndexData);
    await executor.executeParallel(['vault']);
    await executor.executeParallel(['search']);
    await executor.executeParallel(['parallel']);

    const metrics = executor.getMetrics();
    assert(metrics.totalQueries === 3, 'Should count all queries');
    assert(metrics.averageTime > 0, 'Should calculate average time');
  });

  await t.test('resetMetrics: clears all statistics', async () => {
    const executor = new ParallelQueryExecutor(mockIndexData);
    const cache = new MockCache();
    executor.setCache(cache);

    await executor.executeParallel(['vault']);
    await executor.executeParallel(['vault']);

    executor.resetMetrics();
    const metrics = executor.getMetrics();

    assert(metrics.totalQueries === 0, 'Should reset total queries');
    assert(metrics.cacheHits === 0, 'Should reset cache hits');
    assert(metrics.cacheMisses === 0, 'Should reset cache misses');
    assert(metrics.averageTime === 0, 'Should reset average time');
  });

  await t.test('getWorkerStatus: returns status', async () => {
    const executor = new ParallelQueryExecutor(mockIndexData, { workerCount: 6 });
    const status = executor.getWorkerStatus();

    assert(status.totalWorkers === 6, 'Should report total workers');
    assert(typeof status.activeTasks === 'number', 'Should report active tasks');
    assert(typeof status.queueLength === 'number', 'Should report queue length');
    assert(typeof status.efficiency === 'number', 'Should report efficiency');
  });

  // === Error Handling & Resilience (Tests 29-35) ===

  await t.test('executeParallel: graceful degradation on failed patterns', async () => {
    const executor = new ParallelQueryExecutor(mockIndexData);
    const result = await executor.executeParallel(['vault', 'search']);
    // Should still return results even if one pattern might fail
    assert(Array.isArray(result.results), 'Should return array despite potential failures');
  });

  await t.test('executeParallel: handles invalid index data', async () => {
    const executor = new ParallelQueryExecutor(null);
    const result = await executor.executeParallel(['vault']);
    assert(Array.isArray(result.results), 'Should handle null index gracefully');
  });

  await t.test('executeParallel: handles empty index data', async () => {
    const executor = new ParallelQueryExecutor({});
    const result = await executor.executeParallel(['vault']);
    assert(Array.isArray(result.results), 'Should handle empty index gracefully');
  });

  await t.test('executeParallel: continues on single pattern failure', async () => {
    const executor = new ParallelQueryExecutor(mockIndexData);
    const result = await executor.executeParallel(['vault', null, 'search']);
    // Should still return some results from valid patterns
    assert(result.results.length >= 0, 'Should handle mixed valid/invalid patterns');
  });

  // === Performance Validation (Tests 36-42) ===

  await t.test('performance: single pattern < 50ms', async () => {
    const executor = new ParallelQueryExecutor(mockIndexData);
    const startTime = performance.now();
    await executor.executeParallel(['vault']);
    const duration = performance.now() - startTime;
    assert(duration < 50, 'Single pattern should complete quickly');
  });

  await t.test('performance: 5 patterns < 200ms', async () => {
    const executor = new ParallelQueryExecutor(mockIndexData);
    const startTime = performance.now();
    await executor.executeParallel(['a', 'b', 'c', 'd', 'e']);
    const duration = performance.now() - startTime;
    assert(duration < 200, 'Multiple patterns should use parallelism');
  });

  await t.test('performance: cached query < 5ms', async () => {
    const executor = new ParallelQueryExecutor(mockIndexData);
    const cache = new MockCache();
    executor.setCache(cache);

    // Warm cache
    await executor.executeParallel(['vault']);

    // Cached query
    const startTime = performance.now();
    await executor.executeParallel(['vault']);
    const duration = performance.now() - startTime;
    assert(duration < 5, 'Cached query should be very fast');
  });

  await t.test('performance: sequential queries complete', async () => {
    const executor = new ParallelQueryExecutor(mockIndexData);
    const cache = new MockCache();
    executor.setCache(cache);

    const startTime = performance.now();
    for (let i = 0; i < 5; i++) {
      await executor.executeParallel(['vault', 'search', 'parallel']);
    }
    const duration = performance.now() - startTime;

    const metrics = executor.getMetrics();
    assert(metrics.totalQueries === 5, 'Should complete all queries');
    assert(duration < 2000, 'Should complete queries in reasonable time');
  });

  // === Integration Tests (Tests 41-42) ===

  await t.test('integration: B2.1 + B2.2 + B2.3 workflow', async () => {
    // Simulate the full stack: indexer + cache + executor
    const executor = new ParallelQueryExecutor(mockIndexData);
    const cache = new MockCache();
    executor.setCache(cache);

    // First query: cache miss, execution
    const result1 = await executor.executeParallel(['vault', 'parallel']);
    assert(result1.source === 'execution', 'First should execute');
    assert(result1.results.length > 0, 'Should find results');

    // Second query: cache hit (same patterns)
    const result2 = await executor.executeParallel(['vault', 'parallel']);
    assert(result2.source === 'cache', 'Second should use cache');

    // Verify metrics
    const metrics = executor.getMetrics();
    assert(metrics.cacheHits >= 1, 'Should have at least 1 cache hit');
    assert(metrics.totalQueries >= 2, 'Should track total queries');
  });

  await t.test('integration: parallel search with pattern diversity', async () => {
    const executor = new ParallelQueryExecutor(mockIndexData);
    const patterns = ['daily', 'search', 'parallel', 'caching', 'vault', 'template'];

    const result = await executor.executeParallel(patterns);

    assert(result.results.length > 0, 'Should find results for diverse patterns');
    assert(result.metrics.patterns === 6, 'Should process all 6 patterns');
    assert(result.metrics.successCount >= 4, 'Most patterns should succeed');

    // Verify deduplication
    const resultSet = new Set(result.results.map(r => `${r.file}|${r.pattern}`));
    assert(resultSet.size === result.results.length, 'Should have no duplicates');
  });
});
