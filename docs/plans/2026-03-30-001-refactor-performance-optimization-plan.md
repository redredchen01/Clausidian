---
title: refactor: Clausidian v2.5.0 Performance Optimization
type: refactor
status: active
date: 2026-03-30
deepened: 2026-03-30
---

# Clausidian v2.5.0 Performance Optimization

## Overview

Optimize Clausidian's core performance bottlenecks across index rebuilding, search speed, and memory usage. Current implementation suffers from O(n²) link suggestions, cache invalidation overhead, and full-scan indexes. This plan targets 4 critical paths with measurable improvements: sync <1s, search +30%, memory -40%, link suggestions +50%.

## Problem Frame

Clausidian v2.5.0 is feature-complete (168 tests pass) but has scaling concerns:
- **sync command**: 5+ seconds on moderate vaults (100-500 notes) due to N² paired recommendation scoring
- **Search performance**: No incremental filtering, redundant tag lookups via `.includes()`
- **Memory spikes**: Full body text loaded for keyword extraction, no streaming
- **Link suggestions**: Cluster detection rebuilds note lookups repeatedly
- **Cache strategy**: Any write invalidates entire cache; subsequent commands re-scan vault

Target metrics:
- sync: 5s → <1s (80% improvement)
- search latency: -30% (with caching)
- memory peak: -40% (streaming + lazy load)
- link suggestions: -50% (caching + sampling)

## Requirements Trace

- R1. **Index rebuild speed**: sync command completes <1s for vaults up to 5K notes
- R2. **Search responsiveness**: 95th percentile latency <200ms with caching, no re-indexing on each query
- R3. **Memory efficiency**: Peak memory for index rebuild <100MB even with 10K notes, no N² allocations
- R4. **Link suggestion quality**: Keep TF-IDF + cluster detection, but cache results and cap at sampled pairs
- R5. **Cache fidelity**: Selective invalidation (only affected indices), not full wipe

## Scope Boundaries

- **Not included**: Semantic search (embed-search.mjs) — separate from structural performance
- **Not included**: MCP server optimization — protocol overhead is acceptable
- **Not included**: Obsidian app integration — headless-only design
- **Not included**: Query language (DSL) — keep current CLI flags
- **Out of scope**: Distributed/multi-process vaults

## Context & Research

### Relevant Code and Patterns

#### Current Performance Patterns
- **Caching model**: Two-level vault cache (with/without body), invalidates on any write
- **Search**: BM25 inverted index built once per scan, 5-min TTL cache
- **Indexing**: Full rebuild on `sync`, no incremental updates
- **Link detection**: O(n²) paired scoring with tag IDF + cluster union-find

#### Repository Conventions
- Single-file module imports (`import { func } from '../src/file.mjs'`)
- Functional commands returning plain objects
- Test framework: Node.js `node:test`
- No external dependencies (zero npm deps)

### Institutional Learnings

From completion memory:
- Registry pattern centralizes command + MCP tool sync — changes here affect both CLI and MCP
- Hook system (session-stop, daily-backfill) triggers index rebuilds — optimization must preserve hook timing
- Bridge pattern (Obsidian CLI detection) adds minimal overhead; optimization should not disrupt bridge logic

### External References

Standard performance patterns for full-text search:
- **Incremental indexing**: Only process changed files on re-sync
- **Cache invalidation**: Selective (affected indices only) instead of all-or-nothing
- **Tag/filter lookups**: Use Set or Map, not `.includes()`
- **Large document handling**: Stream or chunk, not full load

## Key Technical Decisions

1. **Incremental sync**: Track file hashes (or mtime) to detect changes; rebuild only affected note indices. Rationale: 5s→1s gain comes from skipping unchanged files (80% of vault typically stable).

2. **Set-based tag lookup**: Replace `.includes(t)` with `new Set(tags)` in pair matching. Rationale: Removes O(m) factor in O(n²×m) pair loop, gained ~20% on small vaults.

3. **Lazy body extraction**: Defer body keyword extraction to recommendation-specific path, not sync. Rationale: Many use cases don't trigger link suggestions; avoid O(n×body_len) for full scan.

