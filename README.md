# Session Wrap Skill

Universal session wrap-up: automatically persist project context to memory files for seamless resume.

Works with Claude Code and any AI agent (Cursor, Windsurf, Cline, Continue.dev, etc.)

## Features

- 🔄 **Auto-save session context** — Save all important state at session end
- 🧠 **Memory integration** — Persist to structured memory files
- 📚 **Knowledge sync** — Auto-sync Obsidian vaults to memory
- 🎯 **Quick resume** — Next session loads full context automatically
- ⚙️ **Zero setup** — Just source the aliases and go

## Installation

### npm

```bash
npm install -g session-wrap-skill
```

### Manual

```bash
git clone https://github.com/redredchen01/session-wrap-skill.git
cd session-wrap-skill
chmod +x session-wrap.sh obsidian-sync.sh
source .zshrc-wrap
```

## Usage

### Quick Start

```bash
# Load aliases (add to ~/.zshrc for auto-load)
source .zshrc-wrap

# During work
wrap                    # Save session
wrap "Feature done"     # Save with note
mem                     # Check memory status

# End of session
wrap "All tasks complete"
```

### Full Workflow

```bash
# Session start
yd-start-session        # Load context from last wrap

# Work...

# Session end
yd-end-session "Notes"  # Save and show checklist
```

## Files

- `session-wrap.sh` — Core automation script
- `obsidian-sync.sh` — Knowledge vault sync
- `.zshrc-wrap` — Aliases and workflow functions
- `package.json` — npm metadata

## Configuration

Set these env vars to customize:

```bash
export YD_WORKSPACE="/Users/dex/YD 2026"
export YD_MEMORY="/Users/dex/.claude/projects/-Users-dex-YD-2026/memory"
export YD_OBSIDIAN="$YD_WORKSPACE/obsidian"
```

## How It Works

```
Session End Trigger
    ↓
session-wrap.sh runs
    ├─ Generate session_YYYYMMDD_wrap.md
    ├─ Sync Obsidian → Memory
    ├─ Update MEMORY.md index
    └─ Git commit
    ↓
Next session loads context
```

## Integrations

### Claude Code
Add to `~/.claude/settings.json` PostToolUse hooks:
```json
{
  "type": "command",
  "command": "cd ~/path && bash ./session-wrap.sh",
  "statusMessage": "Saving session..."
}
```

### Other Editors
Works with Cursor, Windsurf, Cline, Continue.dev, and any agent with shell access.

## License

MIT

## Author

redredchen01

---

**Last updated:** 2026-03-26
