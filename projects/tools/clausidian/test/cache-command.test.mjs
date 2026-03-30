import test from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { Vault } from '../src/vault.mjs';

test('cache command', async (t) => {
  let tmpDir, vaultRoot;

  t.before(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'cache-cmd-test-'));
    vaultRoot = tmpDir;
  });

  t.after(() => {
    try {
      rmSync(tmpDir, { recursive: true });
    } catch (err) {
      // ignore
    }
  });

  await t.test('cache stats returns disk cache status', async () => {
    const { cache } = await import('../src/commands/cache.mjs');
    const result = await cache(vaultRoot, { subcommand: 'stats' });

    assert.equal(result.status, 'stats');
    assert(result.cache);
    assert.equal(typeof result.cache.diskCacheExists, 'boolean');
  });

  await t.test('cache stats shows disk cache age when exists', async () => {
    const vault = new Vault(vaultRoot);
    const cacheDir = vault.path('.clausidian');
    const cachePath = vault.path('.clausidian', 'cache.json');

    vault.write('.clausidian', 'cache.json', JSON.stringify({ test: true }));

    const { cache } = await import('../src/commands/cache.mjs');
    const result = await cache(vaultRoot, { subcommand: 'stats' });

    assert.equal(result.status, 'stats');
    assert.equal(result.cache.diskCacheExists, true);
    assert.equal(typeof result.cache.diskCacheSizeBytes, 'number');
    assert.equal(typeof result.cache.diskCacheAgeMins, 'number');
  });

  await t.test('cache clear removes disk cache file', async () => {
    const vault = new Vault(vaultRoot);
    vault.write('.clausidian', 'cache.json', JSON.stringify({ test: true }));

    const { cache } = await import('../src/commands/cache.mjs');
    const result = await cache(vaultRoot, { subcommand: 'clear' });

    assert.equal(result.status, 'cleared');
    assert(!vault.exists('.clausidian', 'cache.json'));
  });

  await t.test('cache clear handles missing cache gracefully', async () => {
    const { cache } = await import('../src/commands/cache.mjs');
    const result = await cache(vaultRoot, { subcommand: 'clear' });

    assert.equal(result.status, 'already_cleared');
  });

  await t.test('cache throws on unknown subcommand', async () => {
    const { cache } = await import('../src/commands/cache.mjs');

    await assert.rejects(
      () => cache(vaultRoot, { subcommand: 'invalid' }),
      /Unknown cache subcommand/
    );
  });
});
