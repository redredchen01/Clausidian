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
# Install
npm install -g obsidian-agent

# Initialize a new vault
obsidian-agent init ~/my-vault
cd ~/my-vault

# Setup Claude Code integration (MCP server + /obsidian skill)
obsidian-agent setup ~/my-vault

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

# Rename a note (updates all references)
obsidian-agent rename "build-api" "API Gateway"

# Move note to a different type
obsidian-agent move "my-idea" project

# Merge two notes
obsidian-agent merge "draft-api" "build-api"

# Find duplicate notes
obsidian-agent duplicates --threshold 0.4

# Find broken links
obsidian-agent broken-links

# Batch operations
obsidian-agent batch tag --type idea --add "needs-review"
obsidian-agent batch archive --tag "deprecated"
obsidian-agent batch update --type project --set-status active

# Export / Import
obsidian-agent export vault-backup.json
obsidian-agent export --format markdown --type project
obsidian-agent import notes.json

# Regex search
obsidian-agent search "API.*v[23]" --regex

# Smart linking
obsidian-agent link --dry-run          # preview missing links
obsidian-agent link                    # create bidirectional links

# Activity timeline
obsidian-agent timeline --days 7
obsidian-agent timeline --type project

# Vault quality
obsidian-agent validate
obsidian-agent relink --dry-run        # preview broken link fixes
obsidian-agent relink                  # auto-fix broken links

# Pin favorites
obsidian-agent pin "important-note"
obsidian-agent pin list
obsidian-agent unpin "important-note"

# Daily dashboard
obsidian-agent daily

# Improvement suggestions
obsidian-agent suggest

# Word count stats
obsidian-agent count
obsidian-agent count --type project

# Pending tasks
obsidian-agent agenda
obsidian-agent agenda --all

# Vault changelog
obsidian-agent changelog --days 14

# Graph exploration
obsidian-agent neighbors "my-project" --depth 3

# Serendipity
obsidian-agent random 3
obsidian-agent random --type idea

# What to work on
obsidian-agent focus
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
| `read <note>` | Read a note's full content (supports `--section`) |
| `recent [days]` | Show recently updated notes (default: 7 days) |
| `delete <note>` | Delete a note and clean up references |
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
| `rename <note> <title>` | Rename a note and update all references |
| `move <note> <type>` | Move note to a different type/directory |
| `merge <source> <target>` | Merge source note into target (body + tags + refs) |
| `duplicates` | Find potentially duplicate notes by similarity |
| `broken-links` | Find broken `[[wikilinks]]` pointing to non-existent notes |
| `batch update` | Batch update matching notes (`--set-status`, `--set-summary`) |
| `batch tag` | Batch add/remove tags (`--add`, `--remove`) |
| `batch archive` | Batch archive matching notes |
| `export [output]` | Export notes to JSON or markdown (`--format json\|markdown`) |
| `import <file>` | Import notes from JSON or markdown file |
| `link` | Auto-link related but unlinked notes (`--dry-run`, `--threshold`) |
| `timeline` | Chronological activity feed (`--days`, `--type`, `--limit`) |
| `validate` | Check frontmatter completeness and find issues |
| `pin <note>` | Pin a note as favorite |
| `unpin <note>` | Unpin a note |
| `pin list` | Show all pinned notes |
| `relink` | Fix broken links with closest matches (`--dry-run`) |
| `suggest` | Actionable vault improvement suggestions (orphans, stale notes, tag consolidation) |
| `daily` | Daily dashboard (journal status, activity, pinned, projects) |
| `count` | Word/line/note count statistics (`--type`) |
| `agenda` | Pending TODO items from journals & projects (`--days`, `--all`) |
| `changelog [output]` | Generate vault changelog from recent activity (`--days`) |
| `neighbors <note>` | Show connected notes within N hops (`--depth`) |
| `random [count]` | Pick random note(s) for serendipitous review |
| `focus` | Suggest what to work on next (pinned > momentum > stale > ideas) |
| `health` | Vault health scoring (completeness, connectivity, freshness, organization) |
| `setup [vault-path]` | Install MCP server + `/obsidian` skill for Claude Code |
| `watch` | Auto-rebuild indices on file changes |
| `serve` | Start MCP server (stdio transport) |
| `hook <event>` | Handle agent hook events |
| `bridge-status` | Show Obsidian CLI bridge status |
| `smart-search <query>` | BM25 ranked search (better relevance than keyword) |
| `canvas create <name>` | Create a JSON Canvas (.canvas) file |
| `canvas read <name>` | Read and display canvas structure |
| `canvas add-node <name>` | Add a node (text/file/link/group) to a canvas |
| `canvas add-edge <name>` | Add an edge between canvas nodes |
| `embed-search <query>` | Semantic search via Ollama/OpenAI embeddings (optional) |
| `embed-status` | Show embedding provider status |
| `base create <name>` | Create an Obsidian Base (.base) file |
| `base read <name>` | Read and parse a .base file |
| `base query <name>` | Query vault notes using base filters |

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
| `--regex` | Treat search keyword as regex pattern |
| `--threshold <0-1>` | Duplicate similarity threshold (default: 0.5) |
| `--format <json\|md>` | Export format (default: json) |
| `--set-status <status>` | New status for batch update |
| `--add <tag>` | Tag to add (batch tag) |
| `--remove <tag>` | Tag to remove (batch tag) |
| `--all` | Scan all notes for agenda (not just recent) |
| `--depth <N>` | Max hops for neighbors (default: 2) |
| `--dry-run` | Preview changes without applying (for link, relink) |
| `--days <N>` | Days to look back for timeline (default: 30) |
| `--limit <N>` | Max entries for timeline (default: 50) |
| `--no-bridge` | Skip Obsidian CLI bridge for this command |

