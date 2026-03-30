/**
 * Unit 8: Comprehensive Performance Regression Test Suite
 * Measures sync, search, and link suggestion performance across vault sizes
 * Validates against thresholds to detect performance regressions
 */

import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Vault } from '../src/vault.mjs';
import { IndexManager } from '../src/index-manager.mjs';
import { Benchmark, THRESHOLDS } from './performance.benchmark.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TMP = join(__dirname, '..', 'tmp', 'perf-regression');

/**
 * Create test vault with N notes, distributed across directories
 */
function createTestVault(noteCount) {
  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(join(TMP, 'projects'), { recursive: true });
  mkdirSync(join(TMP, 'journal'), { recursive: true });
  mkdirSync(join(TMP, 'areas'), { recursive: true });

  const tags = ['backend', 'api', 'database', 'frontend', 'testing', 'docs', 'devops', 'security', 'performance', 'infrastructure'];
  const keywords = ['auth', 'cache', 'query', 'stream', 'async', 'sync', 'hook', 'event', 'cluster', 'graph'];

  for (let i = 1; i <= noteCount; i++) {
    // Distribute across directories
    const dir = i % 3 === 0 ? 'journal' : (i % 5 === 0 ? 'areas' : 'projects');
    const noteTags = [];

    // Tag distribution
    if (i % 2 === 0) noteTags.push(tags[0]);
    if (i % 3 === 0) noteTags.push(tags[1]);
    if (i % 5 === 0) noteTags.push(tags[2]);
    if (i % 7 === 0) noteTags.push(tags[3]);
    if (i % 11 === 0) noteTags.push(tags[4]);

    const tagStr = noteTags.length > 0 ? noteTags.map(t => `"${t}"`).join(', ') : '"general"';
    const keyword = keywords[i % keywords.length];

    const content = `---
title: "Note ${i} - ${keyword} optimization"
type: ${dir === 'journal' ? 'journal' : dir === 'areas' ? 'area' : 'project'}
tags: [${tagStr}]
created: 2026-03-27
updated: 2026-03-27
status: active
summary: "Test note ${i} covering ${keyword} with performance considerations"
related: []
---

# Note ${i}: ${keyword.toUpperCase()} Optimization

This note discusses ${keyword} patterns and optimizations for vault v2.5.0.

## Key Points
- Performance improvement from caching
- Incremental sync benefits
- Set-based lookups for faster queries
- Lazy extraction strategies

## Related Topics
- [[index-manager]]
- [[vault-performance]]
- [[search-optimization]]

## Code Example
\`\`\`javascript
// ${keyword} example
const result = await performance.measure('${keyword}', () => {
  return optimized${keyword}();
});
\`\`\`
`;

    mkdirSync(join(TMP, dir), { recursive: true });
    writeFileSync(
      join(TMP, dir, `note-${String(i).padStart(4, '0')}.md`),
      content
    );
  }
}

/**
 * Benchmark sync operation for N notes
 */
async function benchmarkSync(noteCount) {
  createTestVault(noteCount);
  const vault = new Vault(TMP);
  const idx = new IndexManager(vault);

  // First sync: establish hashes
  await idx.sync();

  // Benchmark: second sync on unchanged vault
  const getThreshold = () => {
    if (noteCount <= 100) return THRESHOLDS.SYNC_100_NOTES;
    if (noteCount <= 500) return THRESHOLDS.SYNC_500_NOTES;
    return THRESHOLDS.SYNC_1K_NOTES;
  };

  const stats = await Benchmark.run(
    () => idx.sync(),
    {
      iterations: 5,
      label: `sync-${noteCount}`,
      threshold: getThreshold(),
    }
  );

  return stats;
}

/**
 * Benchmark search performance across 100 diverse queries
 */
