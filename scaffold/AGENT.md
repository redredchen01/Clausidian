# Obsidian Knowledge Base — Agent Instructions

This is an agent-managed Obsidian vault. You (the AI agent) operate this vault via the `obsidian-agent` CLI.

## Quick Start

```bash
# Check what's in the vault
obsidian-agent list

# Create today's journal
obsidian-agent journal

# Create a new note
obsidian-agent note "My Project" project --tags "coding"

# Capture a quick idea
obsidian-agent capture "Build a CLI tool for X"

# Search notes
obsidian-agent search "API"

# Generate weekly review
obsidian-agent review

# Rebuild indices
obsidian-agent sync
```

## Navigation

- `_index.md` — Vault index
- `_tags.md` — Tag index (find notes by tag)
- `_graph.md` — Knowledge graph (relationships between notes)
- `CONVENTIONS.md` — Writing rules (**read before manual edits**)
- `templates/` — Note templates (`{{}}` placeholders)

## Directory Structure

| Directory | Purpose |
|-----------|---------|
| `areas/` | Long-term focus areas |
| `projects/` | Concrete projects with goals |
| `resources/` | Reference materials |
| `journal/` | Daily logs and weekly reviews |
| `ideas/` | Draft ideas to explore |

## Rules for Manual Edits

If you edit files directly instead of using the CLI:

1. **Read `CONVENTIONS.md` first**
2. **Include complete frontmatter** in new notes
3. **Update `updated` field** when modifying
4. **Update indices**: `_tags.md`, `_graph.md`, directory `_index.md`
5. **Build bidirectional links** via the `related` field
6. **File names**: lowercase with hyphens
7. **Internal links**: `[[filename]]` (no `.md` extension)

## Retrieval

- By tag: check `_tags.md` or grep `tags:.*keyword`
- By type: grep `type: project`
- By status: grep `status: active`
- By summary: grep `summary:`
- By relationship: check `_graph.md` or grep `related:`
- Full text: grep any keyword

## Environment Variables

- `OA_VAULT` — Vault path (so you don't need `--vault` every time)
- `OA_TIMEZONE` — Timezone for dates (default: UTC)
