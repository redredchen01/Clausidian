/**
 * Test persistent cache — Disk-based caching for graph operations
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PersistentCache } from '../src/persistent-cache.mjs';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

describe('PersistentCache', () => {
  let cacheDir;

  it('should initialize with default cache directory', () => {
    const cache = new PersistentCache();
    assert.strictEqual(cache.cacheDir, '.clausidian/cache');
    assert.strictEqual(cache.cacheFile, '.clausidian/cache/graph-cache.json');
  });

  it('should initialize with custom cache directory', () => {
    const cache = new PersistentCache('/tmp/custom-cache');
    assert.strictEqual(cache.cacheDir, '/tmp/custom-cache');
    assert.strictEqual(cache.cacheFile, '/tmp/custom-cache/graph-cache.json');
  });

  it('should generate cache key from vault state', () => {
    const cache = new PersistentCache();
    const key = cache.getCacheKey(100, '2026-03-30T12:00:00Z');
    assert.strictEqual(key, 'notes:100:2026-03-30T12:00:00Z');
  });

  it('should save and load results', () => {
    cacheDir = mkdtempSync(join(tmpdir(), 'clausidian-cache-'));
    const cache = new PersistentCache(cacheDir);

    const key = { noteCount: 100, lastModified: '2026-03-30T12:00:00Z' };
    const results = {
      suggested: [
        { a: 'note1', b: 'note2', score: 3.5, shared: ['tag1'] }
      ],
      stats: { total: 1 }
    };

    cache.save(key, results);
    const loaded = cache.load(key);

    assert.deepStrictEqual(loaded, results);
    rmSync(cacheDir, { recursive: true });
  });

  it('should return null for missing cache file', () => {
    cacheDir = mkdtempSync(join(tmpdir(), 'clausidian-cache-'));
    const cache = new PersistentCache(cacheDir);

    const key = { noteCount: 100, lastModified: '2026-03-30T12:00:00Z' };
    const loaded = cache.load(key);

    assert.strictEqual(loaded, null);
    rmSync(cacheDir, { recursive: true });
  });

  it('should return null when cache key does not match', () => {
    cacheDir = mkdtempSync(join(tmpdir(), 'clausidian-cache-'));
    const cache = new PersistentCache(cacheDir);

    const saveKey = { noteCount: 100, lastModified: '2026-03-30T12:00:00Z' };
    const results = {
      suggested: [{ a: 'note1', b: 'note2', score: 3.5, shared: ['tag1'] }],
      stats: { total: 1 }
    };
    cache.save(saveKey, results);

    // Try to load with different key
    const loadKey = { noteCount: 101, lastModified: '2026-03-30T12:00:00Z' };
    const loaded = cache.load(loadKey);

    assert.strictEqual(loaded, null);
    rmSync(cacheDir, { recursive: true });
  });

  it('should invalidate cache older than 24 hours', () => {
    cacheDir = mkdtempSync(join(tmpdir(), 'clausidian-cache-'));
    const cache = new PersistentCache(cacheDir);

    const key = { noteCount: 100, lastModified: '2026-03-30T12:00:00Z' };
    const results = {
      suggested: [{ a: 'note1', b: 'note2', score: 3.5, shared: ['tag1'] }],
      stats: { total: 1 }
    };
    cache.save(key, results);

    // Manually edit timestamp to be older than 24h
    const cacheFile = join(cacheDir, 'graph-cache.json');
    const data = JSON.parse(readFileSync(cacheFile, 'utf8'));
    data.timestamp = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    writeFileSync(cacheFile, JSON.stringify(data, null, 2));

    const loaded = cache.load(key);
    assert.strictEqual(loaded, null);
    rmSync(cacheDir, { recursive: true });
  });

  it('should accept cache within 24 hour TTL', () => {
    cacheDir = mkdtempSync(join(tmpdir(), 'clausidian-cache-'));
    const cache = new PersistentCache(cacheDir);

    const key = { noteCount: 100, lastModified: '2026-03-30T12:00:00Z' };
    const results = {
      suggested: [{ a: 'note1', b: 'note2', score: 3.5, shared: ['tag1'] }],
      stats: { total: 1 }
    };
    cache.save(key, results);

    // Manually edit timestamp to be within 24h (e.g., 1 hour old)
    const cacheFile = join(cacheDir, 'graph-cache.json');
    const data = JSON.parse(readFileSync(cacheFile, 'utf8'));
    data.timestamp = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
    writeFileSync(cacheFile, JSON.stringify(data, null, 2));

    const loaded = cache.load(key);
    assert.deepStrictEqual(loaded, results);
    rmSync(cacheDir, { recursive: true });
  });

  it('should validate cache existence and validity', () => {
    cacheDir = mkdtempSync(join(tmpdir(), 'clausidian-cache-'));
    const cache = new PersistentCache(cacheDir);

    const key = { noteCount: 100, lastModified: '2026-03-30T12:00:00Z' };
    assert.strictEqual(cache.isValid(key), false);

    const results = {
      suggested: [{ a: 'note1', b: 'note2', score: 3.5, shared: ['tag1'] }],
      stats: { total: 1 }
    };
    cache.save(key, results);

    assert.strictEqual(cache.isValid(key), true);
    rmSync(cacheDir, { recursive: true });
  });

  it('should clear cache file', () => {
    cacheDir = mkdtempSync(join(tmpdir(), 'clausidian-cache-'));
    const cache = new PersistentCache(cacheDir);

    const key = { noteCount: 100, lastModified: '2026-03-30T12:00:00Z' };
    const results = {
      suggested: [{ a: 'note1', b: 'note2', score: 3.5, shared: ['tag1'] }],
      stats: { total: 1 }
    };
    cache.save(key, results);

    assert.strictEqual(cache.isValid(key), true);
    cache.clear();
    assert.strictEqual(cache.isValid(key), false);

    rmSync(cacheDir, { recursive: true });
  });

  it('should handle corrupt cache files gracefully', () => {
    cacheDir = mkdtempSync(join(tmpdir(), 'clausidian-cache-'));
    const cache = new PersistentCache(cacheDir);

    const cacheFile = join(cacheDir, 'graph-cache.json');
    writeFileSync(cacheFile, 'invalid json {{{');

    const key = { noteCount: 100, lastModified: '2026-03-30T12:00:00Z' };
    const loaded = cache.load(key);

    assert.strictEqual(loaded, null);
    rmSync(cacheDir, { recursive: true });
  });
});
