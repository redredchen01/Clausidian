---
date: 2026-03-30
title: "Clausidian v3.2.0 Multi-Vault CLI Management - Implementation Plan"
version: "3.2.0"
status: "Ready for Implementation"
scope: "CLI-only; MCP deferred to v3.3.0"
---

# Clausidian v3.2.0: Multi-Vault CLI Management - Implementation Plan

## Executive Summary

This plan implements multi-vault support in Clausidian v3.2.0 CLI while maintaining 100% backward compatibility with existing single-vault workflows. The implementation adds a global vault registry (`$HOME/.clausidian/vaults.json`), introduces `--vault=<name>` flag support across all vault-targeting commands, enforces strict vault isolation (separate cache/config per vault), and establishes a clear vault resolution precedence order: `--vault flag > OA_VAULT env > registry default > error`.

**Key Constraints:**
- v3.2.0 is CLI-only; MCP multi-vault support deferred to v3.3.0
- All existing single-vault workflows must continue working without modification
- Cache/config isolation must be enforced at per-vault level
- 10+ test scenarios per implementation unit

---

## Architecture Overview

### Vault Resolution Flow

```
┌─────────────────────────────────────────────────────────────┐
│  CLI Input: clausidian search --vault=team-kb keyword       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Step 1: Parse CLI flags & environment                     │
│  ├─ Extract --vault flag from args                         │
│  └─ Read OA_VAULT env var (if set)                         │
│                                                             │
│  Step 2: Load vault registry                               │
│  ├─ $HOME/.clausidian/vaults.json                         │
│  ├─ Handle missing/corrupted registry gracefully           │
│  └─ Extract default vault (if marked)                      │
│                                                             │
│  Step 3: Apply precedence order                            │
│  1. --vault flag (explicit)                                │
│  2. OA_VAULT env var (legacy)                              │
│  3. Registry default (new)                                 │
│  4. Error: "No vault selected..." (clear message)          │
│                                                             │
│  Step 4: Resolve vault name to path                        │
│  ├─ Lookup vault name in registry                          │
│  ├─ Validate path exists and is readable                   │
│  └─ Error if not found or path invalid                     │
│                                                             │
│  Step 5: Attach vault context to Vault instance            │
│  ├─ Pass vaultName to Vault constructor                    │
│  ├─ Initialize per-vault cache (vaultName prefix)          │
│  └─ Initialize per-vault config isolation                  │
│                                                             │
│  Step 6: Execute command with vault context                │
│  └─ Return results with "vault" field for agent clarity    │
└─────────────────────────────────────────────────────────────┘
```

### Multi-Vault Cache & Config Isolation

```
$HOME/.clausidian/
├── vaults.json                          # Global registry
└── (per-vault isolation)

vault1-root/.clausidian/
├── cache.json                           # Vault1 cache (prefix: vault1|...)
├── config.json                          # Vault1 config (isolated)
└── cluster-cache.json                   # Vault1 cluster cache

vault2-root/.clausidian/
├── cache.json                           # Vault2 cache (prefix: vault2|...)
├── config.json                          # Vault2 config (isolated)
└── cluster-cache.json                   # Vault2 cluster cache
```

**Key Principle:** Cache keys are prefixed with vault name: `${vaultName}|${keyword}|${type}|...`
This prevents cache collisions across vaults.

---

## Implementation Units (I1-I8)

### I1: Vault Registry Management (`src/vault-registry.mjs`)

**Scope:** Load, save, validate, and manage the global vault registry.

**Responsibilities:**
- Load registry from `$HOME/.clausidian/vaults.json`
- Initialize registry on first use (auto-create file)
- Add new vault (register)
- Set default vault
- List all vaults
- Validate vault entries (path exists, readable)
- Handle corrupted/missing registry gracefully

**Exports:**
```javascript
export class VaultRegistry {
  static load()                          // Load from disk or empty
  save()                                 // Write to disk atomically
  list()                                 // Return all vaults
  find(name)                             // Find vault by name
  add(name, path, isDefault=false)       // Register new vault
  setDefault(name)                       // Mark as default
  getDefault()                           // Get default vault entry
  validate()                             // Check all paths exist
  validatePath(path)                     // Check single path
}
```

