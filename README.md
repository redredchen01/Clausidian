# obsidian-agent

CLI toolkit for AI agents to manage Obsidian vaults. Zero dependencies. Works with **any** AI agent — Claude Code, Cursor, Copilot, Cline, Windsurf, Codex, and more.

## Why

AI agents are great at managing knowledge, but they need structure. `obsidian-agent` provides:

- **Structured vault** with frontmatter conventions, templates, and auto-linking
- **CLI interface** that any agent can call — no agent-specific integration needed
- **Automatic indices** — tag index, knowledge graph, directory indexes
- **Agent configs** generated for Claude Code, Cursor, Copilot out of the box

Your agent reads the vault's `AGENT.md`, learns the conventions, and uses `obsidian-agent` CLI to create notes, journals, reviews — all with proper metadata and bidirectional links.

## Install

```bash
npm install -g obsidian-agent
```

## Quick Start

```bash
# Initialize a new vault
obsidian-agent init ~/my-vault
cd ~/my-vault

# Create today's journal
obsidian-agent journal

# Create a project note
obsidian-agent note "Build API" project --tags "backend,api"

# Capture an idea
obsidian-agent capture "Use vector search for note retrieval"

# Search notes
obsidian-agent search "API" --type resource

# List active projects
obsidian-agent list project --status active

# Generate weekly review
obsidian-agent review

# Generate monthly review
obsidian-agent review monthly

# What links to this note?
obsidian-agent backlinks "build-api"

# Update a note's metadata
obsidian-agent update "build-api" --status active --summary "Core API"

# Archive a completed project
obsidian-agent archive "old-project"

# Vault statistics
obsidian-agent stats

# Generate Mermaid knowledge graph
obsidian-agent graph

# Find orphan notes (no inbound links)
obsidian-agent orphans

# Tag management
obsidian-agent tag list
obsidian-agent tag rename "old-tag" "new-tag"

# Rebuild indices
obsidian-agent sync
```

## Vault Structure

After `obsidian-agent init`, your vault looks like:

```
my-vault/
├── areas/          # Long-term focus areas
├── projects/       # Concrete projects with goals
├── resources/      # Reference materials
├── journal/        # Daily logs & weekly reviews
├── ideas/          # Draft ideas
├── templates/      # Note templates ({{}} placeholders)
├── _index.md       # Vault index
├── _tags.md        # Tag → note mapping (auto-generated)
├── _graph.md       # Knowledge graph (auto-generated)
├── CONVENTIONS.md  # Writing & agent rules
├── AGENT.md        # Agent instructions
├── .claude/commands/  # Claude Code slash commands
├── .cursor/rules/     # Cursor rules
└── .github/copilot/   # Copilot instructions
```

## How It Works

### For Humans
1. Open the vault in Obsidian
2. Start your AI agent in the vault directory
3. The agent reads `AGENT.md` and knows how to operate

### For Agents
The agent uses CLI commands to manage notes:

```bash
# The agent runs these commands in your terminal
obsidian-agent note "Learn Rust" project --tags "coding,learning"
obsidian-agent capture "Idea for a new feature"
obsidian-agent sync
```

Each command:
- Creates notes with proper frontmatter
- Automatically finds and links related notes
- Updates tag index (`_tags.md`) and knowledge graph (`_graph.md`)
- Maintains bidirectional `related` links

### Frontmatter Schema

Every note has structured YAML frontmatter:

```yaml
---
title: "My Note"
type: project          # area | project | resource | journal | idea
tags: [backend, api]
created: 2026-03-27
updated: 2026-03-27
status: active         # active | draft | archived
summary: "One-line description for agent retrieval"
related: ["[[other-note]]", "[[another-note]]"]
---
```

## Commands

| Command | Description |
|---------|-------------|
| `init <path>` | Initialize a new vault with templates & agent configs |
| `journal` | Create/open today's journal entry |
| `note <title> <type>` | Create a note (area/project/resource/idea) |
| `capture <idea>` | Quick idea capture to `ideas/` |
| `search <keyword>` | Full-text search across all notes |
| `list [type]` | List notes with filters |
| `review` | Generate weekly review from journals |
| `review monthly` | Generate monthly review from weekly reviews & journals |
| `sync` | Rebuild `_tags.md` and `_graph.md` indices |
| `backlinks <note>` | Show notes that link to a given note |
| `update <note>` | Update note frontmatter (status, tags, summary) |
| `archive <note>` | Set note status to archived |
| `stats` | Show vault statistics (counts, top tags, orphans) |
| `graph` | Generate Mermaid knowledge graph diagram |
| `orphans` | Find notes with no inbound links |
| `tag list` | List all tags with counts |
| `tag rename <old> <new>` | Rename a tag across the vault |
| `patch <note>` | Edit a section by heading (`--heading`, `--append/--prepend/--replace`) |
| `health` | Vault health scoring (completeness, connectivity, freshness, organization) |
| `watch` | Auto-rebuild indices on file changes |
| `serve` | Start MCP server (stdio transport) |
| `hook <event>` | Handle agent hook events |