4. **Cache-per-command**: Smart invalidation instead of vault-wide wipe. Rationale: Write to one note only invalidates its indices, not _tags.md rebuild for unchanged notes.

5. **Sampled link suggestions**: Cap n² at first 1000 note pairs (or configurable limit) with random sampling for larger vaults. Rationale: Link quality degrades slowly past 500 notes; cap prevents runaway O(n²).

6. **Memoized cluster detection**: Cache note→cluster map instead of rebuilding per-node. Rationale: Union-find with linear lookups is fast, but we rebuild it per scoring loop.

## Open Questions

### Resolved During Planning

- **Backwards compatibility**: Incremental sync must not break existing workflows. Solved: Use optional hash cache; if missing, fall back to full rebuild.
- **Hook timing**: session-stop triggers index rebuild. Solved: Smart invalidation still marks indices dirty; rebuild happens correctly.
- **Test impact**: Will performance tests still pass? Solved: Keep correctness tests; add new perf tests.

### Deferred to Implementation

- **Hash algorithm for change detection**: SHA-1 (mtime) vs. fast hash? Implementation will determine based on filesystem behavior.
- **Sampling strategy**: Random, LRU, or weighted by tag frequency? Implementation will benchmark.
- **Cache eviction for very large vaults**: If vault grows beyond 10K, what's the memory ceiling? Implementation will set limits.

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

### Current Bottleneck Flow

```
sync command → scanNotes (full recursion)
            → rebuildTags (O(n) — OK)
            → rebuildGraph (O(n²) with tag.includes() overhead)
                ├─ N² pair loop (105-137 lines)
                ├─ tag.includes(t) — O(m) per pair
                └─ cluster union-find + note re-lookups (O(c²))
            → write _tags.md, _graph.md → cache invalidated
            → next command re-reads vault
```

### Optimized Flow

```
sync command → detectChanges (hash index → delta list)
            → scanNotes (only changed dirs + metadata)
            → rebuildTags (selective, only for changed notes)
            → rebuildGraph (O(k²) where k = min(n, sample_limit))
                ├─ Use Set(a.tags) ∩ Set(b.tags) not O(m)
                ├─ Cache clusters map[noteId] → clusterId
                └─ defer body extraction
            → write diffs to _tags.md, _graph.md
            → selective cache invalidation
```

### Incremental Sync Pseudocode

```
// In index-manager.mjs
sync(options = {}) {
  const changes = this.vault.detectChanges();  // returns { created, modified, deleted }

  if (!changes.modified.length && !changes.deleted.length) {
    return { tags: 'cached', notes: 'cached' };  // early exit
  }

  const notes = this.vault.scanNotes();
  const tagsData = this.rebuildTags(notes, changes.modified);  // rebuild only affected
  const graphData = this.rebuildGraphIncremental(notes, changes, {
    sampleLimit: 1000,
    useCachedClusters: true
  });

  // Write only deltas
  this.vault.writeIncremental('_tags.md', tagsData.delta);
  this.vault.writeIncremental('_graph.md', graphData.delta);

  return { tags: tagsData.count, notes: graphData.count };
}
```

### Cache Invalidation Strategy

```
// Selective invalidation instead of vault.invalidateCache()
vault.invalidateNote(noteId) {
  // Only clear tags/graph cache for this note
  // Re-add to relevant tag buckets
  this.cache.tags.invalidateFor(noteId);
  this.cache.graph.invalidateFor(noteId);
  // Keep body-less scan cached
}
```

## Implementation Units

- [ ] **Unit 1: Incremental Sync with Change Detection**

**Goal:** Skip unchanged files; reduce sync time from 5s to <2s for stable vaults

**Requirements:** R1

**Dependencies:** None (foundational)

**Files:**
- Modify: `src/vault.mjs` (add `detectChanges()`, file hash cache)
- Modify: `src/index-manager.mjs` (update `sync()` to use delta)
- Create: `src/file-hasher.mjs` (mtime-based change detection)
- Test: `test/index-manager.test.mjs` (add incremental sync tests)

**Approach:**
- Add optional `.clausidian/hashes.json` cache (file path → mtime + size)
- `detectChanges()` returns `{ created, modified, deleted, unchanged }`
- `sync()` skips rebuilding unchanged note indices
- Fall back to full rebuild if hash cache missing or corrupted
- Preserve hook timing: index still marks dirty after write

