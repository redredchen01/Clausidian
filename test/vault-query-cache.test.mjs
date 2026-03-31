/**
 * Vault Query Cache Test Suite (20+ test cases)
 */

import { strict as assert } from 'assert';
import { promises as fs } from 'fs';
import { homedir } from 'os';
import { resolve } from 'path';
import { randomBytes } from 'crypto';
import { VaultQueryCache } from '../src/vault-query-cache.mjs';

async function createTempDir() {
  const tmpDir = resolve('/tmp', `cache-test-${randomBytes(8).toString('hex')}`);
  await fs.mkdir(tmpDir, { recursive: true });
  return tmpDir;
}

async function cleanupDir(dir) {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = resolve(dir, entry.name);
      if (entry.isDirectory()) {
        await cleanupDir(fullPath);
      } else {
        await fs.unlink(fullPath);
      }
    }
    await fs.rmdir(dir);
  } catch (err) {
    // Silent fail
  }
}

class MockVaultIndexer {
  constructor() {
    this.index = {
      metadata: {
        'ideas.md': {
          title: 'Ideas List',
          tags: ['ideas', 'brainstorm'],
          keywords: ['concept', 'thought'],
          snippet: 'Brainstorming ideas for projects',
        },
        'api-docs.md': {
          title: 'API Documentation',
          tags: ['api', 'reference'],
          keywords: ['endpoint', 'request', 'response'],
          snippet: 'REST API documentation for services',
        },
        'urgent-tasks.md': {
          title: 'Urgent Tasks',
          tags: ['urgent', 'today'],
          keywords: ['blocking', 'critical'],
          snippet: 'Critical items that need attention',
        },
        'database-schema.md': {
          title: 'Database Schema',
          tags: ['database', 'schema', 'backend'],
          keywords: ['table', 'column', 'relation'],
          snippet: 'Database schema definition and relationships',
        },
      },
    };
  }
}

let testResults = { passed: 0, failed: 0, errors: [] };

async function test(name, fn) {
  try {
    await fn();
    testResults.passed++;
    console.log(`✓ ${name}`);
  } catch (err) {
    testResults.failed++;
    testResults.errors.push({ test: name, error: err.message });
    console.error(`✗ ${name}: ${err.message}`);
  }
}

// Tests: Cache Key Generation
await test('getCacheKey: generates deterministic keys', async () => {
  const cache = new VaultQueryCache();
  const key1 = cache.getCacheKey('ideas', { tag: 'brainstorm' });
  const key2 = cache.getCacheKey('ideas', { tag: 'brainstorm' });
  const key3 = cache.getCacheKey('ideas', { tag: 'planning' });
  assert.equal(key1, key2);
  assert.notEqual(key1, key3);
});

await test('getCacheKey: case insensitive', async () => {
  const cache = new VaultQueryCache();
  const key1 = cache.getCacheKey('Ideas');
  const key2 = cache.getCacheKey('IDEAS');
  const key3 = cache.getCacheKey('ideas');
  assert.equal(key1, key2);
  assert.equal(key2, key3);
});

// Tests: TTL Pattern Detection
await test('_getTTLCategory: detects stable patterns', async () => {
  const cache = new VaultQueryCache();
  assert.equal(cache._getTTLCategory('ideas'), 'stable');
  assert.equal(cache._getTTLCategory('Ideas'), 'stable');
  assert.equal(cache._getTTLCategory('SKILLS'), 'stable');
  assert.equal(cache._getTTLCategory('templates'), 'stable');
  assert.equal(cache._getTTLCategory('archive-2025'), 'stable');
});

await test('_getTTLCategory: detects time-sensitive patterns', async () => {
  const cache = new VaultQueryCache();
  assert.equal(cache._getTTLCategory('urgent'), 'timeSensitive');
  assert.equal(cache._getTTLCategory('recent'), 'timeSensitive');
  assert.equal(cache._getTTLCategory('TODAY'), 'timeSensitive');
  assert.equal(cache._getTTLCategory('inbox'), 'timeSensitive');
  assert.equal(cache._getTTLCategory('inbox-work'), 'timeSensitive');
});

await test('_getTTLCategory: detects general patterns', async () => {
  const cache = new VaultQueryCache();
  assert.equal(cache._getTTLCategory('api'), 'general');
  assert.equal(cache._getTTLCategory('database'), 'general');
  assert.equal(cache._getTTLCategory('CONFIG'), 'general');
});

// Tests: Cache Storage and Retrieval
await test('setCached/getCached: stores and retrieves', async () => {
  const cache = new VaultQueryCache();
  const key = cache.getCacheKey('ideas');
  const value = { data: 'test' };
  cache.setCached(key, value, 60000, 'ideas');
  const retrieved = cache.getCached(key);
  assert.deepEqual(retrieved, value);
});

await test('getCached: returns null for missing key', async () => {
  const cache = new VaultQueryCache();
  assert.equal(cache.getCached('nonexistent'), null);
});

