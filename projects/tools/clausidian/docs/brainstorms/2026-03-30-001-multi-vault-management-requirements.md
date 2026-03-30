---
date: 2026-03-30
topic: multi-vault-management
---

# Clausidian v3.2.0: Multi-Vault Management

## Problem Frame

Currently, Clausidian operates on a single vault at a time, determined by:
- `OA_VAULT` environment variable
- `.clausidian.json` file in vault root
- Explicit `--vault-root` flag

This limits AI agents to managing one knowledge base per process. Modern workflows require simultaneous access to multiple isolated vaults:
- **Team vault** (shared knowledge)
- **Personal vault** (private notes)
- **Project vaults** (per-project focus areas)

A single MCP session serving all three requires vault-aware commands that know which vault to operate on, without breaking existing single-vault workflows.

## Requirements

**Vault Registry & Discovery**
- R1. Global vault registry stored at `$HOME/.clausidian/vaults.json` with schema: `{ "vaults": [{ "name": string, "path": string, "default": boolean }] }`
- R2. `clausidian vault list` command enumerates all registered vaults
- R3. `clausidian vault add <name> <path>` registers a new vault with validation (must contain `.clausidian.json`)
- R4. `clausidian vault remove <name>` unregisters a vault (no file deletion)
- R5. `clausidian vault default <name>` sets the default vault for commands without explicit `--vault` flag

**Command API Changes**
- R6. All existing commands accept optional `--vault=<name>` flag to specify which vault to operate on
- R7. If `--vault` is omitted, use the default vault from registry (or fall back to `OA_VAULT` if no default set and registry missing)
- R8. MCP tool parameters include optional `vault` field that maps to `--vault` flag
- R9. Error messaging is clear when vault not found in registry: "Vault 'team-kb' not registered. Run: clausidian vault list"

**Backward Compatibility**
- R10. Single-vault workflows remain unchanged: `clausidian search keyword` still works when `OA_VAULT` is set or `.clausidian.json` exists
- R11. `OA_VAULT` environment variable takes precedence as "default" vault if no registry is configured
- R12. Existing scripts using `OA_VAULT=<path> clausidian <command>` continue to work without modification
- R13. No automatic migration: users explicitly register vaults via `clausidian vault add`

**Configuration Isolation**
- R14. Each vault maintains its own `.clausidian/cache.json` (no cross-vault cache pollution)
- R15. Each vault maintains its own `.clausidian/config.json` (vault-specific settings if added in future)
- R16. Indices (_tags.md, _graph.md, type/_index.md) are not shared across vaults

## Success Criteria

1. Single MCP session can list, search, and modify notes across 3+ registered vaults
2. `clausidian search --vault=team-kb meeting` returns results only from team vault
3. `clausidian vault list` shows registered vaults with paths and default status
4. Existing single-vault users see no breaking changes
5. Clear error messages guide users to register vaults
6. Vault registry is human-readable JSON for manual editing if needed

## Scope Boundaries

**Excluded from v3.2.0:**
- Batch operations across multiple vaults (deferred to v3.3.0)
- Vault synchronization or replication (out of scope)
- Encrypted vault support or credential management
- Vault import/export via registry (manual file management only)
- Web UI for vault management (CLI-only)

## Key Decisions

- **Registry location**: `$HOME/.clausidian/vaults.json` (similar to git config --global)
  - Rationale: Centralized, user-specific, not tied to any single vault

- **API design**: `--vault=<name>` flag on all commands
  - Rationale: Consistent with existing flag patterns; explicit; works naturally with MCP tools

- **Backward compatibility**: OA_VAULT as fallback, no auto-migration
  - Rationale: Minimal disruption; users opt-in to multi-vault by registering; existing scripts work as-is

- **No cross-vault caching**: Each vault isolated
  - Rationale: Prevents subtle bugs from cache key collisions; aligns with vault isolation principle

## Dependencies / Assumptions

- Vaults are independent Obsidian structures with separate `.clausidian.json` markers
- Vault paths are absolute (no relative path resolution)
- No circular dependencies or vault nesting expected
- User has filesystem access to all registered vaults

## Outstanding Questions

### Resolve Before Planning

None. Brainstorm decisions are complete.

### Deferred to Planning

- [Technical] Optimal in-memory caching strategy for vault registry (load once, watch for changes?)
- [Technical] Error handling for missing or broken vault paths
- [Needs research] Should `vault list` also show vault health (index freshness, file count)?

## Next Steps

→ `/ce:plan` for structured implementation planning