**Error Handling (E1-E4):**
- E1: Registry file corrupted → log warning, return empty registry, fall back to OA_VAULT
- E2: Vault path doesn't exist → error with suggestion to re-register or check path
- E3: No default vault set & no --vault flag → clear error message
- E4: Vault name not found in registry → error listing available vaults

**Data Structure (Schema):**
```json
{
  "vaults": [
    {
      "name": "team-kb",
      "path": "/Users/dex/Obsidian/team",
      "default": true
    },
    {
      "name": "personal",
      "path": "/Users/dex/Obsidian/personal",
      "default": false
    }
  ]
}
```

**Test Scenarios (I1-TS01 through I1-TS12):**

| ID | Scenario | Input | Expected Output |
|----|----------|-------|-----------------|
| I1-TS01 | Load empty registry | missing file | Empty registry created |
| I1-TS02 | Load existing registry | valid JSON | All vaults loaded |
| I1-TS03 | Corrupted JSON | invalid JSON | Warning logged, fallback enabled |
| I1-TS04 | Register new vault | name, path | Vault added, saved to disk |
| I1-TS05 | Register duplicate | existing name | Error: "Vault already exists" |
| I1-TS06 | Set default vault | vault name | Marked as default, saved |
| I1-TS07 | List vaults | - | All vaults printed with default marker |
| I1-TS08 | Validate all paths | - | Report missing paths |
| I1-TS09 | Get default when set | - | Return default vault entry |
| I1-TS10 | Get default when unset | - | Return null |
| I1-TS11 | Find vault by name | "team-kb" | Return vault entry |
| I1-TS12 | Find vault not in registry | "nonexistent" | Return null, no error |

---

### I2: Vault Resolution & Precedence (`src/vault-resolver.mjs`)

**Scope:** Implement vault resolution precedence order and path lookup.

**Responsibilities:**
- Apply precedence: --vault flag > OA_VAULT env > registry default
- Validate vault name/path exists
- Return resolved vault path for command execution
- Provide clear error messages for all failure paths

**Exports:**
```javascript
export async function resolveVault(flags, registryPath = null) {
  // Returns { name, path } or throws with clear error
}

export function validateVaultPath(path) {
  // Throws if path doesn't exist or isn't readable
}

export async function getVaultContext(flags) {
  // Returns { name, path, registry, isFromFlag, isFromEnv, isFromDefault }
  // Useful for debugging/logging which resolution path was used
}
```

**Error Messages (E1-E4 Handling):**

```
E1: Registry corrupted (syntax error)
  "Warning: ~/.clausidian/vaults.json is corrupted. Falling back to OA_VAULT."

E2: Vault path doesn't exist
  "Error: Vault 'team-kb' points to /nonexistent/path which doesn't exist.
   Try: clausidian vault register team-kb /new/path"

E3: No vault selected
  "Error: No vault selected. Provide one of:
   1. --vault=<name> flag (available: team-kb, personal)
   2. Set OA_VAULT=/path/to/vault environment variable
   3. Run 'clausidian vault default team-kb'"

E4: Vault name not found
  "Error: Vault 'xyz' not found in registry.
   Available vaults: team-kb, personal
   Register new vault: clausidian vault register xyz /path"
```

**Test Scenarios (I2-TS01 through I2-TS13):**

| ID | Scenario | Flags | Env | Registry | Expected |
|----|----------|-------|-----|----------|----------|
| I2-TS01 | --vault flag present | {vault: "team-kb"} | - | exists | team-kb used |
| I2-TS02 | --vault takes precedence | {vault: "team-kb"} | OA_VAULT=/x | exists | team-kb used (flag wins) |
| I2-TS03 | OA_VAULT fallback | {} | /valid/path | exists | /valid/path used |
| I2-TS04 | Registry default | {} | - | default set | default vault used |
| I2-TS05 | Registry default + OA_VAULT | {} | /valid/path | default set | OA_VAULT wins over default |
| I2-TS06 | No vault, all empty | {} | - | no default | Error E3 |
| I2-TS07 | Vault name not found | {vault: "xyz"} | - | exists | Error E4 |
| I2-TS08 | Vault path doesn't exist | {vault: "broken"} | - | path missing | Error E2 |
| I2-TS09 | Registry corrupted, fallback to env | {} | /valid/path | corrupted | OA_VAULT used (E1) |
| I2-TS10 | Registry missing, env present | {} | /valid/path | missing | OA_VAULT used |
| I2-TS11 | Validate path readable | {vault: "team-kb"} | - | exists | Path validated |
| I2-TS12 | Path exists but not readable | {vault: "team-kb"} | - | no perms | Error (permission denied) |
| I2-TS13 | --vault=default syntax | {vault: "default"} | - | exists | Treated as vault name, not registry default |

