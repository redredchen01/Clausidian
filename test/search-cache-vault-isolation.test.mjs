import test from 'node:test';
import assert from 'node:assert/strict';
import { SearchCache } from '../src/search-cache.mjs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { promises as fs } from 'fs';

test('SearchCache vault isolation', async (t) => {
  let tmpDir;

  t.before(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'search-cache-vault-'));
  });

  t.after(() => {
    try {
      rmSync(tmpDir, { recursive: true });
    } catch (err) {
      // ignore
    }
  });

  await t.test('1. Cache key includes vault name prefix', () => {
    const cache = new SearchCache();

    // Key with vault name
    const key1 = cache._getCacheKey('test', 'vault1', {});
    assert(key1.startsWith('vault1|'), 'Key should start with vault1|');

    // Key without vault name (defaults to 'default')
    const key2 = cache._getCacheKey('test', null, {});
    assert(key2.startsWith('default|'), 'Key should start with default|');

    // Key with no vault specified (backward compatibility)
    const key3 = cache._getCacheKey('test', {});
    assert(key3.startsWith('default|'), 'Key without vault should default to default|');
  });

  await t.test('2. Different vaults have isolated cache keys', () => {
    const cache = new SearchCache();

    const key1 = cache._getCacheKey('search', 'vault-a', {});
    const key2 = cache._getCacheKey('search', 'vault-b', {});

    assert.notEqual(key1, key2, 'Keys for different vaults should be different');
    assert(key1.startsWith('vault-a|'), 'vault-a key should have vault-a prefix');
    assert(key2.startsWith('vault-b|'), 'vault-b key should have vault-b prefix');
  });

  await t.test('3. Same keyword in different vaults does not collide', () => {
    const cache = new SearchCache();

    // Set same keyword in different vaults
    cache.set('query', 'vault-a', {}, ['result-a']);
    cache.set('query', 'vault-b', {}, ['result-b']);

    // Retrieve from different vaults
    const resultA = cache.get('query', 'vault-a', {});
    const resultB = cache.get('query', 'vault-b', {});

    assert.deepEqual(resultA, ['result-a'], 'vault-a should have its own result');
    assert.deepEqual(resultB, ['result-b'], 'vault-b should have its own result');
  });

  await t.test('4. get() respects vault isolation', () => {
    const cache = new SearchCache();

    // Set in vault1
    cache.set('test', 'vault1', {}, ['vault1-data']);

    // Try to get from vault1 (should hit)
    const result1 = cache.get('test', 'vault1', {});
    assert.deepEqual(result1, ['vault1-data'], 'Should retrieve data from vault1');

    // Try to get from vault2 (should miss)
    const result2 = cache.get('test', 'vault2', {});
    assert.equal(result2, null, 'Should not cross-vault retrieve');

    // Try to get without vault (default, should miss)
    const result3 = cache.get('test', null, {});
    assert.equal(result3, null, 'Should not retrieve from different vault context');
  });

  await t.test('5. set() respects vault isolation', () => {
    const cache = new SearchCache();

    // Set in different vaults with same keyword
    cache.set('query', 'vault-x', {}, ['x-data']);
    cache.set('query', 'vault-y', {}, ['y-data']);
    cache.set('query', null, {}, ['default-data']);

    // Verify all are stored separately
    assert.deepEqual(cache.get('query', 'vault-x', {}), ['x-data']);
    assert.deepEqual(cache.get('query', 'vault-y', {}), ['y-data']);
    assert.deepEqual(cache.get('query', null, {}), ['default-data']);

    // Verify they're different entries
    const stats = cache.stats();
    assert.equal(stats.totalEntries, 3, 'Should have 3 separate cache entries');
  });

  await t.test('6. Disk persistence includes vault name in cache', async () => {
    const cache = new SearchCache();
    const cachePath = join(tmpDir, 'vault-persist.json');

    // Set data in different vaults
    cache.set('q1', 'vault1', {}, ['data1']);
    cache.set('q2', 'vault2', {}, ['data2']);

    await cache.saveToDisk(cachePath, 'v1.0.0');

    // Load and verify
    const data = JSON.parse(await fs.readFile(cachePath, 'utf8'));
    assert(Array.isArray(data.entries), 'Entries should be array');
    assert.equal(data.entries.length, 2, 'Should have 2 cache entries');

    // Verify vault names are in keys
    const keys = data.entries.map(([key]) => key);
    assert(keys.some(k => k.startsWith('vault1|')), 'Should have vault1 key');
    assert(keys.some(k => k.startsWith('vault2|')), 'Should have vault2 key');
  });

  await t.test('7. Backward compatibility: null vaultName works', () => {
    const cache = new SearchCache();

    // Old API: cache.set(keyword, options, results)
    cache.set('old-query', {}, ['old-results']);
    const result = cache.get('old-query', {});
    assert.deepEqual(result, ['old-results'], 'Backward compatibility should work');

    // New API: cache.set(keyword, vaultName, options, results)
    cache.set('new-query', 'vault1', {}, ['new-results']);
    const result2 = cache.get('new-query', 'vault1', {});
    assert.deepEqual(result2, ['new-results'], 'New vault-aware API should work');
  });

  await t.test('8. Clear operations are vault-aware', () => {
    const cache = new SearchCache();

    // Set in multiple vaults
    cache.set('q1', 'vault1', {}, ['data1']);
    cache.set('q2', 'vault2', {}, ['data2']);

    // Invalidate only in vault1
    cache.invalidate('q1', 'vault1', {});

    // Check results
    assert.equal(cache.get('q1', 'vault1', {}), null, 'vault1 entry should be cleared');
    assert.deepEqual(cache.get('q2', 'vault2', {}), ['data2'], 'vault2 entry should remain');

    // Global clear should clear all
    cache.clear();
    assert.equal(cache.get('q2', 'vault2', {}), null, 'All entries should be cleared');
  });

  await t.test('9. Stats include vault information', () => {
    const cache = new SearchCache();

    // Set data in vault1
    cache.set('q1', 'vault1', {}, ['data']);
    cache.get('q1', 'vault1', {}); // hit

    // Set data in vault2
    cache.set('q2', 'vault2', {}, ['data']);
    cache.get('q2', 'vault2', {}); // hit

    // Get stats
    const stats = cache.stats();
    assert.equal(stats.totalEntries, 2, 'Should have 2 entries total');
    assert.equal(stats.hits, 2, 'Should have 2 hits');
    assert.equal(stats.vaultName, 'all', 'Global stats should show "all"');

    // Vault-specific stats
    const vault1Stats = cache.stats('vault1');
    assert.equal(vault1Stats.vaultName, 'vault1', 'Vault-specific stats should show vault name');
  });

  await t.test('10. Hit/miss counts are per-vault isolated', () => {
    const cache = new SearchCache();

    // Operations in vault1
    cache.get('nonexistent', 'vault1', {}); // miss
    cache.set('found', 'vault1', {}, ['data']);
    cache.get('found', 'vault1', {}); // hit

    // Operations in vault2
    cache.get('nonexistent', 'vault2', {}); // miss
    cache.set('found', 'vault2', {}, ['data']);
    cache.get('found', 'vault2', {}); // hit

    const stats = cache.stats();
    assert.equal(stats.hits, 2, 'Should count 2 hits total');
    assert.equal(stats.misses, 2, 'Should count 2 misses total');

    // Verify they don't interfere with each other
    const vault1Result = cache.get('found', 'vault1', {});
    const vault2Result = cache.get('found', 'vault2', {});
    assert.deepEqual(vault1Result, ['data'], 'vault1 data should be intact');
    assert.deepEqual(vault2Result, ['data'], 'vault2 data should be intact');
  });

  await t.test('Bonus: Complex options work with vault isolation', () => {
    const cache = new SearchCache();

    const options = {
      type: 'file',
      tag: 'important',
      status: 'active',
      regex: true,
    };

    // Same keyword/options, different vaults
    cache.set('complex', 'vault-x', options, ['x-result']);
    cache.set('complex', 'vault-y', options, ['y-result']);

    const resultX = cache.get('complex', 'vault-x', options);
    const resultY = cache.get('complex', 'vault-y', options);

    assert.deepEqual(resultX, ['x-result'], 'vault-x should have isolated complex result');
    assert.deepEqual(resultY, ['y-result'], 'vault-y should have isolated complex result');
  });

  await t.test('Bonus: Disk load restores vault-isolated cache', async () => {
    const cache1 = new SearchCache();
    const cachePath = join(tmpDir, 'vault-restore.json');

    // Store in multiple vaults
    cache1.set('q1', 'vault1', {}, ['v1-data']);
    cache1.set('q2', 'vault2', {}, ['v2-data']);
    await cache1.saveToDisk(cachePath, 'v1.0.0');

    // Load into new cache
    const cache2 = new SearchCache();
    await cache2.loadFromDisk(cachePath, 'v1.0.0');

    // Verify vault isolation is restored
    const result1 = cache2.get('q1', 'vault1', {});
    const result2 = cache2.get('q2', 'vault2', {});

    assert.deepEqual(result1, ['v1-data'], 'vault1 data should be restored');
    assert.deepEqual(result2, ['v2-data'], 'vault2 data should be restored');
  });
});