### Flags

| Flag | Description |
|------|-------------|
| `--vault <path>` | Vault root (default: cwd or `$OA_VAULT`) |
| `--type <type>` | Filter by note type |
| `--tag <tag>` | Filter by tag |
| `--status <status>` | Filter by status |
| `--recent <days>` | Show notes updated in last N days |
| `--date <YYYY-MM-DD>` | Specify date for journal/review |
| `--year <YYYY>` | Year for monthly review |
| `--month <MM>` | Month for monthly review (1-12) |
| `--summary <text>` | Set note summary (for update) |
| `--tags <a,b,c>` | Set tags (for note/update) |

## JSON Output

All commands support `--json` for machine-readable output:

```bash
obsidian-agent search "API" --json
obsidian-agent stats --json
obsidian-agent list project --status active --json
```

## Heading-Level Edits

Edit specific sections of a note without rewriting the whole file:

```bash
# Append to a section
obsidian-agent patch "my-project" --heading "TODO" --append "- [ ] New task"

# Replace section content
obsidian-agent patch "my-project" --heading "Notes" --replace "Updated notes here"

# Read a section
obsidian-agent patch "my-project" --heading "TODO"
```

## MCP Server

Run as an [MCP](https://modelcontextprotocol.io/) server for AI assistants (Claude Desktop, Cursor, etc.):

```json
{
  "mcpServers": {
    "obsidian-agent": {
      "command": "obsidian-agent",
      "args": ["serve", "--vault", "/path/to/vault"]
    }
  }
}
```

Exposes 15 tools: journal, note, capture, search, list, backlinks, update, archive, patch, stats, orphans, graph, sync, tag_list, tag_rename.

## Vault Health

```bash
obsidian-agent health
```

Scores your vault across 4 dimensions (0-100 each):
- **Completeness** — frontmatter quality (title, type, tags, summary, created)
- **Connectivity** — links and relationships between notes
- **Freshness** — how recently notes were updated
- **Organization** — tags, types, naming conventions, summaries

## Agent Hooks

Integrate with your agent's hook system for automatic journaling:

### Claude Code

Add to your Claude Code settings (`~/.claude/settings.json`):

```json
{
  "hooks": {
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "obsidian-agent hook session-stop --vault ~/my-vault"
          }
        ]
      }
    ]
  }
}
```

### Cron / LaunchD

```bash
# Daily backfill — creates journal from git history
obsidian-agent hook daily-backfill --vault ~/my-vault --scan-root ~/projects

# Weekly review
obsidian-agent review --vault ~/my-vault

# Monthly review
obsidian-agent review monthly --vault ~/my-vault
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `OA_VAULT` | Default vault path | cwd |
| `OA_TIMEZONE` | Timezone for dates | UTC |

## Agent Compatibility

`obsidian-agent init` generates config files for multiple agents:

| Agent | Config Location |
|-------|----------------|
| Claude Code | `.claude/commands/` (slash commands) |
| Cursor | `.cursor/rules/obsidian.md` |
| GitHub Copilot | `.github/copilot/instructions.md` |
| Any agent | `AGENT.md` (universal instructions) |

All agents read `AGENT.md` which tells them to use the `obsidian-agent` CLI. No agent-specific code needed.

## Customization

### Templates
Edit files in `templates/` to customize note structure. Use `{{PLACEHOLDER}}` syntax.

### Conventions
Edit `CONVENTIONS.md` to change frontmatter rules, naming conventions, or agent behavior.

### Language
Templates ship in English. Replace template content with your preferred language — the CLI doesn't care about content language, only the `{{}}` placeholders.

## Development

```bash
npm test
```

Requires Node.js >= 18. Tests use `node:test` — zero dev dependencies.

## License

MIT