---

### I3: Vault-Aware CLI Entry Point (`bin/cli.mjs` refactor)

**Scope:** Integrate vault resolution into CLI dispatcher.

**Changes:**
- Update `parseFlags()` to extract `--vault` flag (before/after positional args)
- Replace simple `resolveVault(flags)` with full vault resolution pipeline
- Attach vault name to result objects for agent consumption
- Pass vaultName to command handlers

**Key Changes in Flow:**

```javascript
// Old: resolveVault(flags) → string path
function resolveVault(flags) {
  return flags.vault || process.env.OA_VAULT || process.cwd();
}

// New: resolveVault(flags) → { name, path }
async function resolveVault(flags) {
  const { resolveVault } = await import('../src/vault-resolver.mjs');
  return resolveVault(flags);
}

// In main(), attach vault context:
const vaultContext = await resolveVault(flags);
// Pass vaultContext to subcommand/command handlers
```

**Test Scenarios (I3-TS01 through I3-TS10):**

| ID | Scenario | Command | Flags | Expected |
|----|----------|---------|-------|----------|
| I3-TS01 | Help text | help | - | No vault required |
| I3-TS02 | Version | version | - | No vault required |
| I3-TS03 | Search with --vault | search --vault=team-kb | keyword | Vault resolved, used |
| I3-TS04 | Search without --vault | search | keyword | Uses OA_VAULT or default |
| I3-TS05 | Journal with --vault | journal --vault=personal | - | Personal vault used |
| I3-TS06 | --vault as last flag | search keyword --vault=team | - | Parsed correctly |
| I3-TS07 | --vault=value syntax | search --vault=team keyword | - | Parsed correctly |
| I3-TS08 | Multiple vaults in single session | search --vault=v1 && search --vault=v2 | - | Both commands isolated |
| I3-TS09 | Unknown vault name | search --vault=xyz | keyword | Clear error E4 |
| I3-TS10 | JSON output includes vault | search --vault=team --json | keyword | Result: {vault: "team", ...} |

---

### I4: Vault-Aware Command Handlers (`src/commands/*.mjs` pattern)

**Scope:** Update command implementations to accept vaultName and include it in output.

**Changes Required for All Vault-Targeting Commands:**
- Add `vaultName` parameter to function signature
- Update Vault instantiation to pass vaultName
- Include `vault` field in returned JSON output
- Update help/usage text

**Affected Commands (Partial List):**
- search, list, recent
- note, journal, capture
- read, patch, delete, archive, merge
- index, watch, focus, agenda
- backlinks, duplicates, graph, broken-links

**Example Refactor (search.mjs):**

```javascript
// Old signature:
export function search(vaultRoot, keyword, options)

// New signature:
export function search(vaultRoot, keyword, options, vaultName = null)

// In implementation:
const vault = new Vault(vaultRoot, { vaultName, searchCache });

// Return format:
return {
  vault: vaultName || 'default',
  results: [...],
  count: results.length,
}
```

**Help Text Update Example:**

```
search <keyword> [--vault VAULT] [--type TYPE] [--tag TAG] [--regex]

Search within [--vault] vault (defaults to OA_VAULT or registry default).
Available vaults: team-kb, personal
```

**Test Scenarios (I4-TS01 through I4-TS12):**