## Fuzzy Note Lookup

Commands that take a note name support fuzzy matching — no need to type the exact filename:

```bash
# Exact
obsidian-agent read build-api

# Case-insensitive
obsidian-agent read Build-API

# Partial match
obsidian-agent read vector          # finds "vector-search"

# Title match
obsidian-agent read "Build API"     # finds "build-api"
```

Works with: `read`, `delete`, `update`, `archive`, `patch`, `backlinks`, `rename`, `move`, `merge`, `pin`, `unpin`.

## Search Relevance

Search results are ranked by relevance score:

| Match Location | Score |
|---------------|-------|
| Title | 10 |
| Filename | 8 |
| Tags | 5 |
| Summary | 3 |
| Body text | 1 |

```bash
obsidian-agent search "API"         # title matches appear first
obsidian-agent search "API.*v2" --regex   # regex pattern matching
```

## BM25 Smart Search (v1.3+)

`smart-search` uses the BM25 algorithm (same as Elasticsearch/Lucene) for significantly better search results than keyword matching:

```bash
obsidian-agent smart-search "API design patterns"   # multi-word queries work naturally
obsidian-agent smart-search "REST endpoints" --type project  # with filters
```

**How it works:**
- Builds an inverted index across all notes
- Field weighting: title (3×), tags (2×), summary (2×), body (1×)
- English stemming: "designing" matches "design", "designed", "designs"
- Stop word removal (English + Chinese)
- Document length normalization — short and long notes compete fairly

Use `search` for exact keyword/regex matching, `smart-search` for natural language queries.

## JSON Canvas (v1.3+)

