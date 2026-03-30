# Architecture — clausidian

High-level design and module organization.

## Core Module Structure

```
clausidian/
├── bin/
│   └── cli.mjs              # Entry point, command dispatch
├── src/
│   ├── registry.mjs         # Command registry lookup
│   ├── help.mjs             # Help text generation
│   ├── notify.mjs           # Desktop notifications
│   ├── clipboard.mjs        # Clipboard operations
│   ├── dates.mjs            # Date utilities (YYYY-MM-DD, weeks, months)
│   ├── bm25.mjs             # BM25 search algorithm
│   ├── index-manager.mjs    # Index rebuilding (_tags.md, _graph.md, dir indexes)
│   ├── mcp-server.mjs       # MCP protocol server
│   ├── vault.mjs            # Core vault API
│   ├── templates.mjs        # Template engine ({{PLACEHOLDER}} substitution)
│   ├── obsidian-cli.mjs     # Obsidian application CLI (macOS only)
│   ├── journal-utils.mjs    # Journal analysis & knowledge precipitation
│   ├── commands/            # Individual command implementations
│   │   ├── journal.mjs      # Create/view journal entries
│   │   ├── note.mjs         # Create notes (area/project/resource/idea)
│   │   ├── capture.mjs      # Quick idea capture
│   │   ├── search.mjs       # Full-text search (BM25)
│   │   ├── read.mjs         # Read note content
│   │   ├── update.mjs       # Update frontmatter
│   │   ├── patch.mjs        # Edit sections (--heading --append/--prepend/--replace)
│   │   ├── delete.mjs       # Delete notes
│   │   ├── rename.mjs       # Rename & update references
│   │   ├── move.mjs         # Move to different type/directory
│   │   ├── merge.mjs        # Merge notes (body+tags)
│   │   ├── archive.mjs      # Archive (status=archived)
│   │   ├── sync.mjs         # Rebuild indices
│   │   ├── graph.mjs        # Mermaid knowledge graph
│   │   ├── health.mjs       # Vault health scoring
│   │   ├── stats.mjs        # Vault statistics
│   │   ├── suggest.mjs      # Improvement suggestions
│   │   ├── timeline.mjs     # Activity feed
│   │   ├── batch.mjs        # Batch operations (tag/update/archive)
│   │   ├── export.mjs       # Export vault (JSON/Markdown)
│   │   ├── link.mjs         # Auto-link related notes
│   │   ├── base.mjs         # Airtable-like query API
│   │   ├── canvas.mjs       # Canvas/diagram support
│   │   ├── open.mjs         # macOS: open in Obsidian
│   │   ├── launchd.mjs      # macOS: launchd scheduling
│   │   ├── setup.mjs        # One-time setup for Claude Code
│   │   └── ... (50+ total)
│   └── help.mjs             # Help text & command reference
├── test/
│   ├── vault.test.mjs       # Vault core API tests
│   ├── bm25.test.mjs        # Search algorithm tests
│   ├── commands.test.mjs    # Command execution tests
│   ├── ... (24 test suites, 168 tests)
├── scaffold/
│   ├── templates/           # Default note templates
│   ├── .claude/commands/    # Claude Code slash commands
│   ├── .cursor/rules/       # Cursor rules (obsidian.md)
│   ├── .github/copilot/     # GitHub Copilot instructions
│   └── CONVENTIONS.md       # Writing & agent behavior rules
├── skill/
│   └── SKILL.md             # /obsidian skill definition for Claude Code
├── package.json
├── README.md
├── CHANGELOG.md
├── ARCHITECTURE.md (this file)
├── CONTRIBUTING.md
└── .github/workflows/       # CI/CD pipeline (test, lint, publish)
```

## Data Flow

### CLI Command Execution
```
cli.mjs
  ├─ Parse args → flags + positional
  ├─ Registry lookup → getCommand(name)
  ├─ Resolve vault path → OA_VAULT || cwd
  └─ Dispatch → command.run(vaultPath, flags, positional)
```

### Vault Operations
```
vault.mjs (core API)
  ├─ read(path)        → parse YAML frontmatter + body
  ├─ write(path, note) → write frontmatter + body
  ├─ scanNotes()       → find all .md files
  ├─ search(keyword)   → BM25 search
  ├─ findRelated(note) → score-based relationship matching
  ├─ backlinks(note)   → inverse link index
  ├─ updateNote()      → merge + sync indices
  └─ cache invalidation on write
```

