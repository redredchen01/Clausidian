# Changelog — clausidian

All notable changes to the clausidian project are documented in this file. Format based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

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

### Planned for v2.6.0+
- Smart template generation from vault analysis
- Search result caching for improved performance
- Incremental index updates support
- Large vault support (>10,000 files)
- Batch operation parallelization
- Performance benchmarking suite
- Pre-commit hook configuration

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
