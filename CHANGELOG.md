# Changelog — clausidian

All notable changes to the clausidian project are documented in this file. Format based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [2.6.0] — 2026-03-30

### Added
- **embed-search command** — Semantic search using embeddings (Ollama or OpenAI)
- **smart-search command** — BM25 ranked search (now exposed as MCP tool)
- **mcpSchema for import command** — Can now be triggered via MCP
- **mcpSchema for review command** — Can now be triggered via MCP
- **6 new scaffold slash commands** — update, sync, health, stats, tag-list, batch

### Changed
- **Performance fix**: Cache invalidation now conditional on write operations only (read-only tools skip cache clear)
- **SearchCache** wired into search path for 5-min TTL result caching
- Improved MCP configuration documentation (mcp-config-example.README.md)

### Infrastructure
- **Dockerfile** — Containerized deployment (node:18-alpine, MCP server ready)
- **CI/CD improvements** — npm caching, enforced ShellCheck failures
- Cleaned up mcp-config-example.json (removed invalid JavaScript comments)

## [2.5.1] — 2026-03-30

### Added
- **lib/common.sh** — Shared shell library (212 lines), eliminates 85 lines of duplication
- **Shell script refactoring** — All shells now use common functions
- **.editorconfig** — Unified code style across all file types
- **.prettierrc.json** — JavaScript/TypeScript formatting with 100-column width
- **.github/workflows/shell-lint.yml** — Automated ShellCheck + syntax validation
- **SCRIPT_STYLE.md** — 12-part shell scripting best practices guide
- **GitHub release v2.5.1** — npm publication at v2.5.1

### Changed
- install.sh, setup.sh, health.sh, verify.sh refactored to use lib/common.sh
- All scripts now enforce `set -o pipefail` for better error handling
- Improved logging with color-coded output across all shell scripts

### Tested
- 18-item automated test suite (100% pass rate)
- Shell syntax validation with bash -n
- GitHub Actions CI/CD matrix (3 OS × 3 Node versions = 9 jobs)
=======
## [3.0.0] — 2026-03-30

### Added
- **Utility modules** for production-ready architecture:
  - `src/vault-validator.mjs` — Vault root validation and discovery
  - `src/args-parser.mjs` — Argument parsing and flag normalization
- **Comprehensive test suite** — 50+ new tests for commands, utils, and edge cases
- **Complete documentation** — API reference, user guide, and developer guide
- **Code quality utilities** (in progress):
  - TF-IDF index extraction to unified module
  - Centralized error handling with typed exceptions
  - Frontmatter utility consolidation

### Changed
- **Performance optimization** — neighbors graph traversal: O(n²) → O(edges) (~40% faster)
- **Graph navigation** — Knowledge graph now includes nav-prev/nav-next labels for journal navigation
- **Type safety** — JSDoc annotations added to core vault operations (11 functions)
- Package version bumped to 3.0.0

### Fixed
- neighbors.mjs infinite loop prevention with explicit cycle protection
- Knowledge graph navigation labels fully integrated

### Migration Notes
- `vault-validator` replaces inline vault checks
- `args-parser` normalizes kebab-case flags to camelCase
- All existing APIs remain compatible
>>>>>>> origin/main

## [2.5.0] — 2026-03-30

### Added
- **smart-suggest command** — AI-powered context-aware recommendations
  - Analyzes tag patterns and suggests consolidation
  - Identifies co-occurring tags that should be linked
  - Flags stale notes needing attention
  - Detects orphaned notes (no inbound links)
  - Scores suggestions by importance
- **CHANGELOG.md** — Comprehensive version history
- **ARCHITECTURE.md** — Detailed module design and data flow
- **CONTRIBUTING.md** — Development guidelines and conventions
- **GitHub Actions CI/CD pipeline** — Automated testing across Node 18-22, macOS/Linux/Windows
- **JSDoc documentation** — Type hints for IDE support
- Documentation suite complete: README, ARCHITECTURE, CONTRIBUTING, CHANGELOG

### Changed
- package.json version bumped to 2.5.0
- Improved project description to include AI recommendations

### Fixed
- None (feature release)

## [Unreleased]

### Planned for v2.7.0+
- Smart template generation from vault analysis
- Incremental index updates support
- Large vault support (>10,000 files)
- Batch operation parallelization
- Performance benchmarking suite
- Pre-commit hook configuration
- Extended MCP resources (per-note URIs, live stats)
- Advanced embedding models (text-embedding-3-large, custom models)

## [2.0.0] — 2026-03-30

### Added
- **Bridge Mode** — Unified interface for managing multi-vault systems
- **Clausidian Canvas** — Mermaid diagram support for vault visualization
- **Base Queries** — Airtable-like filtering for vault notes
- Knowledge graph with nav-prev/nav-next labels
- Embed-aware search (fallback to BM25)
- Comprehensive MCP server with 44+ tools
- Agent configuration generation for Claude Code, Cursor, Copilot
- Knowledge Precipitation (A1-A5) automated rules
- Frontmatter schema validation
- Full vault health scoring (completeness, connectivity, freshness, organization)
- Support for CJK text in search and analysis
- macOS-specific features: open command, quicknote from clipboard, launchd integration

### Features
- **51 CLI Commands** covering all PARA workflow operations
- **Fuzzy note lookup** with case-insensitive matching and partial matches
- **BM25 search** with relevance scoring
- **Batch operations** (tag, update, archive)
- **Smart linking** with duplicate detection and relationship inference
- **Activity timeline** with date-based filtering
- **Vault validation** with comprehensive health checks
- **Auto-linking** with threshold-based suggestion
- **Tag management** with rename across vault
- **Note merging** with automatic reference updates

## [1.5.0]

### Added
- Obsidian Airtable-like base query support
- Mermaid canvas integration
- Extended MCP tool support

## [1.1.0]

### Added
- Registry-based command dispatch system
- Improved error handling and command suggestion via Levenshtein distance

## [1.0.0] — Initial Release

### Added
- Core CLI toolkit for Obsidian vault management
- PARA-based vault structure
- Journal, project, resource, area, and idea note types
- Template system with variable substitution
- Full-text search across vault
- Knowledge graph generation
- Index management (tags, backlinks)
- Note mutation commands (rename, move, merge, delete)
- Batch operations
- Vault statistics and health check
- Zero-dependency Node.js implementation
- Full MCP server support for AI agents

---

## Version Strategy

- **Major** — Breaking API changes, structural refactors
- **Minor** — New features, backwards-compatible additions (v2.5.0, v3.0.0)
- **Patch** — Bug fixes, performance tweaks (v2.0.1, v2.0.2)

Current target: **v2.5.0** (Q2 2026) — Feature expansion with performance optimization
