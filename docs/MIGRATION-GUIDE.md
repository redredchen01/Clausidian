# Clausidian v3.9.0 Migration Guide

This guide helps you migrate your workflows from Clausidian v3.8.0 to v3.9.0. **No data is lost** — your vault remains fully functional. This release removes 35 low-priority commands to refocus on core LLM Wiki and vault management workflows.

## Quick Summary

| Aspect | Change |
|--------|--------|
| **Commands** | 58 → 22 commands |
| **Removed** | 35 low-priority / low-coverage commands |
| **Preserved** | Core LLM Wiki workflow + essential utilities |
| **Data Loss** | None — all notes, indices, and metadata intact |

## Replacement Patterns by Complexity

### Low Complexity (Trivial Migration)

These commands have direct 1-to-1 replacements:

| Deleted | Replacement | Example |
|---------|-------------|---------|
| `archive <note>` | `update <note> --status archived` | `clausidian update my-idea --status archived` |
| `list <type>` | `search --type <type>` | `clausidian search --type project` |
| `recent` | `list --sort modified` | `clausidian list --sort modified` |
| `health` | `validate` | `clausidian validate` |
| `broken-links` | `validate` (included) | Run `clausidian validate` to find broken links |
| `orphans` | `validate --filter orphans` | Check orphans in health report |
| `daily` | `journal` | `clausidian journal` (creates today's entry) |

**Migration effort: 5 minutes**

### Medium Complexity (Pattern Changes)

These require adapting your workflow but remain straightforward:

| Deleted | Replacement Pattern | Notes |
|---------|-------------------|-------|
| `batch tag --type <type> --add <tag>` | Loop: `search --type <type>` then `update <note> --add-tag <tag>` | Write a shell script or use agent loop |
| `batch update ...` | Same loop pattern as batch tag | See shell script example below |
| `list --sort <field>` | Use shell piping or agent filtering | Combine `list` output with `grep`/`awk` |
| `pin <note>` | Add frontmatter field: `pinned: true` | Then use `search --regex "pinned: true"` |
| `unpin <note>` | Remove `pinned` field from frontmatter | Edit note directly or via agent |
| `recent` | `list --sort modified --reverse` | Sort by modification time |
| `rename <old> <new>` | Manual: create new note, update links | Use `search --references <old>` to find references |
| `merge <src> <dst>` | Manual: combine content, delete source | Copy content, run `validate --fix` to update links |

**Migration effort: 10-30 minutes**

**Shell Script Example for Batch Operations:**
```bash
#!/bin/bash
# Batch update tags for all notes of a type

TYPE="project"
NEW_TAG="2026-q2"

clausidian search --type "$TYPE" | grep -o '📦 [^ ]*' | while read _ NOTE; do
  clausidian update "$NOTE" --add-tag "$NEW_TAG"
done
```

### High Complexity (Redesign Required)

These commands served specialized use cases. For most users, native Obsidian or agent-based alternatives are preferable:

| Deleted | Reason | Alternative |
|---------|--------|-------------|
| `graph` | Visualization tool | Use Obsidian's built-in Graph View |
| `watch` | File monitoring daemon | Use macOS `launchd`, Linux `systemd`, or Obsidian's native auto-index |
| `batch export/import` | Data transfer | Use filesystem tools: `cp`, `tar`, or Obsidian's native export |
| `timeline` | Historical view | Use `list --sort created` + agent filtering |
| `memory` | Internal experimental feature | Use `memory semantic` (preserved) for semantic search |
| `bridge` / `events` / `subscribe` | Experimental integrations | Not recommended for production use anyway |

**Migration effort: Case-by-case assessment**

## What's Still Available

These core commands remain and power your LLM Wiki workflow:

**Journal & Notes:**
- `journal` — Create today's journal entry
- `note` — Create a new note with metadata
- `capture` — Quick idea capture
- `read` — Read a note's full content

**Discovery & Search:**
- `search` — Full-text search with filtering
- `memory semantic` — AI-powered semantic search
- `list` — List notes by type, tag, status
- `backlinks` — Find references to a note

**Maintenance & Organization:**
- `sync` — Rebuild indices and caches
- `validate` — Health check (orphans, broken links, inconsistencies)
- `tag` — List and rename tags
- `update` — Modify note metadata
- `cache` — Manage search cache

**Agent Integration:**
- `setup` — Install Claude Code integration
- `init` — Initialize a new vault
- `vault` — Multi-vault management

## Migration Checklist

- [ ] **Audit your scripts:** Search for deleted command names in scripts, aliases, or agent prompts
- [ ] **Test the vault:** Run `clausidian validate` to verify your vault is healthy
- [ ] **Update agent configs:** If you have custom AGENT.md or prompts, update command references
- [ ] **Batch operations:** Rewrite batch workflows using loops or agent logic
- [ ] **Pinning:** If you used `pin`, add a `pinned: true` frontmatter field instead
- [ ] **Archive workflows:** Update archive commands to use `update --status archived`
- [ ] **Monitoring:** Replace `watch` with OS-level automation if needed

## FAQ

**Q: Where's my data?**
A: All notes, metadata, tags, and indices are untouched. Your vault works exactly the same.

**Q: How do I archive notes now?**
A: Use `clausidian update <note> --status archived` instead of `clausidian archive <note>`.

**Q: Can I get batch operations back?**
A: Yes — use a shell loop or have your agent (Claude Code) loop over notes with individual `update` commands.

**Q: What about `graph` visualization?**
A: Use Obsidian's built-in Graph View (Ctrl+G on most systems) — it's much better than Clausidian's text-based version.

**Q: Will old vault exports still work?**
A: Yes. If you have a vault backup, restoring it to v3.9.0 works without any changes.

**Q: Why remove so many commands?**
A: 35 commands lacked test coverage and served niche use cases, creating maintenance burden. Focusing on 22 core commands improves reliability and user experience.

## Support

For detailed replacement patterns and technical migration questions, see `docs/MIGRATION-35-COMMANDS.md` which lists every deleted command with its replacement.

