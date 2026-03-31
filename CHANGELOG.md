# Changelog

All notable changes to this project will be documented in this file.

## [3.5.0] - 2026-03-31

### Added
- **Deep Claude Code Integration (Phase 1-4)**: Repositioned as Claude Code's Obsidian integration layer
  - **Phase 1**: Rebranding — CLI description, README, keywords prioritize Claude Code
  - **Phase 2**: Hooks + MCP Enhancement
    - `sessionStart()` hook — reads today's journal + active projects
    - `preToolUse()` hook — logs Write/Edit operations to journal
    - Enhanced `sessionStop()` — persists decisions, learnings, nextSteps
    - 3 new MCP Resources: `vault://context`, `vault://active-projects`, `vault://health`
    - 3 new MCP Prompts: session-start, project-review, knowledge-extraction
  - **Phase 3**: Vault as Claude Memory (198 LOC)
    - `memorySync()` — sync vault notes (memory:true) to ~/.claude/memory/
    - `memoryPush()` — push individual notes to Claude memory
    - `memoryStatus()` — compare vault notes vs Claude memory
    - `contextForTopic()` — search + neighbors + backlinks for topic awareness
  - **Phase 4**: CLAUDE.md Auto-management (106 LOC)
    - `generateBlock()` — idempotent vault context block generation
    - `inject()` — add vault context to global CLAUDE.md
    - `remove()` — clean up clausidian blocks

### Changed
- Radical repository restructuring: Elevated from projects/tools/clausidian/ to repository root
- Repositioned primary project identity from "workspace tool" to "Claude Code integration layer"
- Updated package.json description to emphasize Claude Code + MCP integration
- Reorganized documentation: archived legacy status docs to docs/archive/

### Infrastructure
- Complete file tracking: 489 files (bin/, src/, test/, scaffold/, skill/, docs/, references/)
- Repository cleanup: removed 300+ temporary/workspace files
- All 426 unit tests passing (18 new tests for Phase 1-4)
- GitHub workflows: CI configuration for production-ready releases
- No breaking changes. All git history preserved via git mv operations.

## [1.0.1.0] - 2026-03-31

### Added
- Clausidian v3.4.0 event bus architecture — 29 system events, universal subscription system
- Parallel query executor for Vault with pattern-based caching (B2.2)
- Event-driven automation engine with YAML-based triggers and actions
- Multi-vault workflow support with bidirectional link synchronization

### Changed
- Vault class architecture refactored to support event-driven integration
- Pattern detector algorithms optimized for larger vaults
- Connection pooling and query performance improvements

### Fixed
- JavaScript class structure corrections in Pattern Detector
- Sync and workspace state consistency improvements

### Removed
- HR_BOT_PHASE2 experimental directory (archived to projects/production/)

