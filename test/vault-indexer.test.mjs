/**
 * Vault Indexer Test Suite (20+ test cases)
 * Tests incremental scanning, hash detection, metadata extraction, persistence
 */

import { strict as assert } from 'assert';
import { promises as fs } from 'fs';
import { homedir } from 'os';
import { resolve, join } from 'path';
import { randomBytes } from 'crypto';
import { VaultIndexer } from '../src/vault-indexer.mjs';

// Test helper: create temporary directory
async function createTempDir() {
  const tmpDir = resolve('/tmp', `vault-test-${randomBytes(8).toString('hex')}`);
  await fs.mkdir(tmpDir, { recursive: true });
  return tmpDir;
}

// Test helper: cleanup directory
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

// Test helper: create test markdown file
async function createTestFile(dir, filename, content) {
  const filePath = resolve(dir, filename);
  const parentDir = filePath.substring(0, filePath.lastIndexOf('/'));
  await fs.mkdir(parentDir, { recursive: true });
  await fs.writeFile(filePath, content);
  return filePath;
}

// ============================================================================
// Test Suite
// ============================================================================

const tests = [];

// Test 1: Create index from scratch (first scan)
tests.push({
  name: 'First scan creates index from scratch',
  async run() {
    const vaultDir = await createTempDir();
    const indexPath = resolve(vaultDir, '.index.json');

    try {
      const indexer = new VaultIndexer(indexPath);

      // Create test files
      await createTestFile(vaultDir, 'ideas/api-integrations.md', '# API Integrations\ntags: [api, integration, rest]\nContent about REST APIs');
      await createTestFile(vaultDir, 'projects/skill-pipeline.md', '# Skill Pipeline\ntags: [pipeline, automation]\nContent about pipelines');

      const result = await indexer.scanVaultIncremental(vaultDir);

      assert.strictEqual(result.totalFiles, 2, 'Should scan 2 files');
      assert.strictEqual(result.stats.filesAdded, 2, 'Should detect 2 new files');
      assert.strictEqual(result.stats.filesChanged, 0, 'No changed files on first scan');
      assert.strictEqual(indexer.index.statistics.totalNotes, 2, 'Index should contain 2 notes');
      assert.ok(indexer.index.lastScan, 'Last scan timestamp should be set');

      // Verify index file was created
      const indexExists = await fs.access(indexPath).then(() => true).catch(() => false);
      assert.ok(indexExists, 'Index file should be persisted');
    } finally {
      await cleanupDir(vaultDir);
    }
  },
});

// Test 2: Incremental scan detects changed files
tests.push({
  name: 'Incremental scan detects changed files',
  async run() {
    const vaultDir = await createTempDir();
    const indexPath = resolve(vaultDir, '.index.json');

    try {
      const indexer = new VaultIndexer(indexPath);

      // Initial scan
      await createTestFile(vaultDir, 'file1.md', 'Content 1');
      const firstScan = await indexer.scanVaultIncremental(vaultDir);
      assert.strictEqual(firstScan.stats.filesAdded, 1);

      // Modify file and rescan
      await createTestFile(vaultDir, 'file1.md', 'Modified content 1');
      const secondScan = await indexer.scanVaultIncremental(vaultDir);

      assert.strictEqual(secondScan.stats.filesChanged, 1, 'Should detect 1 changed file');
      assert.strictEqual(secondScan.stats.filesUnchanged, 0, 'No unchanged files');
    } finally {
      await cleanupDir(vaultDir);
    }
  },
});