| ID | Scenario | Command | Expected |
|----|----------|---------|----------|
| I4-TS01 | Search includes vault field | search --vault=team keyword | output: {vault: "team", ...} |
| I4-TS02 | Note created with vault name | note "Title" project --vault=team | Creates in team vault, not personal |
| I4-TS03 | Journal in specific vault | journal --vault=personal | Creates in personal/.clausidian/journal |
| I4-TS04 | List shows vault context | list --vault=team | All results tagged with vault: "team" |
| I4-TS05 | Read works with vault | read "Note" --vault=team | Reads from team vault |
| I4-TS06 | Delete confirms vault | delete "Note" --vault=team | "Deleted from team vault" message |
| I4-TS07 | Cache scoped by vault | search --vault=v1 x; search --vault=v2 x | Different cache entries |
| I4-TS08 | No --vault uses default | search keyword | Uses registry default or OA_VAULT |
| I4-TS09 | Help text mentions vault | help search | Shows [--vault VAULT] option |
| I4-TS10 | JSON mode includes vault | search --vault=team --json x | JSON includes vault field |
| I4-TS11 | Multiple notes same name | note "X" project --vault=v1; note "X" project --vault=v2 | Two separate files |
| I4-TS12 | Backward compat: OA_VAULT still works | OA_VAULT=/path search x | No --vault flag, still works |

---

### I5: Cache Key Prefixing (`src/search-cache.mjs` refactor)

**Scope:** Enforce vault isolation in cache layer using vault name prefixes.

**Current Cache Key:**
```
${keyword}|${type}|${tag}|${status}|${regex}
```

**New Cache Key (with Vault Prefix):**
```
${vaultName}|${keyword}|${type}|${tag}|${status}|${regex}
```

**Example:**
```
team-kb|python|project||||  → team vault search for "python" filtered by "project"
personal||||||                → personal vault search for "" with no filters
```

**Changes in SearchCache:**

```javascript
// Old: _getCacheKey(keyword, options)
_getCacheKey(keyword, options = {}) {
  const { type, tag, status, regex } = options;
  return `${keyword}|${type || ''}|${tag || ''}|${status || ''}|${regex ? 'regex' : ''}`;
}

// New: _getCacheKey(keyword, options, vaultName)
_getCacheKey(keyword, options = {}, vaultName = null) {
  const { type, tag, status, regex } = options;
  const prefix = vaultName ? `${vaultName}|` : '';
  return `${prefix}${keyword}|${type || ''}|${tag || ''}|${status || ''}|${regex ? 'regex' : ''}`;
}
```

**Impact on Vault Class:**

```javascript
// Vault constructor now receives vaultName
constructor(root, { vaultName = null, searchCache = null } = {})

// Cache methods pass vaultName
search(keyword, options) {
  const cacheResult = this.searchCache?.get(keyword, options, this.vaultName);
  // ...
  this.searchCache?.set(keyword, options, results, this.vaultName);
}
```

**Test Scenarios (I5-TS01 through I5-TS10):**

| ID | Scenario | Vault1 | Vault2 | Expected |
|----|----------|--------|--------|----------|
| I5-TS01 | Same search, different vaults | search "x" in v1 | search "x" in v2 | Different cache entries |
| I5-TS02 | Cache hit within vault | search "x" twice in v1 | - | Second search hits cache |
| I5-TS03 | Cache miss across vaults | search "x" in v1 | search "x" in v2 | No cross-vault collision |
| I5-TS04 | No vault name prefix | vaultName=null | - | Key: keyword\|... (backward compat) |
| I5-TS05 | Disk cache per vault | Save cache for v1 | Load cache for v2 | Separate files respected |
| I5-TS06 | Cache invalidation scoped | Write to v1 | v2 cache unchanged | Only v1 cache invalidated |
| I5-TS07 | Cache stats per vault | Stats for v1 | Stats for v2 | Separate hit/miss counts |
| I5-TS08 | Partial vault name | vaultName="team" | - | Prefix: team\|... |
| I5-TS09 | Special chars in vault name | vaultName="team-kb" | - | Prefix: team-kb\|... (no escaping needed) |
| I5-TS10 | Legacy single vault mode | OA_VAULT path, no vaultName | - | Works as before |

---

### I6: Config Isolation (`src/vault.mjs` refactor)

**Scope:** Ensure each vault's `.clausidian/` directory is independent.

**Current Structure:**
- `.clausidian/cache.json` - shared SearchCache disk storage
- `.clausidian/config.json` - vault local settings (PARA dirs, etc.)
- `.clausidian.json` - vault root level config

