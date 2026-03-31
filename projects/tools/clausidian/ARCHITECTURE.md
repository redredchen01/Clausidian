# Clausidian Architecture

High-level system design and performance optimization layers introduced in v3.0.0+.

> **Related:** [README.md](README.md) · [CHANGELOG.md](CHANGELOG.md) · [Test Scenarios](docs/TEST-SCENARIOS-SUMMARY.md) · [v3.1.0 Plan](docs/plans/2026-03-30-001-feat-clausidian-v3-1-0-mvp-plan.md)

## System Overview

```
┌─────────────────────────────────────────────────────────┐
│                    CLI / MCP Interface                  │
│  (commands: search, note, journal, cache, review, etc.) │
└────────────────────┬────────────────────────────────────┘
                     │
        ┌────────────┴────────────┐
        │                         │
   ┌────▼──────┐          ┌──────▼──────┐
   │   Commands│          │   Registry  │
   │ (vault ops)         │  (MCP tools) │
   └────┬──────┘          └──────┬──────┘
        │                         │
   ┌────▼──────────────────────┐
   │      Performance Layers   │
   │     (v3.0.0 Sprint)      │
   └────┬──────────────────────┘
        │
   ┌────┴──────────────────────────────────────────┐
   │                                              │
   │  ┌────────────────────────────────────┐      │
   │  │  SearchCache (TTL in-memory)       │      │
   │  │  + disk persistence (Theme C)      │      │
   │  │  Invalidation: vault.write()       │      │
   │  │  TTL: 10 minutes                   │      │
   │  └────────────────────────────────────┘      │
   │  ┌────────────────────────────────────┐      │
   │  │  ClusterCache                      │      │
   │  │  (union-find results)              │      │
   │  │  Vault-version aware               │      │
   │  └────────────────────────────────────┘      │
   │  ┌────────────────────────────────────┐      │
   │  │  SelectiveInvalidation             │      │
   │  │  Per-note dirty tracking           │      │
   │  │  Selective clear (not full flush)  │      │
   │  └────────────────────────────────────┘      │
   │  ┌────────────────────────────────────┐      │
   │  │  FileHasher                        │      │
   │  │  mtime + size change detection     │      │
   │  │  Incremental sync foundation       │      │
   │  └────────────────────────────────────┘      │
   │                                              │
   └────┬──────────────────────────────────────────┘
        │
   ┌────▼──────────────┐
   │     Vault I/O     │
   │  (read/write/sync)│
   └────┬──────────────┘
        │
   ┌────▼──────────────────────┐
   │  Markdown + YAML Storage  │
   │  (areas/, projects/, ...) │
   └───────────────────────────┘
```

## Performance Optimization Modules (v3.0.0)

### 1. SearchCache - TTL-Based Result Caching

**Location:** `src/search-cache.mjs`

**Purpose:** Cache search results to avoid expensive re-ranking on repeated queries

**Key Features:**
- TTL: 10 minutes (configurable)
- Cache key: `${keyword}|${type}|${tag}|${status}|${regex}`
- Hit/miss counters for diagnostics
- Lazy cleanup of expired entries

**Disk Persistence (Theme C):**
- `loadFromDisk(diskPath, vaultVersion)` - Restore cache on startup
- `saveToDisk(diskPath, vaultVersion)` - Non-blocking write-through
- Location: `<vault>/.clausidian/cache.json`
- Atomic writes via temp file + rename

**Invalidation:**
- Triggered by `vault.write()` (triggers all cache clears)
- Per-query invalidation via `SelectiveInvalidation` hook

### 2. ClusterCache - Union-Find Results

**Location:** `src/cluster-cache.mjs`

**Purpose:** Cache graph clustering results (union-find algorithm output)

**Key Features:**
- Vault-version aware (auto-invalidate on version mismatch)
- Bulk load support for multiple queries
- Expiry checking integrated with vault versioning

**Invalidation:**
- Triggers when `vault.version` changes
- Fallback for schema migrations

### 3. SelectiveInvalidation - Per-Note Dirty Tracking

**Location:** `src/vault-selective-invalidation.mjs`

**Purpose:** Track which notes were modified, avoiding full vault re-indexing

**Key Features:**
- Per-note dirty marking (not boolean flag)
- Separate tracking for tags index and graph index
- `getDirty(indexType)` returns only modified notes
- `clearDirty(partial)` allows selective clearing

**Integration:**
- Called by `vault.write()` when notes are modified
- Feeds invalidation signals to SelectiveInvalidation hook

### 4. FileHasher - Change Detection

**Location:** `src/file-hasher.mjs`

**Purpose:** Detect file changes with mtime + size hashing (fast, reliable)

**Key Features:**
- Single file hashing: `O(1)` time
- Directory traversal: recursive hashing of note tree
- Diff detection: created, modified, deleted files
- Size + mtime both checked (prevents false negatives)

**Usage:**
- Incremental sync foundation
- Backup/sync tools can query change sets
- No full vault hash needed

### 5. VaultValidator - Root Directory Validation

**Location:** `src/vault-validator.mjs`

**Purpose:** Validate vault root structure and provide helpful errors