// Test 3: Unchanged files skipped (no re-hash)
tests.push({
  name: 'Unchanged files skipped in incremental scan',
  async run() {
    const vaultDir = await createTempDir();
    const indexPath = resolve(vaultDir, '.index.json');

    try {
      const indexer = new VaultIndexer(indexPath);

      // Create files
      await createTestFile(vaultDir, 'file1.md', 'Unchanged content');
      await createTestFile(vaultDir, 'file2.md', 'Content 2');

      // First scan
      await indexer.scanVaultIncremental(vaultDir);

      // Second scan without changes
      const result = await indexer.scanVaultIncremental(vaultDir);

      assert.strictEqual(result.stats.filesUnchanged, 2, 'Both files should be unchanged');
      assert.strictEqual(result.stats.filesChanged, 0, 'No files changed');
      assert.strictEqual(result.stats.filesAdded, 0, 'No new files');
      assert.ok(
        parseFloat(result.stats.cacheHitRate) > 0,
        'Cache hit rate should be greater than 0'
      );
    } finally {
      await cleanupDir(vaultDir);
    }
  },
});

// Test 4: New files added to index
tests.push({
  name: 'New files added to index',
  async run() {
    const vaultDir = await createTempDir();
    const indexPath = resolve(vaultDir, '.index.json');

    try {
      const indexer = new VaultIndexer(indexPath);

      // Create and scan initial file
      await createTestFile(vaultDir, 'file1.md', 'Content 1');
      const firstScan = await indexer.scanVaultIncremental(vaultDir);
      assert.strictEqual(firstScan.stats.filesAdded, 1);

      // Add new file
      await createTestFile(vaultDir, 'file2.md', 'Content 2');
      const secondScan = await indexer.scanVaultIncremental(vaultDir);

      assert.strictEqual(secondScan.stats.filesAdded, 1, 'Should detect 1 new file');
      assert.strictEqual(secondScan.stats.filesUnchanged, 1, 'Original file unchanged');
      assert.strictEqual(indexer.index.statistics.totalNotes, 2, 'Index should have 2 notes');
    } finally {
      await cleanupDir(vaultDir);
    }
  },
});

// Test 5: Deleted files removed from index
tests.push({
  name: 'Deleted files removed from index',
  async run() {
    const vaultDir = await createTempDir();
    const indexPath = resolve(vaultDir, '.index.json');

    try {
      const indexer = new VaultIndexer(indexPath);

      // Create and scan files
      await createTestFile(vaultDir, 'file1.md', 'Content 1');
      await createTestFile(vaultDir, 'file2.md', 'Content 2');
      const firstScan = await indexer.scanVaultIncremental(vaultDir);
      assert.strictEqual(indexer.index.statistics.totalNotes, 2);

      // Delete one file
      await fs.unlink(resolve(vaultDir, 'file2.md'));
      const secondScan = await indexer.scanVaultIncremental(vaultDir);

      assert.strictEqual(secondScan.stats.filesDeleted, 1, 'Should detect 1 deleted file');
      assert.strictEqual(indexer.index.statistics.totalNotes, 1, 'Index should have 1 note');
      assert.strictEqual(Object.keys(indexer.index.metadata).length, 1);
    } finally {
      await cleanupDir(vaultDir);
    }
  },
});

// Test 6: File hash matches content
tests.push({
  name: 'File hash matches content',
  async run() {
    const vaultDir = await createTempDir();
    const indexPath = resolve(vaultDir, '.index.json');

    try {
      const indexer = new VaultIndexer(indexPath);
      const content = 'Test content for hashing';
      await createTestFile(vaultDir, 'test.md', content);

      await indexer.scanVaultIncremental(vaultDir);

      // Compute expected hash
      const expectedHash = await indexer.computeFileHash(resolve(vaultDir, 'test.md'));
      const storedHash = indexer.index.fileHashes['test.md'];

      assert.strictEqual(storedHash, expectedHash, 'Stored hash should match computed hash');
    } finally {
      await cleanupDir(vaultDir);
    }
  },
});