**Isolation Requirements:**
- Never merge configs across vaults
- Each vault reads only its own `.clausidian/` files
- No cross-vault lookups or fallbacks
- Error if vault doesn't have its own config

**Vault Constructor Changes:**

```javascript
constructor(root, { dirs, vaultName = null, searchCache = null } = {}) {
  this.root = resolve(root);
  this.vaultName = vaultName;  // NEW
  this.dirs = dirs || this._detectDirs() || DEFAULT_DIRS;
  this._notesCache = null;
  this._notesCacheWithBody = null;
  this.searchCache = searchCache;
}

_detectDirs() {
  const configPath = this.path('.clausidian.json');
  if (existsSync(configPath)) {
    try {
      const config = JSON.parse(readFileSync(configPath, 'utf8'));
      if (Array.isArray(config.dirs)) return config.dirs;
    } catch { /* ignore */ }
  }
  // NEVER fall back to another vault's config
  return null;
}
```

**Test Scenarios (I6-TS01 through I6-TS10):**

| ID | Scenario | Vault1 Config | Vault2 Config | Expected |
|----|----------|---------------|---------------|----------|
| I6-TS01 | Different PARA dirs | areas,projects | projects,research | Each vault respects own dirs |
| I6-TS02 | Config file missing | missing | has config | v1 uses default, v2 uses config |
| I6-TS03 | Corrupted config | corrupted JSON | valid | v1 error, v2 works |
| I6-TS04 | No cross-vault fallback | missing | valid | v1 doesn't read v2's config |
| I6-TS05 | Cache file isolation | cache.json exists | cache.json exists | Separate disk files |
| I6-TS06 | Init vault creates config | Running init | - | .clausidian.json created |
| I6-TS07 | Vault detects dirs | Config lists dirs | - | Those dirs auto-detected |
| I6-TS08 | No shared state | Cache dirs in v1 | - | v2 doesn't inherit |
| I6-TS09 | Per-vault cache path | vaultName="team" | vaultName="personal" | Different .clausidian/ roots |
| I6-TS10 | Default dirs fallback | No config | - | Uses DEFAULT_DIRS |

---

### I7: Vault Command Subcommands (`src/commands/vault.mjs` - NEW)

**Scope:** Implement `clausidian vault` subcommand family for registry management.

**New File:** `/src/commands/vault.mjs`

**Subcommands:**

1. `vault list` - Display all registered vaults
2. `vault register <name> <path>` - Add new vault
3. `vault default <name>` - Set default vault
4. `vault info <name>` - Show vault details
5. `vault remove <name>` - Unregister vault (optional for v3.2.0)

**Implementation Signature:**

```javascript
export const vaultCommand = {
  name: 'vault',
  description: 'Manage vault registry',
  subcommands: {
    list: {
      async run(root, flags, positional) {
        // Load registry, display all vaults with status
      }
    },
    register: {
      async run(root, flags, positional) {
        // Add new vault: positional[0]=name, positional[1]=path
      }
    },
    default: {
      async run(root, flags, positional) {
        // Set default: positional[0]=vault name
      }
    },
    info: {
      async run(root, flags, positional) {
        // Show vault details (path, last accessed, cache size)
      }
    },
  }
}
```

**Example Outputs:**

```bash
$ clausidian vault list
Vault Registry: ~/.clausidian/vaults.json

Name        Path                              Default
team-kb     /Users/dex/Obsidian/team-kb       ✓
personal    /Users/dex/Obsidian/personal      -
project-x   /Users/dex/Obsidian/project-x     -

$ clausidian vault default team-kb
Set default vault to: team-kb

$ clausidian vault register work /Users/dex/Obsidian/work
Registered vault: work → /Users/dex/Obsidian/work

$ clausidian vault info team-kb
Vault: team-kb
Path: /Users/dex/Obsidian/team-kb
Default: yes
Notes: 1,245
Cache size: 2.3 MB
Last indexed: 2026-03-30 15:45:00
```

**Integration in Registry:**

```javascript
// In src/registry.mjs, add to COMMANDS:
{
  name: 'vault',
  description: 'Manage vault registry',
  usage: 'vault [list|register|default|info|remove]',
  subcommands: { /* ... */ }
}
```

