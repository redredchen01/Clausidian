---
title: P3 — SearchCache Integration & Code Optimization
type: feat
status: active
created: 2026-03-30
updated: 2026-03-30
---

# P3 — SearchCache Integration & Code Optimization

> **狀態：** active · **相關文檔：** [v3.1.0 MVP 計劃](2026-03-30-001-feat-clausidian-v3-1-0-mvp-plan.md) · [P3 代碼整合分析](2026-03-30-P3-CONSOLIDATION-ANALYSIS.md) ✅ · [測試場景摘要](../TEST-SCENARIOS-SUMMARY.md) · [ARCHITECTURE.md](../../ARCHITECTURE.md)

## Problem

- Search results are not cached, causing repeated searches to re-scan all notes
- SearchCache exists but is unused in the codebase
- Some evaluation logic duplicated between index-manager.mjs and vault.mjs (TF-IDF scoring)

## Success Criteria

- Search command uses SearchCache for repeated queries
- Cache hit rate improves subsequent searches by >50%
- All 124 tests still pass
- No behavioral changes to search results

## Implementation Units

### Unit 1: SearchCache Integration into search.mjs
**Goal**: Wire up SearchCache to the search command so repeated searches hit the cache.

**Files**:
- `src/commands/search.mjs` (modify)
- `src/search-cache.mjs` (already exists, no changes needed)
- `test/vault.test.mjs` (update cache tests if needed)

**Approach**:
1. Import SearchCache at top of search.mjs
2. Instantiate a cache singleton (or pass from vault context)
3. Check cache before calling vault.search()
4. Store results in cache with TTL
5. Return cached results on hit

**Patterns to follow**:
- See how commands instantiate utilities in other commands (e.g., `commands/note.mjs`)
- SearchCache API is already defined in `src/search-cache.mjs` (get/set/clear)

**Test scenarios**:
- ✅ Repeated search with same keyword returns cached result
- ✅ Different keyword filters bypass cache (new key)
- ✅ Cache hits are counted (stats() shows hit count)
- ✅ Cache respects TTL expiry

**Verification**:
- npm test passes
- Manual test: `clausidian search "test" && clausidian search "test"` (second should be faster)

### Unit 2: Code Simplification Review
**Goal**: Identify and document opportunities for code reuse between index-manager.mjs and vault.mjs.

**Files**:
- `src/index-manager.mjs` (read)
- `src/vault.mjs` (read)

**Approach**:
1. Compare TF-IDF scoring logic in both files
2. Note that both use `Math.round(score * 10) / 10` — already consistent ✅
3. Identify if tag overlap calculation is duplicated
4. Document findings without implementing changes (deferred to v3.0.4)

**Verification**:
- Create summary of duplications found
- Link to specific line numbers
- Note if changes are low-risk or require refactoring

### Unit 3: Error Handling Audit (Optional)
**Goal**: Light audit of edge cases in search and sync.

**Scope**: Search errors only (not full vault error handling)

**Approach**:
1. Review search.mjs and vault.search() for error paths
2. Check if regex errors are caught properly
3. Note any missing null/empty guards

**Verification**:
- Document findings
- Defer implementation to v3.0.4 if needed

---

## Notes

- TF-IDF rounding is already consistent across both files ✅
- SearchCache already exists and is tested, just needs integration
- Unit 1 is the main deliverable; Units 2-3 are analysis/documentation only

## Execution Notes

- Implement Unit 1 with tests
- Complete Units 2-3 as documentation only (defer actual refactoring)
- Goal: Get SearchCache working in search command, validate with tests, deliver v3.0.3 with cache benefit

