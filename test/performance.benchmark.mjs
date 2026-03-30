/**
 * Performance benchmark harness for regression detection
 * Tracks: sync latency, search p95, link suggestion time
 */

import { performance } from 'node:perf_hooks';

/**
 * Benchmark harness: runs operation N times, returns latency stats
 */
export class Benchmark {
  /**
   * Run operation and collect latency stats
   * @param {Function} fn - Operation to benchmark (async or sync)
   * @param {Object} options - { iterations, label, threshold }
   * @returns {Object} Stats: { min, max, avg, p50, p95, p99, iterations, passed }
   */
  static async run(fn, { iterations = 5, label = 'benchmark', threshold = null } = {}) {
    const times = [];

    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      await fn();
      const end = performance.now();
      times.push(end - start);
    }

    times.sort((a, b) => a - b);

    const stats = {
      label,
      iterations,
      min: times[0],
      max: times[times.length - 1],
      avg: times.reduce((a, b) => a + b, 0) / times.length,
      p50: times[Math.floor(times.length * 0.5)],
      p95: times[Math.floor(times.length * 0.95)],
      p99: times[Math.floor(times.length * 0.99)],
      passed: true,
    };

    // Check threshold if provided (p95 latency)
    if (threshold !== null && stats.p95 > threshold) {
      stats.passed = false;
      stats.error = `p95 ${stats.p95.toFixed(2)}ms exceeds threshold ${threshold}ms`;
    }

    return stats;
  }

  /**
   * Format benchmark stats for output
   */
  static format(stats) {
    const fmt = (n) => n.toFixed(2);
    return `${stats.label}: p95=${fmt(stats.p95)}ms avg=${fmt(stats.avg)}ms (${stats.iterations} runs)`;
  }
}

/**
 * Performance thresholds (from plan targets)
 */
export const THRESHOLDS = {
  SYNC_100_NOTES: 200,      // 100 notes <200ms
  SYNC_500_NOTES: 500,      // 500 notes <500ms
  SYNC_1K_NOTES: 1000,      // 1K notes <1s
  SEARCH_P95: 200,          // 95th percentile <200ms
  LINK_SUGGEST_100: 200,    // 100-note vault <200ms
  LINK_SUGGEST_500: 500,    // 500-note vault <500ms
  LINK_SUGGEST_5K: 2000,    // 5K-note vault <2s
};