**Test Scenarios (I7-TS01 through I7-TS12):**

| ID | Scenario | Command | Input | Expected |
|----|----------|---------|-------|----------|
| I7-TS01 | List empty registry | vault list | - | "No vaults registered" |
| I7-TS02 | List with vaults | vault list | - | All vaults shown with default marker |
| I7-TS03 | Register new vault | vault register team /path | - | Success, saved to disk |
| I7-TS04 | Register duplicate | vault register team /path | team exists | Error: "Already exists" |
| I7-TS05 | Register non-existent path | vault register test /nonexistent | - | Warning: "Path doesn't exist" |
| I7-TS06 | Set default first time | vault default team | no prior default | team marked as default |
| I7-TS07 | Change default | vault default team | personal was default | Default moved to team |
| I7-TS08 | Set default invalid name | vault default xyz | xyz not found | Error: "Vault not found" |
| I7-TS09 | Info on existing vault | vault info team | - | Details shown (path, notes count, etc.) |
| I7-TS10 | Info on missing vault | vault info xyz | xyz not found | Error: "Vault not found" |
| I7-TS11 | Remove vault | vault remove team | - | Unregistered, saved to disk |
| I7-TS12 | JSON output | vault list --json | - | JSON with vaults array |

---

### I8: Error Handling & User Messaging

**Scope:** Implement consistent error taxonomy and helpful error messages.

**Error Categories (E1-E4):**

| ID | Category | Condition | Message | Recovery |
|----|----------|-----------|---------|----------|
| E1 | Registry Corruption | Invalid JSON syntax | "Warning: ~/.clausidian/vaults.json is corrupted. Falling back to OA_VAULT." | Continue with env var |
| E2 | Invalid Vault Path | Path doesn't exist or unreadable | "Error: Vault 'team-kb' points to /path which doesn't exist.\nTry: clausidian vault register team-kb /new/path" | User re-registers vault |
| E3 | No Vault Selected | Neither flag, env, nor default set | "Error: No vault selected. Provide one of:\n1. --vault=<name> flag\n2. OA_VAULT=/path/to/vault\n3. clausidian vault default <name>\nAvailable: team-kb, personal" | User selects vault |
| E4 | Vault Not Found | Name not in registry | "Error: Vault 'xyz' not found in registry.\nAvailable: team-kb, personal\nRegister: clausidian vault register xyz /path" | User registers vault |

**Implementation Points:**

1. VaultRegistry: Validate all paths on load, report first error
2. VaultResolver: Wrap all errors with context (which step failed?)
3. Command handlers: Catch vault errors, print E1-E4 messages
4. CLI: Catch all exceptions, print to stderr with exit code 1

**Test Scenarios (I8-TS01 through I8-TS10):**

| ID | Scenario | Error | Expected Message | Exit Code |
|----|----------|-------|------------------|-----------|
| I8-TS01 | Registry corrupted | Invalid JSON | E1: Corruption warning | 0 (fallback) |
| I8-TS02 | Vault path missing | /nonexistent | E2: Path doesn't exist | 1 |
| I8-TS03 | No vault selected | No --vault, no env, no default | E3: Clear instructions | 1 |
| I8-TS04 | Vault not found | --vault=xyz | E4: List available | 1 |
| I8-TS05 | Permission denied | Path unreadable | "Error: Permission denied" | 1 |
| I8-TS06 | Partial error recovery | One vault invalid, others valid | List command shows which failed | 1 |
| I8-TS07 | Helpful suggestions | Common typo in vault name | Suggest similar names | 1 |
| I8-TS08 | Error in JSON mode | Vault error | JSON error object | 1 |
| I8-TS09 | Clear trace context | Error during search | Include vault name in trace | 1 |
| I8-TS10 | Backward compat error | OA_VAULT invalid path | Same error as registry path error | 1 |

---

## Integration Points & Dependencies

### Dependency Graph

```
CLI Entry (bin/cli.mjs)
├─ Parses flags
├─ Calls VaultResolver
│  └─ Loads VaultRegistry
│     └─ Reads ~/.clausidian/vaults.json
└─ Executes Command (e.g., search)
   ├─ Receives vault context (name, path)
   └─ Creates Vault instance
      ├─ Passes vaultName
      └─ SearchCache uses vaultName prefix
```

