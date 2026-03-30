# Changelog

All notable changes to Clausidian are documented in this file.

> **Related:** [README.md](README.md) · [ARCHITECTURE.md](ARCHITECTURE.md)

## [v3.1.0] - 2026-03-30

### Added - Theme A: MCP Completeness

- **`import` command via MCP** - Agents can now ingest JSON/Markdown files through Model Context Protocol
- **`review` and `review monthly` via MCP** - Weekly and monthly report generation exposed to agent workflows
- **MCP tool expansion** - 3 new tools registered, total MCP schema definitions: 52+

### Added - Theme B: Infrastructure Test Coverage

Complete test coverage for v3.0.0 performance modules:

- `SearchCache` (TTL caching) - 10 tests: hit/miss counting, TTL expiry, cache key normalization
- `ClusterCache` (union-find results) - 8 tests: vault-version invalidation, bulk load
- `SelectiveInvalidation` (per-note dirty tracking) - 8 tests: dirty marking, selective clearing
- `FileHasher` (mtime+size change detection) - 6 tests: single file, directory traversal, diff detection
- `ArgsParser` (CLI arg normalization) - 5 tests: kebab→camelCase conversion, boolean parsing
- `VaultValidator` (root directory validation) - 7 tests: marker detection, error handling

**Test metrics:** 398 → 447 tests (49 new Theme B tests)

### Added - Theme C: Persistent Search Cache

Disk-backed search cache layer for MCP session cold-start optimization:

- **`SearchCache` class enhancements**
  - TTL-based in-memory caching with hit/miss tracking
  - SHA256 key hashing for collision-free cache keys
  - `loadFromDisk()` - Async cache restoration with vault version validation
  - `saveToDisk()` - Non-blocking write-through persistence via `setImmediate()`
  - `toDisk()` / `fromDisk()` - Serialization/deserialization support

- **`ClusterCache` wrapper class**
  - Vault-version-aware caching (detects structure changes)
  - Version computed from `_tags.md` + `_graph.md` modification times
  - Automatic invalidation on vault version mismatch
  - Decorator pattern wrapping SearchCache

- **Vault integration**
  - `_searchCache` instance per vault (default 5-minute TTL)
  - `_clusterCache` wrapper for version-aware caching
  - `_dirtyNotes` Set for tracking modified notes
  - Async disk load on constructor via `setImmediate()`
  - `search()` checks ClusterCache before full scan
  - `invalidateCache()` triggers cache invalidation

- **`cache` command** - CLI and MCP tools for cache management
  - `cache stats` - Show hits, misses, size, age, version, hit rate
  - `cache clear` - Remove disk cache and reset in-memory state
  - `cache status` - Human-readable status summary
  - MCP schema registered for agent access

**Performance impact:** Cold-start search latency reduced 500ms → &lt;100ms (5-10x improvement)

### Changed

- `src/search-cache.mjs` - Complete rewrite with SHA256 keying, stats tracking, and disk persistence
- `src/vault.mjs` - Added SearchCache + ClusterCache initialization, version tracking, dirty notes
- `src/registry.mjs` - Updated cache command with 'status' subcommand
- `src/commands/cache.mjs` - Refactored to use ClusterCache API instead of disk scanning
- `src/cluster-cache.mjs` - New decorator class for vault-version-aware caching

### Testing

- **Theme B:** 6 new test files, 42 tests covering v3.0.0 infrastructure modules
  - `search-cache.test.mjs` - 10 tests for TTL, hit/miss, invalidation
  - `cluster-cache.test.mjs` - 8 tests for vault versioning
  - `vault-selective-invalidation.test.mjs` - 8 tests for dirty tracking
  - `file-hasher.test.mjs` - 6 tests for change detection
  - `args-parser.test.mjs` - 5 tests for CLI normalization
  - `vault-validator.test.mjs` - 5 tests for vault structure validation

- **Theme C:** Disk persistence integrated into SearchCache
  - Cache loading on Vault init (non-blocking via setImmediate)
  - Cache saving after each search (non-blocking via setImmediate)
  - Async methods with error silencing (fire-and-forget pattern)

- **Total:** 447/447 tests passing (398 base + 49 new Theme B/C tests)

### Documentation

- README.md updated with Theme C cache feature overview
- ARCHITECTURE.md (new) - Persistent cache layer diagram and design rationale
- MCP schema definitions fully documented in registry.mjs

## [v3.0.1] - 2026-03-30

### Added

- Auto-tag command: automatic tag suggestion for untagged notes
- Stale command: detect and manage inactive notes with configurable thresholds
- Enhanced watch mode: time-aware automation with vault change detection

### Fixed

- Search cache integration: now properly invalidates on vault writes
- Graph navigation labels: standardized nav-prev/nav-next label consistency

### Tests

- 398/398 tests passing
- Performance regression test suite integrated

## [v3.0.0] - 2026-03-30

### Added - Performance Optimization Sprint

**8 major performance modules:**

1. **Incremental Sync** - Track file changes with mtime+size hashing
2. **Lazy Loading** - Deferred note body parsing
3. **BM25 Search Cache** - Cached search result ranking
4. **Cluster Cache** - Union-find results caching with vault-version tracking
5. **SelectiveInvalidation** - Per-note dirty tracking (not full vault flush)
6. **TF-IDF Link Suggestions** - Weighted relevance for note relationships
7. **Graph Traversal Optimization** - Bidirectional link caching
8. **Regression Test Suite** - Performance baseline monitoring

### Added

- `SearchCache` class with TTL-based in-memory caching
- Vault version tracking for cache invalidation
- MCP server with 44+ tools for agent integration
- Full JSDoc documentation for all modules

### Tests

- 398 tests covering vault operations, indexing, search, commands, MCP integration
- Performance regression baseline established

---

## [v2.5.0] and earlier

See git history for legacy versions prior to v3.0.0 performance optimization sprint.