Read and write [JSON Canvas](https://jsoncanvas.org) (`.canvas`) files — Obsidian's visual whiteboard format:

```bash
obsidian-agent canvas create my-board          # create empty canvas
obsidian-agent canvas add-node my-board --type text --text "Hello"
obsidian-agent canvas add-node my-board --type file --file "projects/api.md"
obsidian-agent canvas add-node my-board --type link --url "https://example.com"
obsidian-agent canvas add-edge my-board --from node1 --to node2 --label "depends on"
obsidian-agent canvas read my-board            # display structure
```

Supports all node types (text, file, link, group) and edges with labels and colors.

## Obsidian Bases (v1.5+)

Read, write, and query [Obsidian Bases](https://help.obsidian.md/bases) (`.base` files) — structured data views over vault notes:

```bash
obsidian-agent base create project-tracker    # create .base file
obsidian-agent base read project-tracker      # display structure
obsidian-agent base query project-tracker     # query matching notes
obsidian-agent base query project-tracker --view "Active"  # specific view
```

Bases use YAML with filters, views, and formulas. obsidian-agent can execute filter expressions headlessly:

```yaml
# project-tracker.base
filters:
  and:
    - file.hasTag("project")
    - status != "archived"
views:
  - type: table
    name: Active Projects
```

Supported filter expressions: `file.hasTag()`, `file.inFolder()`, `== / !=` comparisons.

## Embedding Search (v1.4+, Optional)

For true semantic search, `embed-search` uses external embedding providers — zero npm dependencies, just native `fetch`:

```bash
obsidian-agent embed-search "how to design good APIs"  # auto-detects provider
obsidian-agent embed-status                             # check what's available
```

**Provider detection order:**
1. **Ollama** (local, offline) — detects `localhost:11434`, uses `nomic-embed-text`
2. **OpenAI** — reads `OA_OPENAI_KEY` or `OPENAI_API_KEY` env var
3. **BM25 fallback** — if no provider available, falls back to `smart-search`

Embeddings are cached in `.obsidian-agent/embeddings.json` with incremental updates — only changed notes are re-embedded.

```bash
# Use specific provider
obsidian-agent embed-search "query" --provider ollama
obsidian-agent embed-search "query" --provider openai

# Disable embedding, force BM25
obsidian-agent embed-search "query" --provider off
```

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

## Claude Code Setup (One Command)

```bash
obsidian-agent setup ~/my-vault
```

This automatically:
1. Installs the `/obsidian` skill to `~/.claude/skills/obsidian/`
2. Registers the MCP server in `~/.claude/.mcp.json`
3. After restart, type `/obsidian` in any Claude Code session to manage your vault

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

Exposes 55+ tools including: journal, note, capture, search, smart_search, embed_search, list, read, recent, delete, backlinks, update, archive, patch, stats, orphans, graph, health, sync, tag_list, tag_rename, rename, move, merge, duplicates, broken_links, batch_update, batch_tag, batch_archive, export, neighbors, random, focus, canvas (create/read/add-node/add-edge), base (create/read/query), embed_status, bridge_status, and more.

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

## Knowledge Precipitation (v0.9+)

Five automated rules that help knowledge settle from journals into permanent notes:

| Rule | Command | What it does |
|------|---------|-------------|
| A1: Promotion Suggestions | `review` | Scans weekly journals for topics appearing 2+ days → suggests promotion to projects/resources |
| A2: Idea Temperature | `health` | Tracks idea freshness: 🆕 new, 🔥 active, 🧊 frozen (14d), 💀 archive (30d) |
| A3: Staleness Detection | `review monthly` | Flags resources >60d stale, active projects >30d dormant, dead ideas |
| A4: Conclusion Extraction | `hook session-stop` | Auto-tags journals with #conclusion or #resolved based on content |
| A5: Link Suggestions | `sync` | Finds note pairs sharing 2+ tags but missing related links |

These rules run automatically as part of existing commands — no extra setup needed. Over time, they ensure your vault stays organized: ideas get promoted or archived, stale notes get flagged, and connections between notes are surfaced.

## Obsidian CLI Bridge (v1.2+)

When [Obsidian 1.12+ CLI](https://help.obsidian.md/cli) is installed, obsidian-agent automatically bridges supported commands (search, read, backlinks, orphans, tags, random) to the official CLI for richer results that leverage Obsidian's indexing.

Commands unique to obsidian-agent (health, graph, review, PARA init, link, suggest, focus, batch ops, etc.) always run natively — these have no official CLI equivalent.

```bash
obsidian-agent bridge-status         # Check if official CLI is detected
obsidian-agent search foo --no-bridge # Force native search
OA_NO_OFFICIAL_CLI=1 obsidian-agent search foo  # Disable bridge globally
```

The bridge is transparent: if the official CLI fails or is unavailable, obsidian-agent falls back to its native implementation automatically.

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `OA_VAULT` | Default vault path | cwd |
| `OA_TIMEZONE` | Timezone for dates | UTC |
| `OA_NO_OFFICIAL_CLI` | Set to `1` to disable Obsidian CLI bridge | (auto-detect) |

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
