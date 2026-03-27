# Obsidian Vault — Cursor Rules

This is an agent-managed Obsidian vault. Use the `obsidian-agent` CLI for all vault operations.

## Commands

```bash
obsidian-agent journal              # Create/open today's journal
obsidian-agent note "Title" type    # Create a note (area/project/resource/idea)
obsidian-agent capture "idea"       # Quick idea capture
obsidian-agent search "keyword"     # Search notes
obsidian-agent list [type]          # List notes
obsidian-agent review               # Generate weekly review
obsidian-agent sync                 # Rebuild indices
```

## Rules

- Read `CONVENTIONS.md` before editing notes manually
- All notes need complete YAML frontmatter (title, type, tags, created, updated, status, summary)
- Use `[[filename]]` for internal links (no `.md` extension)
- File names: lowercase with hyphens
- After manual edits, run `obsidian-agent sync` to rebuild indices
- Check `AGENT.md` for full instructions
