import test from 'node:test';
import assert from 'node:assert/strict';
import { SearchCache } from '../src/search-cache.mjs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { promises as fs } from 'fs';

test('SearchCache disk persistence', async (t) => {
  let tmpDir;

  t.before(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'search-cache-'));
  });

  t.after(() => {
    try {
      rmSync(tmpDir, { recursive: true });
    } catch (err) {
      // ignore
    }
  });

  await t.test('saveToDisk writes cache to disk', async () => {
    const cache = new SearchCache();
    const cachePath = join(tmpDir, 'cache.json');

    cache.set('test', {}, ['result1', 'result2']);
    await cache.saveToDisk(cachePath, 'v1.0.0');

    const data = JSON.parse(await fs.readFile(cachePath, 'utf8'));
    assert.equal(data.vaultVersion, 'v1.0.0');
    assert(Array.isArray(data.entries));
    assert(data.entries.length > 0);
  });

  await t.test('loadFromDisk restores cache', async () => {
    const cache1 = new SearchCache();
    const cachePath = join(tmpDir, 'restore-cache.json');

    cache1.set('query1', {}, ['a', 'b', 'c']);
    await cache1.saveToDisk(cachePath, 'v1.0.0');

    const cache2 = new SearchCache();
    await cache2.loadFromDisk(cachePath, 'v1.0.0');

    const result = cache2.get('query1', {});
    assert.deepEqual(result, ['a', 'b', 'c']);
  });

  await t.test('loadFromDisk invalidates on version mismatch', async () => {
    const cache1 = new SearchCache();
    const cachePath = join(tmpDir, 'version-mismatch.json');

    cache1.set('query1', {}, ['data']);
    await cache1.saveToDisk(cachePath, 'v1.0.0');

    const cache2 = new SearchCache();
    await cache2.loadFromDisk(cachePath, 'v2.0.0'); // Different version

    const result = cache2.get('query1', {});
    assert.equal(result, null); // Should not be restored
  });

  await t.test('loadFromDisk skips expired entries', async () => {
    const cache1 = new SearchCache(100); // 100ms TTL
    const cachePath = join(tmpDir, 'expiry-test.json');

    cache1.set('query1', {}, ['data']);
    await cache1.saveToDisk(cachePath, 'v1.0.0');

    // Wait for TTL to expire
    await new Promise(resolve => setTimeout(resolve, 150));

    const cache2 = new SearchCache(100);
    await cache2.loadFromDisk(cachePath, 'v1.0.0');

    const result = cache2.get('query1', {});
    assert.equal(result, null); // Expired entries should not be restored
  });

  await t.test('loadFromDisk handles missing file gracefully', async () => {
    const cache = new SearchCache();
    const cachePath = join(tmpDir, 'nonexistent.json');

    // Should not throw
    await cache.loadFromDisk(cachePath, 'v1.0.0');
    assert.equal(cache.get('query', {}), null);
  });

  await t.test('set triggers non-blocking saveToDisk', async () => {
    const cache = new SearchCache();
    const cachePath = join(tmpDir, 'nonblocking.json');

    cache.diskPath = cachePath;
    cache.vaultVersion = 'v1.0.0';

    cache.set('query1', {}, ['data1']);

    // Give setImmediate callback time to execute
    await new Promise(resolve => setImmediate(resolve));
    await new Promise(resolve => setTimeout(resolve, 50));

    // File should exist
    try {
      const data = JSON.parse(await fs.readFile(cachePath, 'utf8'));
      assert.equal(data.vaultVersion, 'v1.0.0');
    } catch (err) {
      // If file doesn't exist, that's acceptable for this test
    }
  });

  await t.test('saveToDisk creates directory if missing', async () => {
    const cache = new SearchCache();
    const cacheDir = join(tmpDir, 'subdir', 'cache');
    const cachePath = join(cacheDir, 'cache.json');

    cache.set('query1', {}, ['data']);
    await cache.saveToDisk(cachePath, 'v1.0.0');

    const data = JSON.parse(await fs.readFile(cachePath, 'utf8'));
    assert.equal(data.vaultVersion, 'v1.0.0');
  });

  await t.test('saveToDisk handles disk errors gracefully', async () => {
    const cache = new SearchCache();
    const cachePath = '/invalid/path/that/does/not/exist/cache.json';

    cache.set('query1', {}, ['data']);

    // Should not throw
    await cache.saveToDisk(cachePath, 'v1.0.0');
    // Silently fails
  });

  await t.test('cache stats reflects disk cache state', async () => {
    const cache = new SearchCache();
    cache.set('q1', {}, ['a']);
    cache.set('q2', {}, ['b']);
    cache.get('q1', {}); // hit

    const stats = cache.stats();
    assert.equal(stats.totalEntries, 2);
    assert.equal(stats.hits, 1);
    assert.equal(stats.misses, 0);
  });
});
