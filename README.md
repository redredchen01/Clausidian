# Session Wrap Skill v3.4.0

**Agent-native session management for seamless multi-agent coordination.**

Automatically persist project context, track decisions, and enable agents to share memory for long-term coherent development.

Works with Claude Code, Cursor, Windsurf, Cline, Aider, and any AI agent.

## ✨ What's New (v3.4.0)

Transform from manual session saving → **agent infrastructure** for multi-agent workflows.

### 7 New Agent Tools

| Tool | Purpose | Usage |
|------|---------|-------|
| **agent-context** | Auto-inject project context on startup | `agent-context` |
| **agent-share** | Cross-agent memory sharing | `agent-share write/read/list` |
| **agent-decision** | Decision logging + reasoning chains | `agent-decision log/list/search` |
| **agent-checkpoint** | Checkpoint & rollback system | `agent-checkpoint save/restore` |
| **agent-knowledge** | Project knowledge base | `agent-knowledge set/get/list` |
| **agent-optimize** | Smart memory optimization | `agent-optimize stats/archive/prune` |
| **agent-tasks** | Task dependency graph | `agent-tasks add/done/next/claim` |

## Features

- 🤖 **Agent-native** — 7 tools designed for multi-agent coordination
- 🧠 **Decision tracking** — Remember *why* decisions were made
- 🔄 **Context injection** — Agents load project context automatically
- 👥 **Memory sharing** — Agent A's output feeds to Agent B
- 📋 **Task coordination** — Avoid conflicts with dependency graph
- 📚 **Knowledge base** — Persistent project conventions & architecture
- ⚙️ **Auto-optimize** — Keep memory lean for context windows
- 🔐 **Git-backed** — Checkpoints with full rollback support

## 📚 Documentation

Start here based on your needs:

| Guide | Purpose |
|-------|---------|
| **[README.md](README.md)** (you are here) | Feature overview & quick reference |
| **[QUICKSTART-EXAMPLES.md](QUICKSTART-EXAMPLES.md)** | 3 real-world copy-paste examples |
| **[AGENT-WORKFLOW.md](AGENT-WORKFLOW.md)** | 6 workflow patterns + best practices |
| **[INTEGRATIONS.md](INTEGRATIONS.md)** | Claude Code, Cursor, Windsurf setup |
| **[PRODUCTION-SETUP.md](PRODUCTION-SETUP.md)** | Deploy backend to Railway/Docker/VPS |

### Quick Path to Success

1. **First 5 min:** Read [QUICKSTART-EXAMPLES.md](QUICKSTART-EXAMPLES.md) → Copy Example 1
2. **First session:** Follow Example 1, save your first session wrap
3. **Multi-agent:** When ready, follow [AGENT-WORKFLOW.md](AGENT-WORKFLOW.md) Pattern 2
4. **Team setup:** See [INTEGRATIONS.md](INTEGRATIONS.md) for your editor

## Installation

### npm (Recommended)

```bash
npm install -g session-wrap-skill
```

### Manual

```bash
git clone https://github.com/redredchen01/session-wrap-skill.git
cd session-wrap-skill
chmod +x scripts/*.sh
source .zshrc-wrap
```

## Quick Start

### 1. Load Aliases

```bash
# Add to ~/.zshrc
source ~/.zshrc-wrap
```

### 2. Agent Workflow

```bash
# At agent startup
agent-context               # Load project context

# During work
agent-decision log "auth" "use JWT" "balance speed & security"
agent-tasks claim my-task
# ... work ...
agent-tasks done my-task

# End of session
wrap "Completed auth system"
```

### 3. Multi-Agent Coordination

```bash
# Agent A publishes state
agent-share write agent-a-state ~/my-progress.md

# Agent B reads it
agent-share read agent-a-state

# Show next executable tasks
agent-tasks next
```

## Commands

### agent-context
Load project context for agent startup.
```bash
agent-context              # Show compact context
agent-context full         # Show full context with decisions & knowledge
```

### agent-share
Cross-agent memory sharing.
```bash
agent-share write <agent-id> <file>   # Publish agent state
agent-share read <agent-id>           # Read another agent's state
agent-share list                      # List active agents
agent-share clean                     # Remove stale states (>24h)
```

### agent-decision
Log decisions with reasoning chains.
```bash
agent-decision log <topic> <decision> <reasoning>
agent-decision list
agent-decision search <keyword>
```

### agent-checkpoint
Create checkpoints and rollback on errors.
```bash
agent-checkpoint save [label]         # Create checkpoint
agent-checkpoint list                 # Show all checkpoints
agent-checkpoint restore <id>         # Rollback to checkpoint
agent-checkpoint diff <id>            # Show changes since checkpoint
```

### agent-knowledge
Manage project knowledge base.
```bash
agent-knowledge set <topic> <content>
agent-knowledge get <topic>
agent-knowledge list
agent-knowledge context               # For use in agent-context
```

### agent-optimize
Smart memory optimization.
```bash
agent-optimize stats                  # Show breakdown
agent-optimize archive                # Keep last 3 sessions
agent-optimize summarize              # Compress old sessions
agent-optimize prune [--dry-run]      # Remove empty files
```

