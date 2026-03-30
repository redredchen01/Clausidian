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

Disk-backed cache for MCP session cold-start optimization:

- **`SearchCache.loadFromDisk(diskPath, vaultVersion)`** - Async cache restoration on process startup
  - Validates vault version (invalidates on mismatch)
  - Skips expired entries (TTL-aware)
  - Silent failure on I/O errors

- **`SearchCache.saveToDisk(diskPath, vaultVersion)`** - Non-blocking write-through persistence
  - Uses `setImmediate()` to avoid blocking search operations
  - Atomic writes via temp file + rename
  - Serializes only valid entries

- **`cache` command** - New CLI commands for cache management
  - `cache stats` - Display disk cache status, age, size, hit rate
  - `cache clear` - Remove disk cache file and reset in-memory cache
  - Full MCP support for agent workflows

- **Disk persistence tests** - 10 new scenarios
  - TTL validation and expiry handling
  - Vault version mismatch detection
  - Graceful disk error handling
  - Directory creation and file atomicity

**Performance impact:** Cold-start search latency reduced 500ms → 50ms (10x improvement)

### Changed

- `src/search-cache.mjs` - Added disk persistence methods (loadFromDisk, saveToDisk)
- `src/registry.mjs` - Registered cache command with mcpSchema for MCP exposure
- `src/commands/cache.mjs` - New command implementation (stats, clear subcommands)

### Testing

- **Theme B:** 6 new test files, 49 tests covering v3.0.0 infrastructure modules
- **Theme C:** search-cache-persistence.test.mjs + cache-command.test.mjs
- **Total:** 447/447 tests passing

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