// Test 7: Metadata extracted correctly
tests.push({
  name: 'Metadata extracted correctly (tags, keywords)',
  async run() {
    const vaultDir = await createTempDir();
    const indexPath = resolve(vaultDir, '.index.json');

    try {
      const indexer = new VaultIndexer(indexPath);
      const content = `# API Integrations
tags: [api, integration, rest]
keywords: graphql, rest, pagination

This is about REST APIs and GraphQL integration patterns.`;

      await createTestFile(vaultDir, 'test.md', content);
      await indexer.scanVaultIncremental(vaultDir);

      const metadata = indexer.index.metadata['test.md'];
      assert.ok(metadata, 'Metadata should exist');
      assert.ok(Array.isArray(metadata.tags), 'Tags should be an array');
      assert.ok(metadata.tags.includes('api'), 'Should extract "api" tag');
      assert.ok(Array.isArray(metadata.keywords), 'Keywords should be extracted');
      assert.strictEqual(metadata.size > 0, true, 'Size should be recorded');
      assert.strictEqual(metadata.connections, 0, 'No vault links in content');
      assert.ok(metadata.modified, 'Modified timestamp should exist');
    } finally {
      await cleanupDir(vaultDir);
    }
  },
});

// Test 8: Vault links counted correctly
tests.push({
  name: 'Vault links (connections) counted correctly',
  async run() {
    const vaultDir = await createTempDir();
    const indexPath = resolve(vaultDir, '.index.json');

    try {
      const indexer = new VaultIndexer(indexPath);
      const content = `# Main Note
[[api-integrations]]
[[skill-pipeline#section]]
[[another-file]]
Some text with [[link1]] and [[link2]].`;

      await createTestFile(vaultDir, 'test.md', content);
      await indexer.scanVaultIncremental(vaultDir);

      const metadata = indexer.index.metadata['test.md'];
      assert.strictEqual(metadata.connections, 5, 'Should count 5 vault links');
    } finally {
      await cleanupDir(vaultDir);
    }
  },
});

// Test 9: Index persists across sessions
tests.push({
  name: 'Index survives session boundary',
  async run() {
    const vaultDir = await createTempDir();
    const indexPath = resolve(vaultDir, '.index.json');

    try {
      // Session 1: create and scan
      const indexer1 = new VaultIndexer(indexPath);
      await createTestFile(vaultDir, 'file1.md', 'Content 1');
      await indexer1.scanVaultIncremental(vaultDir);
      const firstStats = indexer1.getIncrementalStats();

      // Session 2: load and verify
      const indexer2 = new VaultIndexer(indexPath);
      await indexer2.loadIndex();

      assert.strictEqual(indexer2.index.statistics.totalNotes, 1, 'Loaded index should have 1 note');
      assert.ok(indexer2.index.fileHashes['file1.md'], 'Hash should be persisted');
      assert.ok(indexer2.index.metadata['file1.md'], 'Metadata should be persisted');
    } finally {
      await cleanupDir(vaultDir);
    }
  },
});

// Test 10: Index file location correct
tests.push({
  name: 'Index file location correct (~/.claude/vault-index.json)',
  async run() {
    const vaultDir = await createTempDir();
    const claudeDir = resolve(homedir(), '.claude');
    const defaultIndexPath = resolve(claudeDir, 'vault-index.json');

    try {
      // Create indexer with default path
      const indexer = new VaultIndexer();
      assert.strictEqual(indexer.indexPath, defaultIndexPath, 'Default path should be ~/.claude/vault-index.json');
    } finally {
      await cleanupDir(vaultDir);
    }
  },
});

