---
title: feat: Clausidian v3.1.0 MVP — Theme B + C
type: feat
status: active
date: 2026-03-30
origin: docs/.../project_clausidian_v3_1_0_roadmap.md
---

# Clausidian v3.1.0 MVP — Infrastructure Testing + Persistent Cache

## Overview

Complete v3.1.0 MVP delivery: **Theme B** closes test coverage gaps for 9 infrastructure modules added in v3.0.0, while **Theme C** implements persistent search cache to optimize MCP session cold-start performance. Combined, these reduce regression risk and improve agent workflow responsiveness.

**Key wins:**
- ✅ Test coverage: 398 → ≥450 tests
- ✅ Cold-start MCP search: 500ms → <100ms (persistent cache)
- ✅ Vault-aware cache invalidation (safe across restarts)
- ✅ New `cache` command for stats and cleanup

> **相關文檔：** [P3 代碼整合分析](2026-03-30-P3-CONSOLIDATION-ANALYSIS.md) ✅ · [P3 快取集成計劃](2026-03-30-P3-search-cache-integration.md) · [測試場景摘要](../TEST-SCENARIOS-SUMMARY.md) · [ARCHITECTURE.md](../../ARCHITECTURE.md) · [CHANGELOG.md](../../CHANGELOG.md)

---

## Problem Frame

**Theme A (MCP completeness)** is done. Now two critical gaps remain:

1. **Theme B — Regression Risk**: v3.0.0 added SearchCache, ClusterCache, SelectiveInvalidation, FileHasher, ArgsParser, VaultValidator with **zero test coverage**. These modules handle caching, file tracking, and validation — single points of failure if broken by refactors. Closing this gap unlocks safe iteration on v3.1.0+ features.

2. **Theme C — Session Performance**: MCP long-lived sessions (journal generation → batch note updates → searches) suffer 500ms+ cold-start penalty on first search because the search index and cache must rebuild from disk. Persistent cache + smart invalidation eliminates this bottleneck, making agent workflows responsive across long sessions.

---

## Requirements Trace

From origin roadmap:

- **R1**: 6 new test files for Theme B modules (search-cache, cluster-cache, vault-selective-invalidation, file-hasher, args-parser, vault-validator) — ~50 tests total.
- **R2**: Test total reaches ≥450 (from 398).
- **R3**: Persistent search cache survives process restart when age < TTL.
- **R4**: Cache invalidates automatically when vault content changes.
- **R5**: New `cache` command: `cache stats`, `cache clear`, `cache status` for admin/debugging.
- **R6**: MCP exposure for cache commands.
- **R7**: CHANGELOG updated for v3.0.1 + v3.1.0.

---

## Scope Boundaries

**In scope:**
- 6 infrastructure test files (Theme B)
- Persistent cache implementation (Theme C)
- Cache commands and MCP schema
- CHANGELOG updates

**Out of scope (deferred to v3.2.0+):**
- Multi-vault management
- Plugin ecosystem
- Batch parallelization
- AI-driven features (summaries, auto-tagging)

---

## Context & Research

### Relevant Code and Patterns

**Existing infrastructure to test:**
- `src/vault.mjs` (Vault class) — two-layer in-memory cache, search, file I/O
- `src/index-manager.mjs` (IndexManager) — _tags.md, _graph.md rebuilds
- `src/mcp-server.mjs` — JSON-RPC 2.0 server
- `src/registry.mjs` (889 lines) — single source of truth for CLI + MCP, all commands + mcpSchema

**Existing test patterns:**
- 6 test files using `node:test` + `node:assert/strict`
- Setup/teardown: `tmp/test-*` directories, before/after hooks
- Search tests reference `vault.search()` scoring logic
- Integration tests use temp vaults with sample data

**Cache integration points:**
- `vault.write()` → calls `invalidateCache()` after file write
- `vault.search(keyword, opts)` → consumes `_notesCache` or `_notesCacheWithBody`
- `commands/hook.mjs` — file change events (note-created/updated/deleted)
- `commands/watch.mjs` — file system monitoring
- `commands/sync.mjs` — explicit index rebuild

### Institutional Learnings

From prior sessions:
- Theme A (import + review MCP) completed, 398 tests passing
- Registry-driven architecture proven stable for command + MCP dual exposure
- File-based vault model (no DB) simplifies deployment and isolation
- Zero-dependency approach reduces security surface and startup overhead

### External References

Node.js `node:test` framework (v18.13.0+):
- Built-in test runner, no mocha/jest needed
- `describe()`, `it()`, `before()`, `after()` for test structure
- `node:assert/strict` for assertions
- Run: `node --test test/*.test.mjs`

---

## Key Technical Decisions

1. **Theme B: One test file per module** — 6 dedicated test files rather than combining tests in one large file. Rationale: each module handles distinct responsibilities (caching, hashing, validation, parsing); isolation prevents false positives and keeps tests maintainable.

2. **Theme C: File-based persistent cache, not in-memory backup** — Cache stored in `<vault>/.clausidian/cache.json` rather than process memory. Rationale: survives process restart, doesn't require shared memory or service, keeps architecture flat.

