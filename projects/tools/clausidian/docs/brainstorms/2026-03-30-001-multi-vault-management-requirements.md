---
date: 2026-03-30
topic: multi-vault-management
---

# Clausidian v3.2.0: Multi-Vault Management Requirements

## Problem Frame

Clausidian currently manages a single Obsidian vault at a time via the `OA_VAULT` environment variable or vault root detection. AI agents need to simultaneously manage multiple knowledge bases (team KB, personal notes, project vault) within a single CLI session without switching contexts or environment variables between commands. Current single-vault design forces either sequential vault switching (poor UX) or launching separate CLI processes per vault (high overhead for agent workflows).

## Requirements

**Vault Registry & Discovery (R1–R5)**

- R1. Maintain a global persistent vault registry at `$HOME/.clausidian/vaults.json` listing all known vaults with name, path, and default marker
- R2. CLI can query registry: `clausidian vault list` returns all registered vaults
- R3. CLI can set default vault: `clausidian vault default <name>` updates registry default marker
- R4. CLI can register new vault: `clausidian vault register <name> <path>` adds to registry
- R5. On first use, registry auto-initializes if missing; graceful fallback if unreadable

**Command API Changes (R6–R9)**

- R6. All vault-targeting commands accept `--vault=<name>` flag: `clausidian search --vault=team-kb keyword`
- R7. `--vault` flag takes precedence: (1) explicit --vault flag, (2) OA_VAULT env var, (3) registry default, (4) error
- R8. Commands output includes vault identifier field (e.g., `"vault": "team-kb"`) for agent consumption
- R9. Help/usage text clarifies per-command vault scoping: "Search within [--vault] or OA_VAULT, default to registry default"

**Backward Compatibility (R10–R13)**

- R10. When neither `--vault` flag nor `OA_VAULT` env var is set, use registry default if available; if no default, error with clear message
- R11. If registry is missing/unreadable, fall back to `OA_VAULT` environment variable (no automatic migration from env to registry)
- R12. Single-vault workflows (legacy) continue to work: `OA_VAULT=/path/to/vault claudian search keyword` (no registry required)
- R13. Existing scripts and CI/CD using `OA_VAULT` continue working without modification

**Configuration Isolation (R14–R16)**

- R14. Each vault has isolated cache: `.clausidian/cache.json` is vault-local, not shared across vaults
- R15. Each vault has isolated config: `.clausidian/config.json` is vault-local; no cross-vault config merging
- R16. No cross-vault query results or cache collisions: searching team-kb does not return personal-vault results

## Success Criteria (v3.2.0 CLI-First Scope)

- v3.2.0 target: `clausidian search --vault=team-kb keyword` works; output includes vault field; backward compatibility verified
- `clausidian vault list` returns registry contents; `vault register` / `vault default` modify registry durably
- `OA_VAULT` env var continues to work as fallback; single-vault workflows unbroken
- Error messages clearly indicate which vault failed and why
- Precedence order (--vault > OA_VAULT > registry default) consistently applied across all commands
- MCP server session-level vault support explicitly deferred to v3.3.0+ (MCPServer architectural redesign required)

## Scope Boundaries

**v3.2.0 Focus: CLI multi-vault support with backward compatibility**
- Registry at `$HOME/.clausidian/vaults.json` (global persistent state)
- `--vault` flag pattern across all vault-targeting commands
- Per-vault isolation of cache and config
- OA_VAULT legacy support and precedence order
- Clear error messaging for missing or unregistered vaults

**Explicitly Deferred to v3.3.0+:**
- MCP server multi-vault session support (requires MCPServer architectural redesign; current design creates single Vault instance at init)
- Batch operations across multiple vaults
- Vault sync and discovery across network
- Encrypted vault support
- Import/export vault migration tools
- Web UI or GUI for vault management

**Non-Goals:**
- Automatic migration from environment variables to registry
- Vault encryption or security hardening
- Cross-vault deduplication or link following
- Template or scaffold inheritance across vaults

## Key Decisions

**Registry Location: `$HOME/.clausidian/vaults.json`**
- Rationale: Global persistent registry adds I/O overhead; session-scoped discovery (env var) considered but rejected to match git-like UX where `git remote add` persists across all repos
- Schema: `{ "vaults": [{ "name": string, "path": string, "default": boolean }] }`
- Vault validation: CLI validates path exists; graceful error if not

**Command API: `--vault=<name>` Flag Pattern**
- Rationale: Inline flag is more readable than subcommands (`vault search ...`), fits agent consumption patterns
- Applies to all commands operating on notes: search, note, journal, index, watch, etc.
- Non-applicable: commands with no vault scope (e.g., `cache clear`, `version`)

**Vault Isolation: Per-Vault Cache & Config**
- Rationale: Isolation prevents cross-vault cache collisions; each vault's `.clausidian/` tree is independent
- Implementation detail deferred to planning: whether to pass vault path as parameter, working-directory context, or cache key prefix

**OA_VAULT Precedence Order (Explicit)**
1. `--vault` flag (most explicit)
2. `OA_VAULT` environment variable (legacy support)
3. Registry default (persistent fallback)
4. Error: "No vault selected. Provide --vault flag, set OA_VAULT, or run 'clausidian vault default <name>'"
- Rationale: Respects existing single-vault scripts while enabling new multi-vault workflows; explicit precedence prevents confusion

**MCP v3.2.0 out of scope; v3.3.0 target for multi-vault MCP session support**
- Current MCPServer creates single Vault instance at init
- Refactoring to vault-pool would delay v3.2.0 by 2-3 days
- v3.3.0 will redesign MCPServer to load vault registry + resolve vault name to path per request
- v3.2.0 CLI will be fully multi-vault; MCP will remain single-vault per session until v3.3.0

## Outstanding Questions

### Resolved (Explicit Decisions Made)

- **MCP multi-vault session support** → Deferred to v3.3.0; CLI-first approach for v3.2.0
- **OA_VAULT precedence** → Explicit order documented: --vault > OA_VAULT > registry default > error
- **Cross-vault output attribution** → Each result includes "vault" field for agent clarity

### Planning Inputs (Decisions to Make During Implementation)

- **Vault isolation enforcement mechanism** → Parameter-passing vs working-directory context vs cache key prefixing? (affects SearchCache, ClusterCache updates)
- **Registry in-memory caching strategy** → Load entire registry once at CLI startup vs lazy-load per command? (affects startup latency vs registry freshness)
- **Error taxonomy** → Which vault errors are CLI-level (registry not found, no default set) vs command-level (vault path doesn't exist)?
- **Vault health indicators** → Should `vault list` show cache age, last-sync timestamp, or other diagnostic info?

### Deferred to v3.3.0+

- MCPServer architectural redesign for multi-vault sessions
- Batch operations across multiple vaults
- Vault discovery and sync

## Next Steps

→ `/ce:plan` for structured implementation planning