### File Modification Checklist

**New Files:**
- [ ] `/src/vault-registry.mjs` (I1)
- [ ] `/src/vault-resolver.mjs` (I2)
- [ ] `/src/commands/vault.mjs` (I7)

**Modified Files:**
- [ ] `/bin/cli.mjs` (I3) - Add vault resolution
- [ ] `/src/search-cache.mjs` (I5) - Add vaultName parameter
- [ ] `/src/vault.mjs` (I6) - Add vaultName parameter
- [ ] `/src/registry.mjs` - Add vault subcommand
- [ ] `/src/commands/*.mjs` (I4) - Add vaultName parameter, include in output

**Test Files:**
- [ ] `/test/vault-registry.test.mjs`
- [ ] `/test/vault-resolver.test.mjs`
- [ ] `/test/vault-commands.test.mjs`
- [ ] Update `/test/commands.test.mjs` with vault context tests

---

## Testing Strategy

### Test Pyramid

```
         Unit Tests (I1-I8 local tests)
           ├─ 10+ per implementation unit
           ├─ 80 total unit tests
           └─ Focus: single component behavior

      Integration Tests (across units)
        ├─ Vault resolution → command execution
        ├─ Cache isolation across vaults
        ├─ Config isolation across vaults
        └─ Backward compatibility (OA_VAULT)

    End-to-End Tests (full CLI workflows)
      ├─ Multi-vault session
      ├─ Registry persistence
      └─ Error handling scenarios
```

### Test File Organization

```
test/
├── vault-registry.test.mjs         (I1: 12 scenarios)
├── vault-resolver.test.mjs         (I2: 13 scenarios)
├── vault-commands.test.mjs         (I7: 12 scenarios)
├── commands.test.mjs               (I3, I4: update, add 12 multi-vault tests)
└── multi-vault-integration.test.mjs (Integration: 15 scenarios)
```

### Critical Test Scenarios (High Priority)

1. **Precedence Order (I2-TS02, I2-TS05):** --vault > OA_VAULT > registry default
2. **Cache Isolation (I5-TS03, I5-TS06):** No cross-vault cache collisions
3. **Config Isolation (I6-TS04, I6-TS09):** No cross-vault config leakage
4. **Backward Compat (I2-TS03, I4-TS12):** OA_VAULT still works
5. **Clear Errors (I8-TS02 through I8-TS05):** All error paths have helpful messages

---

## Implementation Sequence

### Phase 1: Core Infrastructure (Days 1-2)
1. Create `VaultRegistry` class (I1)
2. Create `VaultResolver` function (I2)
3. Add unit tests for I1 & I2 (32 test scenarios)
4. Verify backward compatibility with OA_VAULT

### Phase 2: CLI Integration (Days 2-3)
5. Refactor CLI entry point (I3)
6. Update command signatures to accept vaultName (I4)
7. Update help/usage text (I4)
8. Add integration tests (20+ scenarios)

### Phase 3: Performance & Isolation (Days 3-4)
9. Implement cache key prefixing (I5)
10. Ensure config isolation (I6)
11. Add isolation tests (20+ scenarios)
12. Verify no cross-vault data leakage

### Phase 4: Vault Management Commands (Days 4-5)
13. Implement `vault list/register/default/info` (I7)
14. Add command tests (12 scenarios)
15. Update registry in command registry (I7)

### Phase 5: Error Handling & Polish (Days 5)
16. Implement error taxonomy (I8)
17. Add helpful error messages
18. End-to-end testing with all error paths
19. Documentation updates

### Phase 6: Testing & Validation (Days 5-6)
20. Run full test suite (80+ unit + integration tests)
21. Backward compat verification (existing single-vault workflows)
22. Manual testing: multi-vault session
23. Performance benchmarking (cache hit rates)

---

## Success Criteria (v3.2.0)

### Functional Criteria
- [x] `clausidian search --vault=team-kb keyword` works
- [x] Output includes `"vault": "team-kb"` field
- [x] `clausidian vault list` returns registry contents
- [x] `clausidian vault register team-kb /path` persists to registry
- [x] `clausidian vault default team-kb` sets default
- [x] Precedence order (--vault > OA_VAULT > registry default) verified
- [x] Cache keys include vault name prefix
- [x] Config isolation enforced (no cross-vault leakage)
- [x] Clear error messages for all 4 error paths (E1-E4)