await test('getCached: respects TTL expiration', async () => {
  const cache = new VaultQueryCache();
  const key = cache.getCacheKey('urgent');
  cache.setCached(key, { data: 'info' }, 1, 'urgent');
  assert.deepEqual(cache.getCached(key), { data: 'info' });
  await new Promise(r => setTimeout(r, 10));
  assert.equal(cache.getCached(key), null);
});

// Tests: Query Caching
await test('queryWithCache: returns fresh on miss', async () => {
  const cache = new VaultQueryCache();
  let callCount = 0;
  const result = await cache.queryWithCache('ideas', async () => {
    callCount++;
    return { data: 'ideas' };
  });
  assert.equal(callCount, 1);
  assert.equal(cache.stats.misses, 1);
  assert.equal(cache.stats.hits, 0);
});

await test('queryWithCache: returns cached on hit', async () => {
  const cache = new VaultQueryCache();
  let callCount = 0;
  const result1 = await cache.queryWithCache('api', async () => {
    callCount++;
    return { data: 'api' };
  });
  const result2 = await cache.queryWithCache('api', async () => {
    callCount++;
    return { data: 'different' };
  });
  assert.equal(callCount, 1);
  assert.deepEqual(result1, result2);
  assert.equal(cache.stats.hits, 1);
});

// Tests: Cache Invalidation
await test('invalidateCache: clears matching patterns', async () => {
  const cache = new VaultQueryCache();
  cache.setCached(cache.getCacheKey('api-docs'), { data: 1 }, 60000, 'api-docs');
  cache.setCached(cache.getCacheKey('api-ref'), { data: 2 }, 60000, 'api-ref');
  cache.setCached(cache.getCacheKey('ideas'), { data: 3 }, 60000, 'ideas');
  assert.equal(cache.cache.size, 3);
  const count = cache.invalidateCache('api');
  assert.equal(count, 2);
  assert.equal(cache.cache.size, 1);
});

// Tests: Cache Warm-up
await test('warmupCache: pre-loads patterns', async () => {
  const mockIndexer = new MockVaultIndexer();
  const cache = new VaultQueryCache(null, mockIndexer);
  const count = await cache.warmupCache();
  assert.equal(count, 10);
  assert.equal(cache.cache.size, 10);
});

// Tests: Cache Statistics
await test('getCacheStats: calculates hit rate', async () => {
  const cache = new VaultQueryCache();
  cache.stats.hits = 7;
  cache.stats.misses = 3;
  const stats = cache.getCacheStats();
  assert.equal(stats.hitRate, '70.00%');
});

await test('getCacheStats: handles zero hits', async () => {
  const cache = new VaultQueryCache();
  const stats = cache.getCacheStats();
  assert.equal(stats.hitRate, '0.00%');
});

// Tests: Cache Persistence
await test('saveCache/loadCache: persists to disk', async () => {
  const tmpDir = await createTempDir();
  const cachePath = resolve(tmpDir, 'cache.json');
  const cache1 = new VaultQueryCache(cachePath);
  cache1.setCached(cache1.getCacheKey('ideas'), { data: 'ideas' }, 60000, 'ideas');
  const saved = await cache1.saveCache();
  assert(saved);
  const cache2 = new VaultQueryCache(cachePath);
  const loaded = await cache2.loadCache();
  assert(loaded);
  assert.equal(cache2.cache.size, 1);
  await cleanupDir(tmpDir);
});

// Tests: Cache Management
await test('clearCache: removes entries', async () => {
  const cache = new VaultQueryCache();
  cache.setCached(cache.getCacheKey('ideas'), { data: 1 }, 60000, 'ideas');
  cache.setCached(cache.getCacheKey('api'), { data: 2 }, 60000, 'api');
  assert.equal(cache.cache.size, 2);
  const cleared = cache.clearCache();
  assert.equal(cleared, 2);
  assert.equal(cache.cache.size, 0);
});

await test('resetStats: clears statistics', async () => {
  const cache = new VaultQueryCache();
  cache.stats.hits = 10;
  cache.stats.misses = 5;
  cache.resetStats();
  assert.equal(cache.stats.hits, 0);
  assert.equal(cache.stats.misses, 0);
});

// Tests: Memory Safety
await test('concurrent access: safe operations', async () => {
  const cache = new VaultQueryCache();
  const queries = [];
  for (let i = 0; i < 100; i++) {
    queries.push(
      cache.queryWithCache(`query-${i % 10}`, async () => {
        await new Promise(r => setTimeout(r, Math.random() * 5));
        return { data: i };
      })
    );
  }
  await Promise.all(queries);
  assert.equal(cache.cache.size, 10);
});

// Summary
console.log('\n' + '='.repeat(60));
console.log(`Test Results: ${testResults.passed} passed, ${testResults.failed} failed`);
console.log('='.repeat(60));
if (testResults.failed > 0) {
  console.error('\nFailures:');
  for (const { test: name, error } of testResults.errors) {
    console.error(`  - ${name}: ${error}`);
  }
  process.exit(1);
}
console.log('\n✓ All tests passed!');