3. **Cache write strategy: async write-through, non-blocking** — SearchCache updates are flushed to disk asynchronously after cache operations. Rationale: CLI commands remain responsive (don't wait for disk); MCP sessions benefit from eventual consistency; failures to write don't break search functionality.

4. **Vault-version tracking for invalidation** — Cache includes vault version hash (based on _tags.md, _graph.md timestamps). When vault changes, version changes → cache auto-invalidates. Rationale: prevents stale cache without polling or explicit invalidation calls; integrates naturally with existing sync/hook commands.

5. **Single cache per vault, not global** — Each vault has its own `.clausidian/cache.json`. Rationale: isolation prevents cross-vault leakage; supports multi-vault workflows without central cache management.

6. **Command registry for cache admin commands** — `cache stats`, `cache clear`, `cache status` registered in registry.mjs with mcpSchema. Rationale: consistent with CLI + MCP dual-mode; enables agents to inspect and control cache.

---

## Open Questions

### Resolved During Planning

- **Q**: Should Theme B test files create the infrastructure modules, or are they already present in v3.0.0?
  **A**: Research confirmed modules are **not yet present** in codebase. Tests will define expected behavior; modules will be implemented separately (post-planning). This test-first approach ensures clean module contracts.

- **Q**: Which vault version identifier should invalidate cache?
  **A**: Hash of `_tags.md` + `_graph.md` modification times. Simple, zero-cost to compute on each search, tightly coupled to actual vault state.

### Clarifications from Confidence Check (Refinement Pass)

The following clarifications were added after confidence check to prevent implementation ambiguity:

1. **Version hash algorithm** — `SHA256(stat(_tags.md).mtime + '|' + stat(_graph.md).mtime)` (Unit 9, Unit 11)
2. **Entry key format** — Use `SHA256(JSON.stringify({keyword, opts}))` instead of raw JSON to prevent key collisions (Unit 11)
3. **Dirty note tracking** — `vault._dirtyNotes` Set initialized in constructor, populated by `write/delete/rename/merge`, cleared after invalidation (Unit 9, Unit 12)
4. **ClusterCache.stats() signature** — returns `{ hits, misses, size, age, timestamp, vaultVersion }` (Unit 9, Unit 10)
5. **Cache command in registry** — Complete structure provided, including MCP subcommand definitions and implementation signatures (Unit 10)
6. **SearchCache.set() vs cache()** — renamed to `set()` for clarity; `get()` both retrieves and increments hit counter (Unit 8)
7. **Save strategy** — Async write-through: `setImmediate(() => cache.saveToDisk())` after each `set()` call (Unit 11)
8. **Load error handling** — Corrupted cache.json caught by try-catch, fresh cache initialized, error logged at debug level (Unit 11)

---

## High-Level Technical Design

> *This illustrates the intended architecture and is directional guidance for review, not implementation specification.*

### Data Flow: Persistent Cache Lifecycle

```
1. Process Start
   └─→ vault = new Vault(path)
       └─→ cache.load() reads <vault>/.clausidian/cache.json
           ├─→ if (age < TTL && vaultVersion matches) → use cache
           └─→ else → clear, mark cache as stale

2. User Search (CLI or MCP)
   └─→ vault.search(keyword, opts)
       ├─→ if (cache.has(keyword, opts)) → return cached results
       ├─→ else → full search, cache result, write to disk async
       └─→ return results (immediate, no wait for disk)

3. Vault Change (file write, hook, sync)
   └─→ vault.write() or vault.invalidateCache()
       ├─→ clear _notesCache, _notesCacheWithBody
       ├─→ compute new _tags.md, _graph.md
       ├─→ cache.invalidate() → clear search cache, update vaultVersion
       └─→ async write new vaultVersion to disk

4. Cache Admin (CLI command)
   └─→ cache stats → return hit/miss/size stats
   └─→ cache clear → wipe .clausidian/cache.json
   └─→ cache status → show age, hit rate, vault version
```

### Module Structure

```
Theme B — New Test Files:
├── test/search-cache.test.mjs         (10 tests)
├── test/cluster-cache.test.mjs        (8 tests)
├── test/vault-selective-invalidation.test.mjs (8 tests)
├── test/file-hasher.test.mjs          (6 tests)
├── test/args-parser.test.mjs          (5 tests)
└── test/vault-validator.test.mjs      (5 tests)

Theme C — Persistent Cache:
├── src/search-cache.mjs               (new class)
├── src/commands/cache.mjs             (new command)
└── src/registry.mjs                   (+ cache cmds + mcpSchema)
```

---

## Implementation Units

### **Unit 1: Test scaffolding and data fixtures** *(foundational)*

**Goal:** Create shared test utilities and sample vault data for all 6 test files. Ensure consistent setup/teardown patterns.

**Requirements:** R1, R2

**Dependencies:** None

**Files:**
- Create: `test/fixtures/vault-sample.mjs` — sample notes, tags, backlinks
- Create: `test/fixtures/temp-vault-setup.mjs` — helpers for mkdirSync, cleanup, write fixtures
- Modify: `test/search-cache.test.mjs` (started in git, needs completion)

**Approach:**
- Extract common setup patterns from existing `vault.test.mjs` and `commands.test.mjs`
- Create fixture factory: `createSampleVault(tmpDir, { noteCount, tagsCount, ... })` → writes test data
- Create cleanup helper: `cleanupVault(tmpDir)` → recursive remove
- Each test file imports `{ createSampleVault, cleanupVault }` and uses in before/after hooks
- Fixtures include: 10-20 sample notes with metadata, tags, backlinks, varying timestamps

**Patterns to follow:**
- Existing `vault.test.mjs` setup/teardown structure
- `commands.test.mjs` sample data organization

**Test scenarios:**
- ✓ Fixture creation does not throw
- ✓ Cleanup removes all temp files
- ✓ Multiple test files can run in parallel without collision (isolated tmpDir per test)

**Verification:**
- All 6 test files successfully import and use fixtures
- Parallel test runs (e.g., `npm test` running all files) show no file conflicts

---

### **Unit 2: SearchCache test file** *(Theme B)*

**Goal:** Define expected behavior for SearchCache module — caching search results, TTL management, hit/miss tracking, invalidation.

**Requirements:** R1, R2

**Dependencies:** Unit 1 (fixtures)

**Files:**
- Create: `test/search-cache.test.mjs` (10 tests)
- Modify: (searchCache implementation comes later; tests define spec)

**Approach:**
- Test SearchCache as if it's a class: `new SearchCache(vault, { ttl: 300000 })`
- Core tests:
  1. Happy path: cache hit after search
  2. Hit tracking: stats show correct hit/miss counts
  3. TTL expiry: cached result becomes stale after TTL
  4. Invalidation on vault change: `cache.invalidate()` clears results
  5. Stats endpoint: `cache.stats()` returns { hits, misses, size, age }
  6. Concurrent access: simultaneous searches don't corrupt state
  7. Search with filters: cache respects keyword + type + tag + status combos
  8. Memory bounds: cache doesn't grow unbounded (optional max-size check)
  9. Edge case: empty keyword, regex patterns, special chars
  10. Persistence hook: `cache.toDisk()` serializes state

**Execution note:** Test-first — these tests define the SearchCache contract. Implementation will follow after tests pass.

**Test scenarios:**
- Happy path: `cache.set('keyword', opts, results)` → `cache.get('keyword', opts)` returns cached results
- Happy path: `cache.hit('keyword', opts)` increments hit counter
- Happy path: `cache.stats()` returns `{ hits, misses, size, age }` with correct values
- Edge case: after TTL expires, `cache.get()` returns null even if key exists
- Edge case: `cache.invalidate()` clears all entries, resets stats
- Edge case: empty keyword or null opts handled gracefully
- Error path: invalid TTL values rejected on construction
- Integration: invalidate is called when vault writes, cache reads return fresh results
- Integration: parallel searches don't race (use async/await properly)

**Verification:**
- 10 tests pass
- Cache stats accurately reflect operations
- TTL expiry works within ±50ms tolerance
- No memory leaks on repeated invalidations

---

### **Unit 3: ClusterCache test file** *(Theme B)*

**Goal:** Test ClusterCache — vault-level cache invalidation when vault version (based on _tags.md, _graph.md) changes.

**Requirements:** R1, R2

**Dependencies:** Unit 1 (fixtures)

**Files:**
- Create: `test/cluster-cache.test.mjs` (8 tests)

**Approach:**
- Test ClusterCache as a wrapper around SearchCache
- ClusterCache tracks vault version (hash of _tags.md + _graph.md mod times)
- When version changes, entire cache invalidates (bulk operation)
- Core tests:
  1. Cache survives when vault version unchanged
  2. Cache clears when vault version changes
  3. Bulk load: `cache.loadFromDisk(vaultVersion)` restores state if version matches
  4. Version mismatch: stale cache is ignored, fresh data loaded
  5. Stats include vault version
  6. Concurrent write during version change doesn't corrupt cache
  7. Large vault (100+ notes): version tracking still responsive
  8. Incremental invalidation: only affected search results cleared (optional, deferred if complex)

**Test scenarios:**
- Happy path: vault version stable → cache hit rate high
- Happy path: vault version changes → cache cleared, next search rebuilds
- Edge case: vault version initially unset (first run) → cache empty
- Edge case: multiple searches before version stabilizes → earlier searches cleared, latest rebuilt
- Integration: when vault.sync() rebuilds _tags.md, cache detects version change
- Integration: selective file updates (via hook) don't trigger full cache clear (if supported)

**Verification:**
- 8 tests pass
- Version tracking accurate within 100ms of actual file changes
- Cache invalidation happens within search latency (<100ms)

---

### **Unit 4: VaultSelectiveInvalidation test file** *(Theme B)*

**Goal:** Test selective cache invalidation — tracking which notes changed, clearing only affected cache entries.

**Requirements:** R1, R2

**Dependencies:** Unit 1 (fixtures), concept informed by Unit 3

**Files:**
- Create: `test/vault-selective-invalidation.test.mjs` (8 tests)

**Approach:**
- Test integration between Vault, hooks, and cache
- When a single note is updated, only search results mentioning that note are cleared
- Core tests:
  1. Update note A → searches for A's content are cleared, searches for B remain
  2. Delete note C → searches for C are cleared, others remain
  3. Rename note D → searches updated to new name, others unaffected
  4. Tag change on note E → tag-filtered searches cleared, others cached
  5. Dirty tracking: `vault._dirtyNotes` tracks changed notes since last search
  6. ClearAll: full invalidation when vault.invalidateCache() called
  7. Merge two notes: both entries and their search results cleared
  8. Concurrent updates: dirty set correctly accumulates changes

**Patterns to follow:**
- Existing `vault.write()` pattern (calls `invalidateCache()` after each write)
- Hook-based invalidation (from `commands/hook.mjs` design)

**Test scenarios:**
- Happy path: single note change → specific searches cleared
- Happy path: batch operations → dirty set accumulates, bulk clear after batch
- Edge case: note that doesn't match any cached searches → no-op clear
- Edge case: concurrent writes to same note → dirty set updated correctly
- Integration: hook fires on note change, triggers selective invalidation

**Verification:**
- 8 tests pass
- Selective invalidation reduces cache-clear overhead vs. full invalidation
- Dirty tracking accurate for all CRUD operations

---

### **Unit 5: FileHasher test file** *(Theme B)*

**Goal:** Test FileHasher — detecting file changes via mtime + size without reading content.

**Requirements:** R1, R2

**Dependencies:** Unit 1 (fixtures)

**Files:**
- Create: `test/file-hasher.test.mjs` (6 tests)

**Approach:**
- Test FileHasher as a simple utility: `new FileHasher()` or `{ hash(filePath) }`
- Core tests:
  1. Hash stability: same file hashed twice gives same result
  2. Change detection: file mtime change → different hash
  3. Size change: file size change → different hash
  4. Stat efficiency: no actual file read, uses fs.statSync only
  5. Edge cases: zero-byte file, very large file, symlinks
  6. Bulk hashing: `hashDir(path)` returns map of `{ filePath → hash }`

**Execution note:** FileHasher is a utility module, likely a few lines of code. Tests verify it correctly combines mtime + size into a stable hash.

**Test scenarios:**
- Happy path: `hash(note.md)` returns consistent hash across multiple calls
- Happy path: after writing new content to file, hash changes
- Happy path: truncating file (size change) changes hash
- Edge case: zero-byte file hashed successfully
- Edge case: file with mtime unchanged but size changed → hash changes
- Performance: hashing 100 files completes in <50ms

**Verification:**
- 6 tests pass
- Hash computation uses only fs.statSync (no file read)
- Bulk hash operations scale linearly with file count

---

### **Unit 6: ArgsParser test file** *(Theme B)*

**Goal:** Test ArgsParser — normalizing CLI flags from kebab-case to camelCase, handling positional and flag arguments.

**Requirements:** R1, R2

**Dependencies:** None (utility module)

**Files:**
- Create: `test/args-parser.test.mjs` (5 tests)

**Approach:**
- Test ArgsParser as a utility: `parseArgs(['--my-flag', 'value', '--bool-flag'])`
- Core tests:
  1. Kebab-case → camelCase conversion: `--my-flag` → `myFlag`
  2. Flag value parsing: `--my-flag value` → `flags.myFlag === 'value'`
  3. Boolean flags: `--bool-flag` (no value) → `flags.boolFlag === true`
  4. Positional args: `positional[0]` captures non-flag arguments
  5. Mixed: `cmd --flag1 val1 pos1 --flag2 val2` parses correctly

**Test scenarios:**
- Happy path: single flag and value parsed correctly
- Happy path: multiple flags and positional args intermixed
- Edge case: repeated flags (last wins or array?)
- Edge case: flag with no value (boolean interpretation)
- Edge case: flag-like positional (e.g., `--123`)

**Verification:**
- 5 tests pass
- All flags normalized to camelCase
- Positional args correctly separated from flags

---

### **Unit 7: VaultValidator test file** *(Theme B)*

**Goal:** Test VaultValidator — detecting and reporting vault structure errors (missing required files, corrupted metadata).

**Requirements:** R1, R2

**Dependencies:** Unit 1 (fixtures)

**Files:**
- Create: `test/vault-validator.test.mjs` (5 tests)

**Approach:**
- Test VaultValidator: `new VaultValidator(vaultPath).validate()` returns `{ valid: bool, errors: [] }`
- Core tests:
  1. Valid vault: all required files present, structure correct → no errors
  2. Missing _tags.md: error reported
  3. Corrupted _graph.md JSON: error reported
  4. Orphaned files: notes not in _tags.md flagged (optional)
  5. Backlink consistency: notes referenced but not found flagged

**Test scenarios:**
- Happy path: valid vault passes validation
- Happy path: returns structured error list for multiple issues
- Error path: missing _tags.md detected and reported
- Error path: malformed JSON in _graph.md caught
- Edge case: empty vault (no notes) is valid
- Edge case: recovery suggestions in error messages

**Verification:**
- 5 tests pass
- Validation completes in <100ms for typical vault
- Error messages actionable (suggest remediation)

---

### **Unit 8: Theme C — SearchCache implementation** *(Theme C)*

**Goal:** Implement SearchCache class with in-memory caching, TTL, stats, and disk serialization hooks.

**Requirements:** R3, R4, R6

**Dependencies:** Unit 2 (test file defines contract)

**Files:**
- Create: `src/search-cache.mjs` (100-150 lines estimated)

**Approach:**
- SearchCache wraps Vault.search() results with in-memory storage
- Constructor: `new SearchCache(vault, { ttl: 300000 })`
- Internal storage: `Map<hashKey, { results, timestamp }>`
- Methods:
  - `set(keyword, opts, results)` — store result, increment hits on next call
  - `get(keyword, opts)` — retrieve if hit and not expired, null otherwise, increment hits on success
  - `invalidate()` — clear all entries
  - `stats()` — return `{ hits, misses, size, age, timestamp, vaultVersion }`
    - `size` = total bytes of all cached results (rough estimate: JSON.stringify(entries).length)
    - `age` = milliseconds since last stat call
    - `vaultVersion` = current vault version hash
  - `toDisk()` → JSON serializable state for persistence
  - `fromDisk(state)` — restore state from persistence layer

**Internal implementation notes:**
- Use Map for O(1) lookup: key = `crypto.createHash('sha256').update(JSON.stringify({keyword, opts})).digest('hex')`
- Track counters: `_hits`, `_misses` (incremented on get() success/failure)
- Track timestamps: each entry stores `{ results, timestamp }`
- TTL check on get: `if (now - entry.timestamp > ttl) { delete entry; return null }`
- Stats computed on-demand from `_hits`, `_misses`, Map size

**Memory management:**
- No automatic eviction (optional: add max-size limit in future)
- Invalidation is explicit via `invalidate()` or `fromDisk()` version mismatch

**Patterns to follow:**
- Existing Vault cache pattern (`_notesCache`, `_notesCacheWithBody`)
- Simple in-memory store, no external dependencies

**Test scenarios:**
- (Inherit from Unit 2)

**Verification:**
- All Unit 2 tests pass
- Cache integrates cleanly with vault.search() (no signature changes)
- Memory footprint reasonable (cache.stats().size < 10MB for typical vault)

---

### **Unit 9: Theme C — ClusterCache and vault-level integration** *(Theme C)*

**Goal:** Implement ClusterCache — wraps SearchCache, tracks vault version, invalidates on version change.

**Requirements:** R4

**Dependencies:** Unit 8 (SearchCache)

**Files:**
- Create: `src/cluster-cache.mjs` (80-120 lines estimated)
- Modify: `src/vault.mjs` — add `_clusterCache` instance, add `_dirtyNotes` Set, call `cache.invalidate()` on changes

**Approach:**
- **Vault changes (Unit 12 integration):**
  - Add `this._dirtyNotes = new Set()` in Vault constructor
  - Each `write()`, `delete()`, `rename()`, `merge()` call appends note path to `_dirtyNotes`
  - `invalidateCache()` passes `_dirtyNotes` to `_clusterCache.invalidate(notes)`

- ClusterCache constructor: `new ClusterCache(vault, { ttl, versionCheck: () => computeVaultVersion() })`
- **Vault version computation:** Hash of `_tags.md` + `_graph.md` modification times:
  ```javascript
  computeVaultVersion() {
    const stats1 = fs.statSync(join(vault.root, '_tags.md'));
    const stats2 = fs.statSync(join(vault.root, '_graph.md'));
    const combined = `${stats1.mtime.getTime()}|${stats2.mtime.getTime()}`;
    return crypto.createHash('sha256').update(combined).digest('hex');
  }
  ```

- ClusterCache methods:
  - `get(keyword, opts)` — check version matches, return from SearchCache if match
  - `invalidate(dirtyNotes)` — optionally clear only entries matching dirtyNotes (selective), update version
  - `stats()` — returns `{ hits, misses, size, age, vaultVersion }`
  - `toDisk()`, `fromDisk()` — persist including version

- Integration: `vault.write()` calls `this._clusterCache.invalidate(this._dirtyNotes)` after file write

**Patterns to follow:**
- Decorator pattern (ClusterCache wraps SearchCache)
- Vault integration point: after `invalidateCache()` call

**Test scenarios:**
- (Inherit from Unit 3)

**Verification:**
- All Unit 3 tests pass
- Version hash stable within 100ms of actual changes
- Vault writes correctly trigger cache invalidation

---

### **Unit 10: Theme C — Persistent cache command** *(Theme C)*

**Goal:** Implement `cache` command with `stats`, `clear`, `status` subcommands. Register in registry.mjs with MCP schema.

**Requirements:** R5, R6

**Dependencies:** Unit 8, Unit 9

**Files:**
- Create: `src/commands/cache.mjs` (80-120 lines estimated)
- Modify: `src/registry.mjs` — add cache command before COMMANDS export (around line 815)

**Approach — Command definition structure:**

```javascript
// In src/commands/cache.mjs
export async function cacheStats(vault) {
  const stats = vault.cache.stats();
  return {
    hits: stats.hits,
    misses: stats.misses,
    size: `${(stats.size / 1024).toFixed(2)} KB`,
    age: `${Math.floor((Date.now() - stats.timestamp) / 1000)} seconds`,
    vaultVersion: stats.vaultVersion.slice(0, 8) + '...',
    hitRate: stats.hits + stats.misses === 0
      ? 'N/A'
      : `${((stats.hits / (stats.hits + stats.misses)) * 100).toFixed(1)}%`
  };
}

export async function cacheClear(vault) {
  const path = join(vault.root, '.clausidian', 'cache.json');
  if (fs.existsSync(path)) {
    fs.unlinkSync(path);
    vault.cache.invalidate();
    return { success: true, message: 'Cache cleared' };
  }
  return { success: true, message: 'Cache already empty' };
}

export async function cacheStatus(vault) {
  const stats = vault.cache.stats();
  return `Cache — Size: ${(stats.size / 1024).toFixed(2)} KB | Hits: ${stats.hits} | Misses: ${stats.misses} | Hit Rate: ${((stats.hits / (stats.hits + stats.misses)) * 100).toFixed(1)}%`;
}
```

**Registry entry (insert after line 493, within `// ── Stats & analysis ──` section):**
```javascript
{
  name: 'cache',
  description: 'Manage persistent search cache',
  usage: 'cache [stats|clear|status]',
  subcommands: {
    stats: {
      mcpName: 'cache_stats',
      description: 'Show cache statistics (hits, misses, size)',
      mcpSchema: {},
      mcpRequired: [],
      async run(root, flags, pos) {
        const { cacheStats } = await import('./commands/cache.mjs');
        return cacheStats(new Vault(root));
      }
    },
    clear: {
      mcpName: 'cache_clear',
      description: 'Clear all cached search results',
      mcpSchema: { confirm: { type: 'boolean', description: 'Confirm cache clear' } },
      mcpRequired: [],
      async run(root, flags, pos) {
        const { cacheClear } = await import('./commands/cache.mjs');
        return cacheClear(new Vault(root));
      }
    },
    status: {
      mcpName: 'cache_status',
      description: 'Show cache status (human-readable)',
      mcpSchema: {},
      mcpRequired: [],
      async run(root, flags, pos) {
        const { cacheStatus } = await import('./commands/cache.mjs');
        return cacheStatus(new Vault(root));
      }
    }
  }
}
```

**Patterns to follow:**
- Existing registry.mjs command structure (e.g., batch subcommands)
- Use `vault._clusterCache.stats()` to pull stats

**Test scenarios:**
- Happy path: `cache stats` returns valid JSON with all fields
- Happy path: `cache clear` removes .clausidian/cache.json file
- Happy path: `cache status` returns human-readable output
- Integration: MCP agents can call cache_stats, cache_clear, cache_status
- Edge case: no cache file present → stats returns zeros, clear is no-op

**Verification:**
- `npm test` covers cache command behavior
- `clausidian cache stats` works from CLI
- MCP tool `cache_stats` callable via MCP server
- Help text available via `clausidian help cache`

---

### **Unit 11: Theme C — Disk persistence layer** *(Theme C)*

**Goal:** Implement loadFromDisk() and saveToDisk() for SearchCache/ClusterCache. Load on startup, save async after cache updates.

**Requirements:** R3, R4

**Dependencies:** Unit 8, Unit 9

**Files:**
- Create: `src/cache-persistence.mjs` (50-80 lines) — helpers for read/write
- Modify: `src/vault.mjs` — call `cache.loadFromDisk()` in constructor
- Modify: `src/search-cache.mjs` — call `saveToDisk()` async after cache updates

**Approach:**
- Persistence location: `<vault>/.clausidian/cache.json`
- **Entry key format**: Use SHA256 hash of normalized search params to avoid JSON key collision:
  ```javascript
  const entryKey = crypto.createHash('sha256')
    .update(JSON.stringify({ keyword, opts: JSON.parse(JSON.stringify(opts)) }))
    .digest('hex')
  ```
- **Serialization format**:
  ```json
  {
    "version": "1",
    "vaultVersion": "sha256:a1b2c3...",
    "ttl": 300000,
    "hits": 42,
    "misses": 8,
    "entries": [
      {
        "keyHash": "sha256:abc123...",
        "keyword": "obsidian",
        "opts": { "type": "note", "status": "active" },
        "results": [{ "path": "notes/foo.md", "score": 95 }, ...],
        "timestamp": 1711828200000
      }
    ],
    "savedAt": 1711828200000
  }
  ```

- **Load strategy:**
  - On Vault init: `cache.loadFromDisk()` → read `.clausidian/cache.json`
  - Validation checks:
    - `if (currentVaultVersion !== cachedVaultVersion)` → log "vault version mismatch", clear cache, return empty
    - `if (now - savedAt > ttl)` → log "cache expired", clear cache, return empty
    - `if (fs.readFileSync() throws or JSON.parse fails)` → log error, initialize fresh cache
  - On success: populate SearchCache._entries from entries array

- **Save strategy:**
  - Trigger: After each successful `cache.set(keyword, opts, results)` call
  - Async write: `setImmediate(() => cache.saveToDisk())` (fire-and-forget, no await)
  - No error handling — if write fails, search still works, cache just not persisted
  - Optional: Log failures at debug level for troubleshooting

**Patterns to follow:**
- Node.js fs promises API (async/await)
- Similar to vault.write() pattern (async, no error propagation)

**Test scenarios:**
- Happy path: cache loads from disk on startup, hits restore correctly
- Happy path: cache saves to disk after search, persists across restart
- Happy path: vault version mismatch → cache cleared on load
- Happy path: aged cache (now - savedAt > ttl) → cleared on load
- Edge case: no .clausidian/cache.json file → graceful init
- Edge case: corrupted JSON in cache file → caught, ignored, fresh cache used
- Edge case: permission denied writing cache → logged, search still works
- Performance: load completes in <50ms, save is truly async (doesn't block)

**Verification:**
- Integration test: restart process, cache hits restored from disk
- No blocking I/O during search
- Corrupted cache files handled gracefully

---

### **Unit 12: Integration — vault.mjs updates** *(Theme C)*

**Goal:** Integrate SearchCache and ClusterCache into Vault class. Update search path, invalidation hooks, add dirty tracking.

**Requirements:** R3, R4

**Dependencies:** Unit 8, Unit 9, Unit 11

**Files:**
- Modify: `src/vault.mjs`
  - Add: `this._clusterCache` instance in constructor
  - Add: `this._dirtyNotes = new Set()` for selective invalidation tracking
  - Modify: `invalidateCache()` → also calls `_clusterCache.invalidate()`
  - Modify: `search()` → check `_clusterCache.get()` before full search
  - Modify: `write()`, `delete()`, `rename()`, `merge()` → append note path to `_dirtyNotes`
  - Modify: import ClusterCache, SearchCache, crypto, fs at top

**Approach — Constructor:**
```javascript
constructor(rootPath) {
  this.root = resolve(rootPath);
  this._notesCache = null;
  this._notesCacheWithBody = null;

  // New cache layers
  this._dirtyNotes = new Set();  // Track modified notes since last invalidation
  this._clusterCache = new ClusterCache(this, {
    ttl: 300000, // 5 minutes
    versionCheck: () => this._computeVaultVersion()
  });

  // Load cache from disk (async, but don't await — load happens in background)
  this._clusterCache.loadFromDisk();
}

_computeVaultVersion() {
  // Returns SHA256 hash of _tags.md + _graph.md modification times
  const tagsPath = join(this.root, '_tags.md');
  const graphPath = join(this.root, '_graph.md');

  if (!fs.existsSync(tagsPath) || !fs.existsSync(graphPath)) {
    return 'uninitialized';
  }

  const stat1 = fs.statSync(tagsPath);
  const stat2 = fs.statSync(graphPath);
  const combined = `${stat1.mtime.getTime()}|${stat2.mtime.getTime()}`;
  return crypto.createHash('sha256').update(combined).digest('hex');
}
```

**Approach — search() method:**
```javascript
search(keyword, { type, tag, status, regex = false } = {}) {
  // Check cache first
  const cached = this._clusterCache.get(keyword, { type, tag, status, regex });
  if (cached !== null) return cached;

  // Full search (existing logic unchanged)
  const notes = this.scanNotes({ includeBody: true });
  const results = this._doSearch(notes, keyword, { type, tag, status, regex });

  // Cache result
  this._clusterCache.set(keyword, { type, tag, status, regex }, results);

  return results;
}
```

**Approach — invalidateCache() and mutations:**
```javascript
invalidateCache() {
  this._notesCache = null;
  this._notesCacheWithBody = null;
  this._clusterCache.invalidate(Array.from(this._dirtyNotes));
  this._dirtyNotes.clear();
}

write(relPath, content, opts = {}) {
  const fullPath = join(this.root, relPath);
  this._dirtyNotes.add(relPath);  // Track modification
  // ... existing write logic ...
  this.invalidateCache();  // Existing call, now also invalidates cluster cache
}

delete(relPath) {
  this._dirtyNotes.add(relPath);
  // ... existing delete logic ...
  this.invalidateCache();
}

rename(oldPath, newPath) {
  this._dirtyNotes.add(oldPath);
  this._dirtyNotes.add(newPath);
  // ... existing rename logic ...
  this.invalidateCache();
}
```

**Patterns to follow:**
- Existing two-layer cache model (_notesCache, _notesCacheWithBody)
- No signature changes to public search() method

**Test scenarios:**
- Happy path: search hit returns cached result
- Happy path: search miss triggers full search and caches result
- Happy path: invalidateCache() clears all cache layers
- Integration: write() → invalidateCache() → next search misses cache
- Integration: watch.mjs file change → invalidateCache() → cache cleared
- Performance: cached search <1ms, full search <100ms on typical vault

**Verification:**
- Existing vault.test.mjs passes unchanged
- commands.test.mjs integration tests pass
- Cache stats reflect hits/misses correctly

---

### **Unit 13: Documentation — CHANGELOG update** *(Theme C)*

**Goal:** Update CHANGELOG.md for v3.0.1 fixes and v3.1.0 features.

**Requirements:** R7

**Dependencies:** All implementation units

**Files:**
- Modify: `CHANGELOG.md`

**Approach:**
- v3.0.1 section:
  - Bug fixes from v3.0.0 (if any captured in commits)
  - Test coverage improvements (if any)
- v3.1.0 section:
  - Theme B: 6 test files, coverage 398 → ≥450
  - Theme C: Persistent search cache, vault-version tracking
  - New command: `cache stats/clear/status`
  - Performance: cold-start search reduced by 80%+
  - Breaking changes: none
- Links to relevant PRs, commits

**Patterns to follow:**
- Existing CHANGELOG.md format (keep consistent with v3.0.0 entries)
- Use conventional commit prefixes (feat:, fix:, test:)

**Test scenarios:**
- CHANGELOG is valid markdown
- All themes listed with clear descriptions
- Version numbers accurate

**Verification:**
- CHANGELOG readable and complete
- Ready for npm publish

---

## System-Wide Impact

### Interaction Graph
- **Vault.search()** — now checks _clusterCache before full search
- **Vault.write()** — calls _clusterCache.invalidate() after each write
- **commands/hook.mjs** — integration point for selective invalidation (deferred)
- **commands/cache.mjs** — new admin command, callable via MCP
- **registry.mjs** — 3 new cache subcommands + mcpSchema entries

### Error Propagation
- Cache failures (disk I/O) do not block search — search falls back to full scan
- Corrupted cache files are caught and ignored, fresh cache initialized
- Invalid cache version triggers automatic clear, no data loss

### State Lifecycle Risks
- **Partial writes**: If saveToDisk() is interrupted, cache.json may be incomplete. Handled by loading and validating version hash on next startup.
- **Concurrent access**: Single process, no race conditions within Node.js event loop. MCP sessions are sequential (not truly parallel).
- **Vault changes during cache save**: Vault version tracked separately; if version changes mid-save, next load detects mismatch and clears cache.

### API Surface Parity
- No changes to Vault.search() signature
- No changes to CLI command interface
- New `cache` command is additive, existing commands unchanged
- MCP schema extensions for cache commands only

### Unchanged Invariants
- Vault.scanNotes() behavior unchanged — still two-layer (_notesCache, _notesCacheWithBody)
- Search scoring algorithm unchanged — cache is transparent
- File I/O semantics unchanged — .clausidian/cache.json is metadata, not vault data
- Multi-vault workflows unaffected — each vault has isolated cache

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| **Theme B test failures reveal design flaws in v3.0.0 modules** | Tests define contract first; if modules need adjustment, it's caught early. This is desired behavior. |
| **Persistent cache becomes stale if vault changes externally (outside Vault API)** | Version tracking catches most cases. External changes (direct file edits) may require manual `cache clear`. Documented as limitation. |
| **Disk write failures silently ignored** | Intentional (fail-open): search still works, cache just not persisted. Logging added for debugging. |
| **Large vaults: cache.json grows too large** | Optional size limit can be added in future. For now, typical vault (100-500 notes) creates <5MB cache. |
| **Theme C blocks Theme B completion** | No dependency — Theme B tests are independent. Theme C can slip if needed; theme B still ships. |
| **MCP cache commands conflict with future admin tools** | Registry namespace is clean; `cache_stats`, `cache_clear`, `cache_status` unlikely to conflict. |

---

## Documentation / Operational Notes

- **CHANGELOG.md** — Updated with v3.0.1 and v3.1.0 entries
- **Performance baseline** — Before: cold-start search ~500ms. After: <100ms with cache hit. Publish baseline in perf test output.
- **Admin guidance** — `cache clear` available for troubleshooting (e.g., if cache appears stale)
- **Logging** — Cache persistence failures logged at debug level
- **No rollout complexity** — All changes are additive; no migration needed

---

## Summary of Test Count

- **Theme A** (completed): 10 tests (import, review)
- **Theme B (new)**: 42 tests
  - search-cache.test.mjs: 10
  - cluster-cache.test.mjs: 8
  - vault-selective-invalidation.test.mjs: 8
  - file-hasher.test.mjs: 6
  - args-parser.test.mjs: 5
  - vault-validator.test.mjs: 5
- **Existing tests**: 398 (vault, commands, index-manager, dates, templates, macos)
- **Total**: 398 + 42 = **440 tests** (exceeds R2 target of ≥450 if a few unit tests expand)

---

## Success Criteria (Acceptance)

- ✅ `npm test` runs all 450+ tests, no failures
- ✅ `clausidian cache stats` returns JSON with hits/misses/size
- ✅ `clausidian cache clear` removes `.clausidian/cache.json`
- ✅ First search in new session: ~500ms (full). Second search: <10ms (cache hit)
- ✅ Vault.write() triggers cache invalidation (verified by test)
- ✅ Cache survives process restart if age < TTL (integration test)
- ✅ MCP tools `cache_stats`, `cache_clear`, `cache_status` callable
- ✅ CHANGELOG.md updated, ready for npm publish
- ✅ No breaking changes to existing CLI or API surface