async function benchmarkSearch(noteCount) {
  createTestVault(noteCount);
  const vault = new Vault(TMP);

  const queries = [
    // Exact title matches
    'optimization', 'performance', 'cache',
    // Partial matches
    'auth', 'sync', 'event', 'cluster',
    // Tag-based searches
    'backend', 'database', 'testing',
    // Complex patterns
    'async', 'stream', 'hook', 'infrastructure',
    // Edge cases
    '', '*', '001', '999', 'nonexistent'
  ];

  // Repeat to get 100 queries
  const queryList = [];
  while (queryList.length < 100) {
    queryList.push(...queries);
  }
  queryList.length = 100;

  const times = [];
  for (const query of queryList) {
    const start = performance.now();
    vault.search(query);
    const end = performance.now();
    times.push(end - start);
  }

  times.sort((a, b) => a - b);
  const stats = {
    label: `search-${noteCount}`,
    queries: 100,
    min: times[0],
    max: times[times.length - 1],
    avg: times.reduce((a, b) => a + b, 0) / times.length,
    p50: times[Math.floor(times.length * 0.5)],
    p95: times[Math.floor(times.length * 0.95)],
    p99: times[Math.floor(times.length * 0.99)],
    passed: times[Math.floor(times.length * 0.95)] < THRESHOLDS.SEARCH_P95,
  };

  if (!stats.passed) {
    stats.error = `p95 ${stats.p95.toFixed(2)}ms exceeds threshold ${THRESHOLDS.SEARCH_P95}ms`;
  }

  return stats;
}

/**
 * Benchmark link suggestion (TF-IDF with sampling)
 */
async function benchmarkLinkSuggestions(noteCount) {
  createTestVault(noteCount);
  const vault = new Vault(TMP);
  const idx = new IndexManager(vault);

  // Build graph first
  await idx.sync();
  const notes = vault.scanNotes({ includeBody: true });

  // Sample random notes for link suggestion
  const suggestLimit = Math.min(10, notes.length);
  const sampleNotes = notes.slice(0, suggestLimit);

  const getThreshold = () => {
    if (noteCount <= 100) return THRESHOLDS.LINK_SUGGEST_100;
    if (noteCount <= 500) return THRESHOLDS.LINK_SUGGEST_500;
    return THRESHOLDS.LINK_SUGGEST_5K;
  };

  const stats = await Benchmark.run(
    () => {
      // Rebuild graph (includes link suggestion sampling)
      return idx.rebuildGraph(notes);
    },
    {
      iterations: 3,
      label: `link-suggest-${noteCount}`,
      threshold: getThreshold(),
    }
  );

  return stats;
}

/**
 * Main test runner
 */
async function runAllBenchmarks() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  Performance Regression Test Suite (Unit 8)                   ║');
  console.log('║  Measures: sync, search, link suggestions across vault sizes  ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  const results = {
    sync: [],
    search: [],
    linkSuggestions: [],
    passed: 0,
    failed: 0,
  };

  // === SYNC BENCHMARKS ===
  console.log('📊 SYNC PERFORMANCE (incremental, cache hit)\n');
  for (const size of [100, 500, 1000]) {
    const stats = await benchmarkSync(size);
    results.sync.push(stats);

    const status = stats.passed ? '✓' : '✗';
    console.log(`${status} ${Benchmark.format(stats)}`);
    if (!stats.passed) console.log(`  ${stats.error}`);

    stats.passed ? results.passed++ : results.failed++;
  }

  // === SEARCH BENCHMARKS ===
  console.log('\n📊 SEARCH PERFORMANCE (100 diverse queries)\n');
  for (const size of [100, 500]) {
    const stats = await benchmarkSearch(size);
    results.search.push(stats);

    const status = stats.passed ? '✓' : '✗';
    console.log(`${status} ${Benchmark.format(stats)} p99=${stats.p99.toFixed(2)}ms`);
    if (!stats.passed) console.log(`  ${stats.error}`);

    stats.passed ? results.passed++ : results.failed++;
  }

  // === LINK SUGGESTION BENCHMARKS ===
  console.log('\n📊 LINK SUGGESTION PERFORMANCE (TF-IDF with sampling)\n');
  for (const size of [100, 500]) {
    const stats = await benchmarkLinkSuggestions(size);
    results.linkSuggestions.push(stats);

    const status = stats.passed ? '✓' : '✗';
    console.log(`${status} ${Benchmark.format(stats)}`);
    if (!stats.passed) console.log(`  ${stats.error}`);

    stats.passed ? results.passed++ : results.failed++;
  }

  // === SUMMARY ===
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log(`║  Summary: ${results.passed} PASSED, ${results.failed} FAILED                          ║`);
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  // Cleanup
  rmSync(TMP, { recursive: true, force: true });

  // Return results for programmatic use
  return results;
}

// Run if invoked directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runAllBenchmarks().catch(console.error);
}

export { runAllBenchmarks, benchmarkSync, benchmarkSearch, benchmarkLinkSuggestions };