### Backward Compatibility Criteria
- [x] `OA_VAULT=/path clausidian search keyword` still works (no --vault)
- [x] Existing single-vault scripts unbroken
- [x] CI/CD workflows using OA_VAULT continue working
- [x] MCP server unchanged (single-vault per session until v3.3.0)

### Test Coverage Criteria
- [x] 80+ unit test scenarios (10+ per unit)
- [x] 20+ integration test scenarios
- [x] All 4 error paths (E1-E4) tested
- [x] All 4 precedence branches (I2-TS01 through I2-TS06) tested
- [x] Cache isolation verified (5+ scenarios)
- [x] Config isolation verified (5+ scenarios)

---

## Deferred to v3.3.0+

**MCP Multi-Vault Support**
- Current MCPServer creates single Vault instance at init
- Refactoring to vault-pool requires architectural redesign
- Estimated effort: 2-3 days
- Target: v3.3.0 planning

**Other Future Features**
- Batch operations across vaults
- Vault sync and discovery
- Encrypted vault support
- Import/export migration tools
- Web UI for vault management

---

## Key Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Cache corruption across vaults | High | Vault name prefix in all cache keys (I5) |
| Config leakage across vaults | High | Strict isolation (I6), no cross-vault fallbacks |
| Backward compat breakage | High | Extensive OA_VAULT testing (10+ scenarios) |
| Registry file corruption | Medium | Graceful fallback to OA_VAULT (E1) |
| Unclear error messages | Medium | Comprehensive error taxonomy (I8) |
| Performance regression | Medium | Cache hit rate benchmarking post-implementation |

---

## Documentation Updates

**Files to Update:**
- [ ] `README.md` - Add multi-vault usage examples
- [ ] `ARCHITECTURE.md` - Add vault resolution flow diagram
- [ ] Help text in `src/help.mjs` - Document `--vault` flag pattern
- [ ] Changelog: Note v3.2.0 multi-vault CLI support

**Example Documentation Snippets:**

```markdown
## Multi-Vault Support (v3.2.0+)

Register vaults:
  clausidian vault register team-kb /Users/dex/Obsidian/team-kb
  clausidian vault register personal /Users/dex/Obsidian/personal

Use --vault flag to target a vault:
  clausidian search --vault=team-kb python
  clausidian note "Design Doc" project --vault=team-kb

Set default vault (used when --vault is omitted):
  clausidian vault default team-kb

List registered vaults:
  clausidian vault list

Vault resolution order:
  1. --vault flag (explicit)
  2. OA_VAULT environment variable (legacy)
  3. Registry default (persistent)
  4. Error if none available
```

---

## Appendix: Command API Patterns

### Pattern 1: Search with Vault

```bash
# Old (single vault, OA_VAULT required)
OA_VAULT=/path/to/vault clausidian search keyword

# New (with registry & --vault flag)
clausidian search --vault=team-kb keyword
clausidian search keyword  # Uses registry default
```

### Pattern 2: Multi-Vault Session (Agent Use Case)

```bash
# Agent can now switch vaults within same session
clausidian search --vault=team-kb "design patterns"
clausidian search --vault=personal "ideas"
clausidian note "Extracted insight" project --vault=team-kb

# All commands isolated by vault name
```

### Pattern 3: Backward Compatible

```bash
# Legacy workflows continue unchanged
OA_VAULT=/Users/dex/Obsidian/main clausidian search "todos"
OA_VAULT=/Users/dex/Obsidian/main clausidian journal

# No --vault flag needed, backward compatible
```

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| v3.2.0 | 2026-03-30 | CLI multi-vault support, registry, --vault flag, cache/config isolation |
| v3.3.0 | TBD | MCP multi-vault session support (architectural redesign) |

---

## Sign-Off

**Plan Author:** Architecture Planning Sprint  
**Date:** 2026-03-30  
**Status:** Ready for Implementation  
**Estimated Effort:** 5-6 days (1 engineer)  
**Testing Effort:** 3-4 days (concurrent)