// Test 11: Incremental scan detects cache hits correctly
tests.push({
  name: 'Incremental scan detects cache hits correctly',
  async run() {
    const vaultDir = await createTempDir();
    const indexPath = resolve(vaultDir, '.index.json');

    try {
      const indexer = new VaultIndexer(indexPath);

      // Create several files
      for (let i = 0; i < 10; i++) {
        await createTestFile(vaultDir, `file${i}.md`, `Content for file ${i}`);
      }

      // First scan (full)
      await indexer.scanVaultIncremental(vaultDir, { forceFullScan: true });

      // Second scan (incremental, no changes)
      const result = await indexer.scanVaultIncremental(vaultDir);

      // All files should be unchanged
      assert.strictEqual(result.stats.filesUnchanged, 10, 'All 10 files should be unchanged');
      assert.strictEqual(result.stats.filesChanged, 0, 'No files changed');
      assert.strictEqual(
        parseFloat(indexer.scanStats.cacheHitRate) >= 90,
        true,
        `Cache hit rate should be >= 90%, got ${indexer.scanStats.cacheHitRate}%`
      );
    } finally {
      await cleanupDir(vaultDir);
    }
  },
});

// Test 12: Force full scan rechecks all files
tests.push({
  name: 'Force full scan option rechecks all files',
  async run() {
    const vaultDir = await createTempDir();
    const indexPath = resolve(vaultDir, '.index.json');

    try {
      const indexer = new VaultIndexer(indexPath);

      // Create file
      await createTestFile(vaultDir, 'file1.md', 'Content 1');
      const firstScan = await indexer.scanVaultIncremental(vaultDir);
      assert.strictEqual(firstScan.stats.filesAdded, 1);

      // Second scan with forceFullScan
      const secondScan = await indexer.scanVaultIncremental(vaultDir, { forceFullScan: true });
      assert.strictEqual(secondScan.stats.filesUnchanged, 0, 'Force full should not skip');
      assert.strictEqual(secondScan.stats.filesScanned, 1, 'File should be scanned');
    } finally {
      await cleanupDir(vaultDir);
    }
  },
});

// Test 13: Cache hit rate calculation
tests.push({
  name: 'Cache hit rate calculation is accurate',
  async run() {
    const vaultDir = await createTempDir();
    const indexPath = resolve(vaultDir, '.index.json');

    try {
      const indexer = new VaultIndexer(indexPath);

      // Create 10 files
      for (let i = 0; i < 10; i++) {
        await createTestFile(vaultDir, `file${i}.md`, `Content ${i}`);
      }

      // First scan
      await indexer.scanVaultIncremental(vaultDir);

      // Modify 2 files
      await createTestFile(vaultDir, 'file0.md', 'Modified content');
      await createTestFile(vaultDir, 'file5.md', 'Modified content');

      // Incremental scan
      const result = await indexer.scanVaultIncremental(vaultDir);

      // 8 unchanged out of 10 = 80% hit rate
      const hitRate = parseFloat(result.stats.cacheHitRate);
      assert.ok(hitRate >= 70 && hitRate <= 90, `Hit rate should be around 80%, got ${hitRate}`);
    } finally {
      await cleanupDir(vaultDir);
    }
  },
});

// Test 14: Statistics calculation accurate
tests.push({
  name: 'Statistics (size, count, average) accurate',
  async run() {
    const vaultDir = await createTempDir();
    const indexPath = resolve(vaultDir, '.index.json');

    try {
      const indexer = new VaultIndexer(indexPath);

      const content1 = 'A'.repeat(100); // 100 bytes
      const content2 = 'B'.repeat(200); // 200 bytes

      await createTestFile(vaultDir, 'file1.md', content1);
      await createTestFile(vaultDir, 'file2.md', content2);
      await indexer.scanVaultIncremental(vaultDir);

      const stats = indexer.index.statistics;
      assert.strictEqual(stats.totalNotes, 2, 'Total notes should be 2');
      assert.strictEqual(stats.totalSize, 300, 'Total size should be 300 bytes');
      assert.strictEqual(stats.averageSize, 150, 'Average size should be 150');
    } finally {
      await cleanupDir(vaultDir);
    }
  },
});