### Search Flow
```
search.mjs (command)
  ├─ Check cache (5 min TTL) → return cached result
  ├─ embed-search.mjs checks for embedding provider
  │  ├─ Provider available? → vector search
  │  └─ Fallback → BM25
  ├─ BM25 algorithm:
  │  ├─ Tokenize input (lowercase, stop words, CJK support)
  │  ├─ Score each document by field (title=10, tags=5, body=1)
  │  ├─ Normalize by document length
  │  └─ Return sorted results with scores
  └─ Format & return
```

### Index Management
```
index-manager.mjs
  ├─ rebuildTags() → _tags.md (tag → [notes] mapping)
  ├─ rebuildGraph() → _graph.md (Mermaid diagram)
  └─ updateDirIndex() → _index.md in each directory
```

### Knowledge Precipitation (A1-A5)
```
journal-utils.mjs
  ├─ A1: Promotion → Topics 2+ days in journals → suggest project upgrade
  ├─ A2: Idea Temperature → new/active/frozen(14d)/archive(30d)
  ├─ A3: Staleness → resource >60d, project >30d, idea >30d
  ├─ A4: Conclusion → #conclusion/#resolved tags from session
  └─ A5: Link Suggestions → 2+ tags shared, no related link
```

## Key Abstractions

### Frontmatter Schema
```yaml
---
title: "Note Title"
type: area | project | resource | idea | journal
tags: [tag1, tag2]
created: YYYY-MM-DD
updated: YYYY-MM-DD
status: active | draft | archived
summary: "One-line description"
related: ["[[filename]]", "[[other]]"]
---
```

### Command Interface
```javascript
// All commands follow this pattern
export default {
  name: 'command-name',
  description: 'What it does',
  flags: {
    'flag-name': 'description',
  },
  async run(vaultPath, flags, positional) {
    // Implementation
    return { success: true, message: "..." };
  }
};
```

### MCP Server
```
mcp-server.mjs
  ├─ Tools: journal, note, capture, search, read, recent, delete, ...
  ├─ Resources: <vault:area>, <vault:project>, <vault:journal>
  └─ Prompts: daily-briefing, weekly-review, monthly-summary
```

## Performance Characteristics

| Operation | Complexity | Notes |
|-----------|-----------|-------|
| scanNotes | O(n) | Full disk scan required |
| search | O(n) | BM25 scoring all docs, cached after 5 min |
| findRelated | O(n) | Tag-based similarity scoring |
| updateNote | O(n log n) | Write + cache invalidation + sync |
| sync (rebuild indices) | O(n) | Scans all files, regenerates 3 index files |
| Large vault (>10K files) | | Batch scanning + progress indicator (v2.5.0) |

## Design Decisions

### Zero Dependencies
- No npm packages required at runtime
- Only built-in Node.js modules (fs, path, url, etc.)
- Benefit: Small footprint, portable, no supply chain risk

### Registry-Based Dispatch
- Dynamic command lookup via `registry.mjs`
- Supports command aliases, fuzzy matching, help generation
- Easy to add new commands without modifying CLI entry point

### Vault as Abstraction
- All file operations go through `vault.mjs`
- Enables caching, atomic updates, validation
- Easy to swap storage backend (though not currently needed)

### PARA Structure
- Enforced directory layout: areas/, projects/, resources/, journal/, ideas/
- Enables efficient type-based filtering and navigation
- Supports multiple vaults with bridge mode (v2.0.0+)

### BM25 Search with Fallback
- Default: BM25 algorithm (production-proven, no deps)
- Optional: Embed provider for vector search
- Graceful degradation if embedding service unavailable

## Extension Points

### Adding a New Command
1. Create `src/commands/mycommand.mjs` with `run()` function
2. Export in `registry.mjs`
3. Add tests in `test/mycommand.test.mjs`
4. Update `src/help.mjs` and README

### Custom Templates
- Edit `scaffold/templates/` files
- Use `{{PLACEHOLDER}}` syntax
- Call `vault.ensureNote()` with template selection

### Custom Hooks
- MCP Server can trigger on events
- `hook.mjs` handles: session-stop, daily-backfill, etc.
- Extend via `settings.json` hooks

## Known Limitations (v2.0.0)

- No bidirectional sync (one-way: files → vault API)
- Search caching is in-memory only (lost on process restart)
- Parallel batch operations limited to <100 items to avoid memory spikes
- Obsidian integration is one-way (read operations only)

## Roadmap (v2.5.0+)

- Smart template generation from vault patterns
- AI-powered context recommendations
- Incremental index updates
- Large vault optimization (>10K files)
- GitHub Actions CI/CD
- Type-safe JSDoc annotations
- Performance benchmarking suite