**Patterns to follow:**
- Vault cache pattern from `vault.mjs:92-101`
- Registry pattern for optional features

**Test scenarios:**
- Happy path: modifying one note triggers incremental rebuild only
- Edge case: hash cache missing → falls back to full rebuild
- Edge case: file deleted → correctly removed from indices
- Error path: corrupted hash cache → detected and cleared
- Integration: hook triggers after incremental rebuild completes

**Verification:**
- `sync` on vault with 100 unchanged notes completes <500ms
- Modified note appears in updated _tags.md and _graph.md
- Hash cache written to `.clausidian/hashes.json`

---

- [ ] **Unit 2: Set-Based Tag Matching in Link Suggestions**

**Goal:** Remove O(m) factor from tag pair matching; improve link suggestion speed 2-3×

**Requirements:** R4

**Dependencies:** None (isolated optimization)

**Files:**
- Modify: `src/index-manager.mjs` (`rebuildGraph()` lines 105-137)
- Modify: `src/commands/suggest.mjs` (tag pair matching)
- Test: `test/index-manager.test.mjs` (link quality preserved)

**Approach:**
- Replace `b.tags.includes(t)` with `Set` intersection
- Build `tagSets` map: `Map<noteId, Set<string>>`
- Compute shared tags: `[...a_tags].filter(t => b_tags.has(t))`
- Keep IDF weighting unchanged; just accelerate the lookup

**Patterns to follow:**
- Set usage from `search-cache.mjs` (cache key generation)
- TF-IDF pattern from `index-manager.mjs:82-84`

**Test scenarios:**
- Happy path: two notes with 5 shared tags score correctly
- Edge case: note with no tags (empty set)
- Performance: 1000-note vault link suggestions complete <500ms
- Correctness: IDF scores identical to before optimization

**Verification:**
- Link score calculation unchanged (TF-IDF values stable)
- Benchmark: 1000-note vault pair matching <500ms (was 2-3s)

---

- [ ] **Unit 3: Lazy Body Extraction and Deferred Keyword Indexing**

**Goal:** Skip body text processing during general sync; extract only when needed for link suggestions

**Requirements:** R3

**Dependencies:** Unit 1

**Files:**
- Modify: `src/index-manager.mjs` (defer body keyword extraction)
- Modify: `src/vault.mjs` (lazy body loading)
- Create: `src/keyword-extractor.mjs` (standalone keyword extraction)
- Test: `test/index-manager.test.mjs` (keyword extraction correctness)

**Approach:**
- Remove body regex from `rebuildGraph()` (lines 86-92)
- Move keyword extraction to optional helper: `extractKeywords(note.body)`
- Call only when computing link suggestions, not during `sync`
- Cache extracted keywords in note metadata

**Patterns to follow:**
- Lazy module loading from MCP server
- Vault body caching pattern (optional include)

**Test scenarios:**
- Happy path: sync completes without loading body; suggestion call extracts keywords
- Edge case: very large note body (5MB) — extracts without OOM
- Performance: 100-note vault sync memory reduced by 30%
- Correctness: keyword extraction identical on lazy load vs. early extraction

**Verification:**
- `sync` on 500-note vault: memory peak <50MB (was >80MB)
- Keyword extraction still works in suggestions despite deferral

---

- [ ] **Unit 4: Caching and Memoization for Cluster Detection**

**Goal:** Avoid rebuilding note→cluster map per scoring loop; enable reuse across commands

**Requirements:** R4

**Dependencies:** Unit 1, Unit 2

**Files:**
- Modify: `src/index-manager.mjs` (memoize cluster results)
- Create: `src/cluster-cache.mjs` (persistent cluster map with TTL)
- Test: `test/index-manager.test.mjs` (cluster detection caching)

**Approach:**
- Build cluster map once per sync; store in `Vault` as `clustersMap`
- TTL: 1 hour or on vault write (whichever sooner)
- `getCluster(noteId)` returns cached cluster ID
- Invalidate only on modified/deleted notes

**Patterns to follow:**
- Cache TTL pattern from `search-cache.mjs:4`
- Cluster union-find from `index-manager.mjs:149-187`