**Key Features:**
- Marker detection: `.clausidian.json`, `_index.md`, `areas/` directory
- Error reporting: missing directory structure
- Fallback: environment variable `OA_VAULT` support
- getVaultRoot() with fallback chain

**Use Cases:**
- CLI startup validation
- MCP server initialization
- Agent discovery

## MCP Integration (v3.1.0 Theme A)

**Location:** `src/registry.mjs`

**Tool Registration Pattern:**

```javascript
{
  name: 'command-name',
  description: 'Human-readable description',
  usage: 'command-name <arg1> [--flag]',
  mcpSchema: {
    arg1: { type: 'string', description: '...' },
    flag: { type: 'string', enum: ['a', 'b'] }
  },
  mcpRequired: ['arg1'],
  async run(root, flags) {
    // Implementation
    return { status: 'success', ... };
  }
}
```

**Tool Count:** 52+ tools exposed

**New in v3.1.0:**
- `import` - JSON/Markdown file ingestion
- `review`, `review monthly` - Report generation
- `cache stats`, `cache clear` - Persistent cache management

## Data Persistence (Theme C)

### Disk Cache Structure

**File:** `<vault>/.clausidian/cache.json`

**Format:**
```json
{
  "vaultVersion": "3.1.0",
  "timestamp": 1711827600000,
  "entries": [
    [
      "keyword|type|tag|status|regex",
      {
        "results": [...],
        "timestamp": 1711827500000
      }
    ]
  ]
}
```

**Lifecycle:**
1. Process startup → `SearchCache.loadFromDisk()` restores valid entries
2. Query → `SearchCache.set()` triggers `setImmediate()` write
3. `vault.write()` → invalidates cache, clears disk file
4. Process lifecycle → periodic cleanup of expired entries

**Performance:**
- Cold-start search: 500ms+ → 50ms (10x improvement)
- No blocking I/O during query execution (setImmediate)
- Graceful degradation on disk errors

## Indexing Architecture

### Index Files

| File | Purpose | Rebuild Trigger |
|------|---------|-----------------|
| `_tags.md` | Tag registry | `IndexManager.rebuildTags()` |
| `_graph.md` | Bidirectional links | `IndexManager.rebuildGraph()` |
| `<type>/_index.md` | Type-specific index | `IndexManager.updateDirIndex()` |

**Key Properties:**
- Wikilink format: `[[note-id]]`
- Frontmatter metadata: counts, relationships, suggestions
- Manually editable (agents can patch)

### Sync Strategy

**Incremental (v3.0.0):**
- Track modified notes via `FileHasher` + `SelectiveInvalidation`
- Rebuild only affected indices
- Cache invalidation: smart, not full flush

**Full Rebuild:**
- `vault.sync()` - rebuilds all indices
- Used on first init or corruption recovery
- Expensive but accurate

## Testing Strategy

### Test Coverage by Module

| Module | Tests | Location |
|--------|-------|----------|
| SearchCache disk persistence | 10 | `test/search-cache-persistence.test.mjs` |
| Cache command (stats/clear) | 5 | `test/cache-command.test.mjs` |
| Core vault operations | 127 | `test/vault.test.mjs` + others |
| Commands (import, review, etc.) | 60+ | `test/commands.test.mjs` |
| MCP server integration | 15+ | `test/mcp.test.mjs` |
| **Total** | **447** | **13 suites** |

### Performance Regression Suite

**Location:** `test/performance-regression.test.mjs` (flagged for future)

**Purpose:** Baseline performance metrics to catch regressions

**Scope:**
- Search latency: < 100ms for typical queries
- Cache hit rate: > 80% in agent workflows
- Disk persistence: < 50ms write-through overhead

## Future Work (v3.2.0+)

| Feature | Rationale | Scope |
|---------|-----------|-------|
| Multi-vault management | Registry file + UX | Large |
| Plugin ecosystem | API stability first | Defer |
| Persistent TTL index | TTL-aware on-disk cache | v3.2.0 |
| Batch parallelization | Low ROI (batches < 100 items) | v3.3.0+ |
| AI capabilities | LLM integration (breaks zero-dep) | v3.2.0 |

---

## Development Guidelines

### Adding a New Cache Layer

1. Create `src/<cache-name>.mjs` with class
2. Add TTL + invalidation strategy
3. Hook into `vault.write()` or specific command
4. Write tests covering: hit/miss, expiry, errors
5. Document in this ARCHITECTURE.md
6. Register MCP tools if agent-facing

### Code Patterns

**Cache Pattern:**
```javascript
class MyCache {
  constructor(ttlMs = 10 * 60 * 1000) {
    this.cache = new Map();
    this.ttl = ttlMs;
  }

  get(key) {
    const entry = this.cache.get(key);
    if (!entry || Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }
    return entry.value;
  }

  set(key, value) {
    this.cache.set(key, { value, timestamp: Date.now() });
  }

  clear() {
    this.cache.clear();
  }
}
```

**Invalidation Hook:**
```javascript
// In vault.write() or command that modifies notes
invalidateCache() {
  this._cache?.clear?.();
  // Chain to other caches
  if (this._selectiveInvalidation) {
    this._selectiveInvalidation.markDirty(noteId, ['tags']);
  }
}
```

---

Last updated: 2026-03-30 (v3.1.0)
