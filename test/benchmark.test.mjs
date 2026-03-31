/**
 * Test benchmark — Performance measurement framework
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Benchmark, GraphBenchmarkSuite } from '../src/benchmark.mjs';
import { Vault } from '../src/vault.mjs';
import { IndexManager } from '../src/index-manager.mjs';
import { SimilarityEngine } from '../src/similarity-engine.mjs';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

describe('Benchmark', () => {
  it('should measure operation timing', () => {
    const benchmark = new Benchmark('test');
    const result = benchmark.measure(() => {
      // Simulate work
      let sum = 0;
      for (let i = 0; i < 1000; i++) sum += i;
    });

    assert.ok(result.duration > 0, 'Duration should be positive');
    assert.ok(result.avgDuration > 0, 'Average duration should be positive');
    assert.strictEqual(result.iterations, 1, 'Should be 1 iteration by default');
  });

  it('should measure multiple iterations', () => {
    const benchmark = new Benchmark('test');
    const result = benchmark.measure(() => {
      let sum = 0;
      for (let i = 0; i < 100; i++) sum += i;
    }, 5);

    assert.strictEqual(result.iterations, 5);
    assert.ok(result.avgDuration > 0);
    assert.ok(result.duration >= result.avgDuration);
  });

  it('should calculate statistics', () => {
    const benchmark = new Benchmark('test');
    benchmark.measure(() => { let x = 1 + 1; }, 1);
    benchmark.measure(() => { let x = 2 + 2; }, 1);
    benchmark.measure(() => { let x = 3 + 3; }, 1);

    const stats = benchmark.stats();
    assert.ok(stats.avg > 0);
    assert.ok(stats.min > 0);
    assert.ok(stats.max > 0);
    assert.ok(stats.median > 0);
    assert.strictEqual(stats.count, 3);
  });

  it('should format results', () => {
    const result = {
      avgDuration: 42.5,
      iterations: 1,
      memoryDelta: 2.5,
    };
    const formatted = Benchmark.format(result);
    assert.ok(formatted.includes('42.5'));
    assert.ok(formatted.includes('ms'));
  });

  it('should compare baseline and current', () => {
    const baseline = { avgDuration: 100 };
    const current = { avgDuration: 120 };

    const comparison = Benchmark.compare(baseline, current);
    assert.strictEqual(comparison.ratio, '1.20');
    assert.strictEqual(comparison.percentChange, '20.0');
    assert.ok(comparison.isRegression, 'Should detect 20% regression');
  });

  it('should not flag small changes as regression', () => {
    const baseline = { avgDuration: 100 };
    const current = { avgDuration: 105 };

    const comparison = Benchmark.compare(baseline, current);
    assert.ok(!comparison.isRegression, 'Should not flag 5% change as regression');
  });
});

describe('GraphBenchmarkSuite', () => {
  it('should measure graph operations', () => {
    const vaultPath = mkdtempSync(join(tmpdir(), 'clausidian-bench-'));
    const vault = new Vault(vaultPath);

    try {
      // Create test notes
      vault.write('resources', 'note1.md', `---
title: Note 1
type: resource
tags: [test]
---
Test content`);

      const suite = new GraphBenchmarkSuite(vault, IndexManager, SimilarityEngine);
      assert.ok(suite.vault);
      assert.deepStrictEqual(suite.results, {});

      // Measure full rebuild
      const fullResult = suite.fullRebuild(1);
      assert.ok(fullResult.duration >= 0);
      assert.ok(suite.results.fullRebuild);

      // Measure score pairs
      const scoreResult = suite.scorePairs(1);
      assert.ok(scoreResult.duration >= 0);
      assert.ok(suite.results.scorePairs);

      // Get all results
      const results = suite.getResults();
      assert.ok(results.fullRebuild);
      assert.ok(results.scorePairs);
    } finally {
      rmSync(vaultPath, { recursive: true });
    }
  });
});