// Test 15: Search by tag
tests.push({
  name: 'Search by tag returns matching files',
  async run() {
    const vaultDir = await createTempDir();
    const indexPath = resolve(vaultDir, '.index.json');

    try {
      const indexer = new VaultIndexer(indexPath);

      await createTestFile(vaultDir, 'api.md', 'tags: [api, integration]');
      await createTestFile(vaultDir, 'pipeline.md', 'tags: [pipeline, automation]');
      await createTestFile(vaultDir, 'api2.md', 'tags: [api, testing]');

      await indexer.scanVaultIncremental(vaultDir);

      const apiFiles = indexer.searchByTag('api');
      assert.strictEqual(apiFiles.length, 2, 'Should find 2 files with "api" tag');
      assert.ok(apiFiles.includes('api.md'));
      assert.ok(apiFiles.includes('api2.md'));
    } finally {
      await cleanupDir(vaultDir);
    }
  },
});

// Test 16: Get all tags
tests.push({
  name: 'Get all tags returns unique sorted list',
  async run() {
    const vaultDir = await createTempDir();
    const indexPath = resolve(vaultDir, '.index.json');

    try {
      const indexer = new VaultIndexer(indexPath);

      await createTestFile(vaultDir, 'file1.md', 'tags: [zebra, api]');
      await createTestFile(vaultDir, 'file2.md', 'tags: [api, automation]');

      await indexer.scanVaultIncremental(vaultDir);

      const tags = indexer.getAllTags();
      assert.deepStrictEqual(tags, ['api', 'automation', 'zebra'], 'Tags should be sorted');
      assert.strictEqual(new Set(tags).size, tags.length, 'Tags should be unique');
    } finally {
      await cleanupDir(vaultDir);
    }
  },
});

// Test 17: Index staleness detection
tests.push({
  name: 'Index staleness detection works',
  async run() {
    const vaultDir = await createTempDir();
    const indexPath = resolve(vaultDir, '.index.json');

    try {
      const indexer = new VaultIndexer(indexPath);

      // Fresh index
      assert.strictEqual(indexer.isIndexStale(), true, 'New index should be considered stale');

      await createTestFile(vaultDir, 'file.md', 'content');
      await indexer.scanVaultIncremental(vaultDir);

      assert.strictEqual(indexer.isIndexStale(), false, 'Recently scanned index should not be stale');

      // Manually set old timestamp
      const yesterday = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
      indexer.index.lastScan = yesterday;
      assert.strictEqual(indexer.isIndexStale(), true, 'Index older than 24h should be stale');
    } finally {
      await cleanupDir(vaultDir);
    }
  },
});

// Test 18: Manual cache reset
tests.push({
  name: 'Manual cache reset clears all data',
  async run() {
    const vaultDir = await createTempDir();
    const indexPath = resolve(vaultDir, '.index.json');

    try {
      const indexer = new VaultIndexer(indexPath);

      await createTestFile(vaultDir, 'file.md', 'content');
      await indexer.scanVaultIncremental(vaultDir);

      assert.strictEqual(indexer.index.statistics.totalNotes, 1, 'Should have 1 note');

      // Reset cache
      indexer.resetCache();

      assert.strictEqual(indexer.index.statistics.totalNotes, 0, 'After reset, should have 0 notes');
      assert.strictEqual(Object.keys(indexer.index.fileHashes).length, 0, 'Hashes cleared');
      assert.strictEqual(Object.keys(indexer.index.metadata).length, 0, 'Metadata cleared');
    } finally {
      await cleanupDir(vaultDir);
    }
  },
});

// Test 19: Get top connected files
tests.push({
  name: 'Get top connected files ranks by connection count',
  async run() {
    const vaultDir = await createTempDir();
    const indexPath = resolve(vaultDir, '.index.json');

    try {
      const indexer = new VaultIndexer(indexPath);

      await createTestFile(vaultDir, 'hub.md', '[[a]] [[b]] [[c]] [[d]] [[e]]'); // 5 connections
      await createTestFile(vaultDir, 'mid.md', '[[x]] [[y]]'); // 2 connections
      await createTestFile(vaultDir, 'leaf.md', 'No links'); // 0 connections

      await indexer.scanVaultIncremental(vaultDir);

      const topConnected = indexer.getTopConnected(2);
      assert.strictEqual(topConnected.length, 2, 'Should return 2 files');
      assert.strictEqual(topConnected[0].file, 'hub.md', 'Top should be hub.md');
      assert.strictEqual(topConnected[0].connections, 5);
      assert.strictEqual(topConnected[1].file, 'mid.md');
      assert.strictEqual(topConnected[1].connections, 2);
    } finally {
      await cleanupDir(vaultDir);
    }
  },
});

