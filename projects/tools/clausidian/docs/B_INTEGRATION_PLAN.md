# Initiative B Modules 2.1-2.3 Integration Plan

**Timeline**: 2026-04-XX (2 hours)
**Target**: Wire B2.1 + B2.2 + B2.3 into main Vault class
**Status**: 🎯 READY FOR EXECUTION

---

## Integration Scope

### Current State
- ✅ B2.1: VaultIndexer (459 lines, 22 tests pass)
- ✅ B2.2: VaultQueryCache (278 lines, 18 tests pass)
- ✅ B2.3: ParallelQueryExecutor (184 lines, 35 tests pass)
- ✅ Vault base class (existing, ~500 lines)

### Target State
- ✅ Vault class enhanced with B2.1 + B2.2 + B2.3
- ✅ New API: `vault.searchParallel(patterns, options)`
- ✅ Enhanced API: `vault.search()` with parallel fallback
- ✅ Metrics exported: `vault.getSearchMetrics()`
- ✅ 10+ integration tests
- ✅ Zero breaking changes to existing API

---

## Implementation Tasks

### Task 1: Import & Initialization (20 min)

**File**: `src/vault.mjs`

**Changes**:
```javascript
// Add imports at top
import { VaultIndexer } from './vault-indexer.mjs';
import { VaultQueryCache } from './vault-query-cache.mjs';
import { ParallelQueryExecutor } from './parallel-query-executor.mjs';

// In constructor, initialize components
constructor(root, { dirs, vaultName = null, searchCache = null, enableParallel = true } = {}) {
  // ... existing code ...
  this.indexer = null;        // Lazy initialized
  this.queryCache = null;      // Lazy initialized
  this.parallelExecutor = null; // Lazy initialized
  this.enableParallel = enableParallel;
  this.searchMetrics = { queries: 0, cacheHits: 0, parallelUsed: 0 };
}
```

---

### Task 2: B2.1 Integration (30 min)

**Method**: `_initializeIndexer()`

```javascript
_initializeIndexer() {
  if (this.indexer) return;
  const notes = this.all();
  const indexData = {
    files: {},
    timestamp: Date.now()
  };

  for (const note of notes) {
    const fullPath = this.path(note.file);
    const hash = this._hashFile(fullPath);
    indexData.files[note.file] = {
      content: note.body || '',
      tags: note.tags || [],
      modified: new Date(note.modified).getTime(),
      hash
    };
  }

  this.indexer = new VaultIndexer(indexData);
}

_hashFile(filePath) {
  const content = readFileSync(filePath, 'utf8');
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(content).digest('hex');
}
```

---

### Task 3: B2.2 Integration (20 min)

**Method**: `_initializeQueryCache()`

```javascript
_initializeQueryCache() {
  if (this.queryCache) return;
  this.queryCache = new VaultQueryCache({
    ttlConfig: {
      stable: 86400000,        // 24h
      timeSensitive: 300000,   // 5m
      general: 3600000         // 1h
    }
  });
}
```

**Wire into search**:
```javascript
search(pattern, options = {}) {
  const useCache = options.useCache !== false;

  if (useCache && this.queryCache) {
    const cached = this.queryCache.getCached(pattern);
    if (cached) {
      this.searchMetrics.cacheHits++;
      return cached;
    }
  }

  const results = this._executeSearch(pattern);

  if (useCache && this.queryCache) {
    this.queryCache.setCached(pattern, results);
  }

  return results;
}
```

---

### Task 4: B2.3 Integration (40 min)

**Method**: `_initializeParallelExecutor()`

```javascript
_initializeParallelExecutor() {
  if (this.parallelExecutor) return;

  if (!this.indexer) this._initializeIndexer();
  if (!this.queryCache) this._initializeQueryCache();

  this.parallelExecutor = new ParallelQueryExecutor(
    this._buildIndexForExecutor(),
    {
      maxConcurrent: 10,
      defaultTimeout: 5000,
      workerCount: 4
    }
  );

  this.parallelExecutor.setCache(this.queryCache);
}

_buildIndexForExecutor() {
  const notes = this.all();
  return {
    files: notes.reduce((acc, note) => {
      acc[note.file] = {
        content: note.body || '',
        tags: note.tags || [],
        modified: note.modified
      };
      return acc;
    }, {})
  };
}
```

**New API method**:
```javascript
async searchParallel(patterns, options = {}) {
  if (!this.enableParallel) {
    // Fallback: sequential search
    return patterns.flatMap(p => this.search(p, options));
  }

  this._initializeParallelExecutor();

  const result = await this.parallelExecutor.executeParallel(
    patterns,
    { timeout: options.timeout || 5000 }
  );

  this.searchMetrics.queries++;
  if (result.source === 'cache') this.searchMetrics.cacheHits++;
  this.searchMetrics.parallelUsed++;

  return result.results;
}
```

