/**
 * Benchmark — Performance measurement for graph operations
 *
 * Measures operation timing, memory usage, and provides comparison capabilities
 * for identifying performance regressions.
 */

export class Benchmark {
  constructor(name) {
    this.name = name;
    this.runs = [];
  }

  /**
   * Run operation and measure time
   * @param {Function} fn - Function to benchmark
   * @param {number} iterations - Number of times to run (default 1)
   * @returns {Object} Timing result
   */
  measure(fn, iterations = 1) {
    const startMemory = process.memoryUsage().heapUsed;
    const startTime = process.hrtime.bigint();

    for (let i = 0; i < iterations; i++) {
      fn();
    }

    const endTime = process.hrtime.bigint();
    const endMemory = process.memoryUsage().heapUsed;
    const duration = Number(endTime - startTime) / 1_000_000; // Convert to ms

    const result = {
      duration,
      iterations,
      avgDuration: duration / iterations,
      memoryDelta: (endMemory - startMemory) / 1024 / 1024, // MB
    };

    this.runs.push(result);
    return result;
  }

  /**
   * Get statistics for all runs
   * @returns {Object} Statistics object
   */
  stats() {
    if (this.runs.length === 0) return null;

    const durations = this.runs.map(r => r.avgDuration);
    const sorted = [...durations].sort((a, b) => a - b);
    const sum = durations.reduce((a, b) => a + b, 0);
    const avg = sum / durations.length;
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const median = sorted[Math.floor(sorted.length / 2)];

    return { avg, min, max, median, count: durations.length };
  }

  /**
   * Format result for display
   * @param {Object} result - Result from measure()
   * @returns {string} Formatted string
   */
  static format(result) {
    if (!result) return 'no data';
    const dur = result.avgDuration?.toFixed(2) || result.duration?.toFixed(2);
    const mem = result.memoryDelta?.toFixed(1);
    return `${dur}ms (${result.iterations} iterations, ${mem}MB delta)`;
  }

  /**
   * Compare two results
   * @param {Object} baseline - Baseline result
   * @param {Object} current - Current result
   * @returns {Object} Comparison {ratio, percentChange, isRegression}
   */
  static compare(baseline, current) {
    const baselineTime = baseline.avgDuration || baseline.duration;
    const currentTime = current.avgDuration || current.duration;
    const ratio = currentTime / baselineTime;
    const percentChange = ((ratio - 1) * 100).toFixed(1);
    const isRegression = ratio > 1.1; // 10% regression threshold

    return { ratio: ratio.toFixed(2), percentChange, isRegression };
  }
}

/**
 * Performance suite for graph operations
 */
export class GraphBenchmarkSuite {
  constructor(vault, indexManager, similarityEngine) {
    this.vault = vault;
    this.IndexManager = indexManager;
    this.SimilarityEngine = similarityEngine;
    this.results = {};
  }

  /**
   * Run full rebuild benchmark
   * @param {number} iterations - Number of iterations
   * @returns {Object} Benchmark result
   */
  fullRebuild(iterations = 1) {
    const benchmark = new Benchmark('fullRebuild');
    const idx = new this.IndexManager(this.vault);

    const result = benchmark.measure(() => {
      const notes = this.vault.scanNotes({ includeBody: true });
      idx.rebuildGraph(notes);
    }, iterations);

    this.results.fullRebuild = result;
    return result;
  }

  /**
   * Run incremental rebuild benchmark
   * @param {number} iterations - Number of iterations
   * @returns {Object} Benchmark result
   */
  incrementalRebuild(iterations = 1) {
    const benchmark = new Benchmark('incrementalRebuild');
    const idx = new this.IndexManager(this.vault);

    // Mark some files as dirty before rebuild
    const notes = this.vault.scanNotes();
    const dirtyCount = Math.ceil(notes.length * 0.2); // Dirty 20% of notes
    for (let i = 0; i < dirtyCount && i < notes.length; i++) {
      this.vault.tracker.markDirty(notes[i].file);
    }

    const result = benchmark.measure(() => {
      const notesFresh = this.vault.scanNotes({ includeBody: true });
      idx.rebuildGraph(notesFresh);
    }, iterations);

    this.results.incrementalRebuild = result;
    return result;
  }

  /**
   * Run similarity scoring benchmark
   * @param {number} iterations - Number of iterations
   * @returns {Object} Benchmark result
   */
  scorePairs(iterations = 1) {
    const benchmark = new Benchmark('scorePairs');
    const engine = new this.SimilarityEngine(this.vault);

    const notes = this.vault.scanNotes({ includeBody: true });
    const result = benchmark.measure(() => {
      engine.scorePairs(notes);
    }, iterations);

    this.results.scorePairs = result;
    return result;
  }

  /**
   * Get all results
   * @returns {Object} All benchmark results
   */
  getResults() {
    return this.results;
  }
}