**Test scenarios:**
- Happy path: multiple suggestion calls reuse cluster map
- Edge case: cluster map expires after 1 hour
- Edge case: note deleted → cluster map invalidated
- Performance: 1000-note vault cluster detection <100ms first call, <1ms cached

**Verification:**
- Cluster detection happens once per hour unless vault changes
- Second and subsequent link suggestion calls <100ms latency

---

- [ ] **Unit 5: Smart Cache Invalidation (Selective, Not All-or-Nothing)**

**Goal:** Write to one note → only its indices rebuild, not entire vault scan

**Requirements:** R5

**Dependencies:** Unit 1

**Files:**
- Modify: `src/vault.mjs` (`write()` method + cache invalidation)
- Modify: `src/index-manager.mjs` (selective rebuild paths)
- Test: `test/vault.test.mjs` (selective cache invalidation)

**Approach:**
- Replace `invalidateCache()` with `invalidateNote(noteId)`
- `invalidateNote(noteId)` clears only that note's indices
- Tags cache: remove note from all tag buckets, add updated ones
- Graph cache: mark as dirty; rebuild on next `sync`, not immediately
- Keep full rebuild as fallback if selective fails

**Patterns to follow:**
- Two-level cache from `vault.mjs:92-101`
- Delta writes from Unit 1

**Test scenarios:**
- Happy path: write one note → only _tags.md for that note recomputed
- Edge case: write affects 10 tags → all 10 updated
- Integration: hook (session-stop) writes → indices updated correctly
- Performance: write + re-sync <100ms (was 500ms+ with full invalidation)

**Verification:**
- Selective invalidation reduces write latency 5×
- No missing/stale indices after selective invalidation
- Full rebuild still works as fallback

---

- [ ] **Unit 6: Sampled Link Suggestions (Cap at N=1000 Pairs)**

**Goal:** Prevent O(n²) explosion on large vaults; degrade gracefully above 500 notes

**Requirements:** R4

**Dependencies:** Unit 2, Unit 4

**Files:**
- Modify: `src/index-manager.mjs` (`rebuildGraph()` sampling logic)
- Test: `test/index-manager.test.mjs` (sampling correctness)

**Approach:**
- If note count > 500, sample pairs instead of exhaustive n²
- Sampling: first 1000 pairs or random weighted by tag frequency
- Keep TF-IDF scoring unchanged; just select subset
- CLI flag `--suggest-limit` to override default (1000)

**Patterns to follow:**
- Limit pattern from BM25 `search(query, { limit })`
- Sampling from suggest.mjs for related note suggestions

**Test scenarios:**
- Happy path: 100-note vault uses all pairs, quality 100%
- Edge case: 5000-note vault samples 1000 pairs, quality degradation acceptable (<10%)
- Performance: 5000-note vault link generation <1s (was 30+s)
- Correctness: top suggestions still appear in sampled set

**Verification:**
- Large vault (10K notes) link suggestions complete <2s
- Sampling is deterministic (same vault → same suggestions)

---

- [ ] **Unit 7: BM25 Search Cache Optimization**

**Goal:** Reduce search latency 30%; improve cache hit rate with smarter key generation

**Requirements:** R2

**Dependencies:** None (isolated)

**Files:**
- Modify: `src/search-cache.mjs` (optimize cache key generation)
- Modify: `src/bm25.mjs` (pre-compile filter predicates)
- Test: `test/bm25.test.mjs` (search performance)

**Approach:**
- Cache key: use hash instead of JSON.stringify (faster, smaller)
- Pre-compile type/tag/status filters into predicates (avoid repeated `.includes()`)
- Expand TTL to 10 minutes (more stability)
- Cache miss → rebuild only search index, not full vault

**Patterns to follow:**
- Cache pattern from `search-cache.mjs`
- Filter pattern from BM25 `search()` method

**Test scenarios:**
- Happy path: identical queries reuse cache
- Edge case: similar but not identical queries → cache miss (correct)
- Performance: 95th percentile search <200ms with cache, <500ms without

**Verification:**
- Repeated searches are cache hits (latency <5ms)
- Search results identical whether from cache or recomputed

---