---

### Task 5: Metrics Export (10 min)

**Method**: `getSearchMetrics()`

```javascript
getSearchMetrics() {
  const metrics = {
    ...this.searchMetrics,
    indexMetrics: this.indexer ? this.indexer.getMetrics() : null,
    cacheMetrics: this.queryCache ? this.queryCache.getMetrics() : null,
    executorMetrics: this.parallelExecutor ? this.parallelExecutor.getMetrics() : null
  };

  return metrics;
}

resetSearchMetrics() {
  this.searchMetrics = { queries: 0, cacheHits: 0, parallelUsed: 0 };
  if (this.indexer) this.indexer.resetMetrics();
  if (this.queryCache) this.queryCache.resetMetrics();
  if (this.parallelExecutor) this.parallelExecutor.resetMetrics();
}
```

---

### Task 6: Integration Tests (30 min)

**File**: `test/vault-b-integration.test.mjs`

**Tests** (10+ cases):
```javascript
test('Vault B integration: indexer initialization', async t => {
  const vault = new Vault(testRoot);
  vault._initializeIndexer();
  assert(vault.indexer, 'Should initialize indexer');
});

test('Vault B integration: query cache stores results', async t => {
  const vault = new Vault(testRoot);
  const results1 = vault.search('pattern');
  const results2 = vault.search('pattern');
  assert(results1.length === results2.length, 'Should return consistent results');
});

test('Vault B integration: parallel search returns results', async t => {
  const vault = new Vault(testRoot);
  const results = await vault.searchParallel(['pattern1', 'pattern2']);
  assert(Array.isArray(results), 'Should return array');
});

test('Vault B integration: metrics tracked correctly', async t => {
  const vault = new Vault(testRoot);
  vault.search('pattern1');
  vault.search('pattern1'); // cached
  const metrics = vault.getSearchMetrics();
  assert(metrics.cacheHits > 0, 'Should track cache hits');
});
```

---

## Files to Modify

### Primary Change: `src/vault.mjs`
- Add 3 imports (B2.1, B2.2, B2.3)
- Add lazy initialization methods (3)
- Add `searchParallel()` method (15 lines)
- Add `getSearchMetrics()` method (10 lines)
- Wire cache into `search()` method (10 lines)
- Add metrics initialization in constructor (5 lines)
- **Total additions**: ~150 lines
- **Total changes**: ZERO breaking changes

### New File: `test/vault-b-integration.test.mjs`
- 10+ integration test cases
- Verify all 3 components work together
- Test metrics tracking
- Test parallel vs sequential fallback
- **Lines**: ~200

### Documentation: `docs/B_INTEGRATION_GUIDE.md`
- Usage examples for new API
- Performance guidelines
- Troubleshooting
- **Lines**: ~100

---

## Success Criteria

✅ **Code Quality**
- All existing tests still pass
- 10+ new integration tests pass
- Zero regressions
- Backward compatible

✅ **Functionality**
- `vault.searchParallel()` works
- `vault.search()` uses cache
- Metrics exported correctly
- Fallback works when parallel disabled

✅ **Performance**
- No slowdown to existing `search()`
- Parallel search 3x faster for 5+ patterns
- Cache hits <5ms

✅ **Integration**
- B2.1 indexer initialized automatically
- B2.2 cache integrated seamlessly
- B2.3 executor ready for parallel
- Metrics available for monitoring

---

## Rollout Plan

1. **Phase 1**: Implement Task 1-4 (core integration)
2. **Phase 2**: Add integration tests (Task 5-6)
3. **Phase 3**: Run full test suite (all 75+ tests)
4. **Phase 4**: Update CLI to expose `searchParallel`
5. **Phase 5**: Commit to main branch

---

## Estimated Effort

| Task | Time | Owner |
|------|------|-------|
| 1. Imports & Init | 20m | B-Agent |
| 2. B2.1 Indexer | 30m | B-Agent |
| 3. B2.2 Cache | 20m | B-Agent |
| 4. B2.3 Parallel | 40m | B-Agent |
| 5. Metrics | 10m | B-Agent |
| 6. Tests | 30m | B-Agent |
| **TOTAL** | **2h 30m** | **B-Agent** |

---

## Risk Mitigation

| Risk | Probability | Mitigation |
|------|-------------|-----------|
| Breaking existing API | Low | Use optional params, backwards compat |
| Performance regression | Low | Test suite validates no slowdown |
| Memory leak | Low | Clear cache on vault invalidation |
| Timeout issues | Low | Configurable timeout with fallback |

---

## Deliverables

✅ Enhanced Vault class with B2.1-2.3 integrated
✅ New `searchParallel()` API
✅ Metrics tracking & export
✅ 10+ integration tests
✅ Documentation & usage guide
✅ Zero breaking changes
✅ Git commit with clear message

---

**Ready for execution?** YES ✓