### agent-tasks
Coordinate multi-agent task execution.
```bash
agent-tasks add <id> <description> [depends-on...]
agent-tasks done <id>
agent-tasks next                      # Show executable tasks
agent-tasks status                    # Full task graph
agent-tasks claim <id> [agent-id]     # Claim task to avoid conflicts
```

## Agent Hook Integration

### Claude Code

Add to `~/.claude/settings.json` (PostToolUse hook):

```json
{
  "type": "command",
  "command": "cd ~/YD\\ 2026 && bash scripts/session-wrap.sh",
  "statusMessage": "Saving session with agent tools..."
}
```

### Cursor / Windsurf / Others

Any agent with shell access can use:

```bash
# Load context at startup
eval "$(agent-context)"

# Log decisions during work
agent-decision log "feature-x" "implemented via hooks" "better DX"

# Show next task
agent-tasks next

# Save progress at end
wrap "Completed feature X"
```

## Memory Structure

```
~/.claude/projects/-Users-dex-YD-2026/memory/
├── MEMORY.md                 # Master index
├── session_*.md              # Session wraps
├── decisions/                # Decision logs
│   └── YYYY-MM-DD-topic.md
├── knowledge/                # Project knowledge
│   ├── conventions.md
│   ├── architecture.md
│   ├── known-issues.md
│   └── tech-stack.md
├── checkpoints/              # Git checkpoints
│   ├── manifest.json
│   └── YYYYMMDD-HHMMSS.snapshot
├── agents/                   # Agent states
│   ├── agent-a-state.md
│   └── agent-b-state.md
└── tasks/                    # Task dependency graph
    └── tasks.json
```

## Why This Matters

### Before v3.4.0
- Manual context loading between sessions
- No way for agents to coordinate
- Decision history lost
- Long projects become incoherent

### After v3.4.0
- **Auto context injection** — Agents start with full project knowledge
- **Decision tracking** — Why decisions were made is preserved
- **Memory sharing** — Agent A's work feeds to Agent B
- **Task coordination** — Multiple agents work on same project without conflicts
- **Long-term projects** — Context never lost, decisions never forgotten

## Configuration

Set environment variables to customize:

```bash
export YD_WORKSPACE="/Users/dex/YD 2026"
export YD_MEMORY="/Users/dex/.claude/projects/-Users-dex-YD-2026/memory"
export YD_OBSIDIAN="$YD_WORKSPACE/obsidian"
export SESSION_WRAP_API_URL="http://localhost:3000"  # Optional: cloud sync
```

## Backend (Optional)

For cloud synchronization and dashboard, see [session-wrap-backend](https://www.npmjs.com/package/session-wrap-backend).

Deploy to Railway: `DEPLOY_RAILWAY.md`

## Files

- `scripts/session-wrap.sh` — Core session wrapping
- `scripts/obsidian-sync.sh` — Knowledge vault sync
- `scripts/agent-*.sh` — 7 agent coordination tools
- `.zshrc-wrap` — Aliases and workflow aliases
- `package.json` — npm metadata

## How It Works

```
Agent Workflow (v3.4.0)

Session Start
    ├─ agent-context loads project context
    ├─ agent-tasks shows next executable tasks
    └─ agent-knowledge provides conventions

During Work
    ├─ agent-decision logs decisions
    ├─ agent-checkpoint creates savepoints
    └─ agent-share publishes progress

Session End
    ├─ session-wrap.sh saves wrap
    ├─ agent-optimize archives old sessions
    └─ task status updated for next agent
```

## Examples

### Example 1: Single Agent with Context

```bash
# Start session
source ~/.zshrc-wrap
agent-context              # Load project context

# Work on feature
agent-decision log "caching" "use Redis" "performance vs complexity"

# End session
wrap "Implemented caching layer"
```

### Example 2: Multi-Agent Collaboration

```bash
# Agent A: Implements API
agent-tasks add "api-design" "Design REST API"
agent-tasks claim "api-design" "codex"
# ... work ...
agent-decision log "api" "use GraphQL" "better type safety"
agent-tasks done "api-design"
agent-share write codex ~/api-design.md

# Agent B: Implements frontend
agent-share read codex                    # Get API design
agent-tasks add "frontend" "Build UI" "api-design"
agent-tasks claim "frontend" "cursor"
agent-tasks next                          # Shows "api-design" is done, can start
# ... work ...

# Both agents coordinated without stepping on each other
```

### Example 3: Long-Term Project

```bash
# Week 1
wrap "Completed auth system"
agent-decision log "auth" "use JWT tokens" "stateless, scales well"

# Week 2 (new session)
agent-context                             # See all past decisions
agent-tasks next                          # See incomplete tasks
agent-knowledge get "architecture"        # Understand design

# No context loss, decisions preserved, work continues seamlessly
```

## License

MIT

## Author

redredchen01

---

**v3.4.0** — Agent-native session management for seamless multi-agent workflows.

For updates: https://github.com/redredchen01/session-wrap-skill