- [ ] **Unit 8: Test Suite for Performance Regressions**

**Goal:** Add benchmarks to prevent future performance degradation

**Requirements:** R1, R2, R3, R4

**Dependencies:** All optimization units

**Files:**
- Create: `test/performance.benchmark.mjs` (timing harness)
- Modify: `test/bm25.test.mjs` (add latency assertions)
- Modify: `test/index-manager.test.mjs` (add timing for sync, links)

**Approach:**
- Benchmark harness: run op N times, return min/avg/max/p95 latency
- Key benchmarks: sync (100/500/1K notes), search (100 queries), link suggestions
- Thresholds: sync <1s, search p95 <200ms, links <500ms
- CI integration: fail if any threshold exceeded

**Patterns to follow:**
- Test structure from `test/commands.test.mjs`

**Test scenarios:**
- Sync benchmark: 100, 500, 1K note vaults
- Search benchmark: simple, complex, filtered queries
- Link benchmark: small (100), medium (500), large (5K) vaults

**Verification:**
- Benchmarks run in <5s per suite
- Thresholds correspond to stated improvement goals

---

## System-Wide Impact

### Interaction Graph

- **Vault.write()** → triggers selective cache invalidation → `index-manager` rebuilds only affected indices
- **sync command** → calls `detectChanges()` → incremental rebuild triggers `smart-cache-invalidation`
- **search()** → checks `search-cache` → on miss, rebuilds BM25 + applies pre-compiled filters
- **bridgeGcal/Gmail/GitHub** → write journal notes → selective invalidation triggered
- **launchd daily-backfill** → writes journal entry → hook updates indices via selective invalidation

### Unchanged Invariants

- **MCP tool list** remains unchanged (bridge logic unaffected)
- **CLI flags** unchanged (backward-compatible)
- **Index file formats** (`_tags.md`, `_graph.md`) unchanged
- **Link quality metrics** (TF-IDF, shared tags) numerically identical

### State Lifecycle Risks

- **Hash cache corruption**: Handled via checksum + fallback to full rebuild
- **Partial sync failure**: Indices marked dirty; next sync completes correctly
- **Cluster map TTL expiry**: Safe; worst case re-compute, no data loss
- **Search cache miss storm**: Mitigated by 10-minute TTL and stable query set

## Risks & Dependencies

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Hash cache format changes | Low | Sync behavior changes | Version hash cache format; detect mismatches |
| Selective invalidation bugs | Medium | Stale indices | Comprehensive unit tests; fallback to full rebuild |
| Memory regression from caching | Low | Memory bloat on large vaults | TTL-based eviction; monitor cache size |
| Performance regression after optimization | Low | Benchmarks fail | Regression tests with thresholds |
| Breaking hook timing | Medium | Session-stop failures | Preserve hook ordering; test with bridge |

## Documentation / Operational Notes

- Update **README.md** `Performance` section with new benchmarks and tuning flags
- Add **troubleshooting** section for stale indices: `--force-sync` flag to clear caches
- Add **monitoring**: CLI flag `--verbose` to log cache hits/misses and timing
- Backward compatibility note: hash cache is optional; missing cache triggers full rebuild

## Deferred to Implementation

- **Specific hash algorithm**: mtime vs. SHA-1 vs. fast xxHash; benchmarks will determine
- **Sampling strategy details**: random vs. frequency-weighted; test both approaches
- **Memory ceiling for 10K+ vaults**: implementation will set safe limits and measure
- **Cache key hash function**: simple MD5 or faster alternatives; will benchmark

## Sources & References

- **Codebase**: `/Users/dex/YD 2026/dev/clausidian/src/`
  - Performance bottlenecks: `index-manager.mjs:71-195` (N² TF-IDF)
  - Cache patterns: `search-cache.mjs`, `vault.mjs:92-101`
  - Testing: `test/bm25.test.mjs`, `test/index-manager.test.mjs`, `test/commands.test.mjs` (sync command test)
- **Related PRs/Issues**: None yet (new optimization initiative)
- **External references**:
  - BM25 caching: Standard full-text search optimization
  - Incremental indexing: Lucene/Elasticsearch pattern
  - Selective cache invalidation: Redis/Memcached best practice
