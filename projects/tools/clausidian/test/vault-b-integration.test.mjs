import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Vault } from '../src/vault.mjs';
import { tmpdir } from 'os';
import { mkdtempSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

// Setup test vault
function createTestVault() {
  const testDir = mkdtempSync(join(tmpdir(), 'vault-b-test-'));
  const dirs = ['areas', 'projects', 'ideas'];
  for (const dir of dirs) {
    mkdirSync(join(testDir, dir), { recursive: true });
  }

  // Create test notes
  const notes = [
    { name: 'test1.md', content: '---\ntags: [vault, search]\n---\nVault test content' },
    { name: 'test2.md', content: '---\ntags: [parallel, query]\n---\nParallel query test' },
    { name: 'test3.md', content: '---\ntags: [cache, optimization]\n---\nCache optimization notes' }
  ];

  for (const note of notes) {
    writeFileSync(join(testDir, 'projects', note.name), note.content);
  }

  return testDir;
}

test('Vault B Integration Tests', async t => {
  // === B2.1 Indexer Integration (Tests 1-3) ===

  await t.test('B2.1: VaultIndexer initializes correctly', async () => {
    const testDir = createTestVault();
    const vault = new Vault(testDir);
    vault._initializeIndexer();

    assert(vault.indexer, 'Should create indexer instance');
  });

  await t.test('B2.1: indexer has metadata extracted', async () => {
    const testDir = createTestVault();
    const vault = new Vault(testDir);
    vault._initializeIndexer();

    // Indexer object should exist and have methods
    assert(vault.indexer.getIncrementalStats, 'Should have getIncrementalStats method');
    const stats = vault.indexer.getIncrementalStats();
    assert(stats, 'Should return stats object');
  });

  // === B2.2 Cache Integration (Tests 4-7) ===

  await t.test('B2.2: VaultQueryCache initializes', async () => {
    const testDir = createTestVault();
    const vault = new Vault(testDir);
    vault._initializeQueryCache();

    assert(vault.queryCache, 'Should create cache instance');
  });

  await t.test('B2.2: Cache stores search results', async () => {
    const testDir = createTestVault();
    const vault = new Vault(testDir);
    vault._initializeQueryCache();

    const testData = [{ file: 'test.md', content: 'test' }];
    vault.queryCache.setCached('test-pattern', testData);

    const cached = vault.queryCache.getCached('test-pattern');
    assert(cached, 'Should retrieve cached data');
  });

  await t.test('B2.2: Cache invalidation works', async () => {
    const testDir = createTestVault();
    const vault = new Vault(testDir);
    vault._initializeQueryCache();

    vault.queryCache.setCached('pattern1', [{ test: 'data' }]);
    vault.queryCache.clearCache();

    const cached = vault.queryCache.getCached('pattern1');
    assert(!cached || cached === null, 'Should clear cache');
  });

  // === B2.3 Parallel Executor Integration (Tests 8-10) ===

  await t.test('B2.3: ParallelQueryExecutor initializes', async () => {
    const testDir = createTestVault();
    const vault = new Vault(testDir);
    vault._initializeParallelExecutor();

    assert(vault.parallelExecutor, 'Should create executor instance');
  });

  await t.test('B2.3: searchParallel executes multiple patterns', async () => {
    const testDir = createTestVault();
    const vault = new Vault(testDir);

    const results = await vault.searchParallel(['test', 'vault']);
    assert(Array.isArray(results), 'Should return array');
  });

  await t.test('B2.3: searchParallel with disabled parallel falls back', async () => {
    const testDir = createTestVault();
    const vault = new Vault(testDir, { enableParallel: false });

    const results = await vault.searchParallel(['test']);
    assert(Array.isArray(results), 'Should still return results');
  });

  // === Metrics Integration (Tests 11-14) ===

  await t.test('Metrics: getSearchMetrics returns structure', async () => {
    const testDir = createTestVault();
    const vault = new Vault(testDir);

    const metrics = vault.getSearchMetrics();
    assert(metrics, 'Should return metrics object');
    assert(typeof metrics.totalQueries === 'number', 'Should have totalQueries count');
    assert(typeof metrics.cacheHits === 'number', 'Should have cacheHits count');
  });

  await t.test('Metrics: resetSearchMetrics clears stats', async () => {
    const testDir = createTestVault();
    const vault = new Vault(testDir);

    vault.searchMetrics.queries = 10;
    vault.resetSearchMetrics();

    const metrics = vault.getSearchMetrics();
    assert(metrics.totalQueries === 0, 'Should reset query count');
  });

  // === Cache Integration with Search (Tests 15-16) ===

  await t.test('Vault cache invalidation on vault write', async () => {
    const testDir = createTestVault();
    const vault = new Vault(testDir);
    vault._initializeQueryCache();

    vault.queryCache.setCached('pattern', [{ test: 'data' }]);
    vault.invalidateCache();

    assert(!vault.queryCache.getCached('pattern'), 'Cache should be cleared after invalidation');
  });

  // === Integration Workflow (Tests 17-19) ===

  await t.test('Full B2.1+B2.2+B2.3 workflow: indexed → cached → parallel', async () => {
    const testDir = createTestVault();
    const vault = new Vault(testDir);

    // Initialize all three components
    vault._initializeIndexer();
    vault._initializeQueryCache();
    vault._initializeParallelExecutor();

    // All should be initialized
    assert(vault.indexer, 'Indexer should be initialized');
    assert(vault.queryCache, 'Cache should be initialized');
    assert(vault.parallelExecutor, 'Executor should be initialized');

    // Execute parallel search
    const results = await vault.searchParallel(['test']);
    assert(Array.isArray(results), 'Should return results from full pipeline');
  });

  await t.test('Backward compatibility: vault works without B integration', async () => {
    const testDir = createTestVault();
    const vault = new Vault(testDir, { enableParallel: false });

    // Metrics should be initialized
    const metrics = vault.getSearchMetrics();
    assert(metrics, 'Should have metrics even with parallel disabled');
  });

  await t.test('B integration: no breaking changes to existing API', async () => {
    const testDir = createTestVault();
    const vault = new Vault(testDir);

    // Existing methods should still work
    const notes = vault.scanNotes();
    assert(Array.isArray(notes), 'scanNotes() should still work');

    const stats = vault.stats();
    assert(stats, 'stats() should still work');
  });
});