// Test 20: Nested directory structure handled
tests.push({
  name: 'Nested directory structure handled correctly',
  async run() {
    const vaultDir = await createTempDir();
    const indexPath = resolve(vaultDir, '.index.json');

    try {
      const indexer = new VaultIndexer(indexPath);

      await createTestFile(vaultDir, 'root.md', 'Root');
      await createTestFile(vaultDir, 'projects/sub/file1.md', 'Nested 1');
      await createTestFile(vaultDir, 'ideas/a/b/c/file2.md', 'Deeply nested');

      const result = await indexer.scanVaultIncremental(vaultDir);

      assert.strictEqual(result.totalFiles, 3, 'Should find all nested files');
      assert.ok(indexer.index.fileHashes['root.md']);
      assert.ok(indexer.index.fileHashes['projects/sub/file1.md']);
      assert.ok(indexer.index.fileHashes['ideas/a/b/c/file2.md']);
    } finally {
      await cleanupDir(vaultDir);
    }
  },
});

// Test 21: Large vault performance
tests.push({
  name: 'Large vault (100+ files) scans efficiently',
  async run() {
    const vaultDir = await createTempDir();
    const indexPath = resolve(vaultDir, '.index.json');

    try {
      const indexer = new VaultIndexer(indexPath);

      // Create 100 files
      for (let i = 0; i < 100; i++) {
        const subdir = Math.floor(i / 10);
        await createTestFile(vaultDir, `dir${subdir}/file${i}.md`, `Content ${i}`);
      }

      const start = Date.now();
      const result = await indexer.scanVaultIncremental(vaultDir);
      const elapsed = Date.now() - start;

      assert.strictEqual(result.totalFiles, 100, 'Should scan 100 files');
      assert.ok(elapsed < 2000, `Large vault scan should complete in < 2s, took ${elapsed}ms`);
    } finally {
      await cleanupDir(vaultDir);
    }
  },
});

// Test 22: Hidden directories ignored
tests.push({
  name: 'Hidden directories (.git, .obsidian) ignored',
  async run() {
    const vaultDir = await createTempDir();
    const indexPath = resolve(vaultDir, '.index.json');

    try {
      const indexer = new VaultIndexer(indexPath);

      await createTestFile(vaultDir, 'public.md', 'Public');
      await createTestFile(vaultDir, '.hidden/secret.md', 'Hidden');
      await createTestFile(vaultDir, '.git/config', 'Git config');

      const result = await indexer.scanVaultIncremental(vaultDir);

      assert.strictEqual(result.totalFiles, 1, 'Should only find public.md');
      assert.ok(indexer.index.fileHashes['public.md']);
      assert.ok(!indexer.index.fileHashes['.hidden/secret.md']);
    } finally {
      await cleanupDir(vaultDir);
    }
  },
});

// ============================================================================
// Test Runner
// ============================================================================

async function runTests() {
  console.log(`\nRunning ${tests.length} Vault Indexer Tests\n`);

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      await test.run();
      console.log(`✓ ${test.name}`);
      passed++;
    } catch (err) {
      console.log(`✗ ${test.name}`);
      console.log(`  Error: ${err.message}`);
      failed++;
    }
  }

  console.log(`\n${passed} passed, ${failed} failed out of ${tests.length} tests\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

// Run all tests
runTests().catch((err) => {
  console.error('Test runner error:', err);
  process.exit(1);
});
