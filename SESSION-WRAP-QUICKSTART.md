# Session Wrap — Quick Start Guide

Universal agent skill for cloud-enabled session management. Works with Claude Code, Cursor, Windsurf, Cline, and any AI agent.

## 5-Minute Setup

### 1. Load Aliases (One Time)

```bash
# Add to your ~/.zshrc
source ~/YD\ 2026/.zshrc-wrap

# Or run directly for this session
source ~/YD\ 2026/.zshrc-wrap
```

### 2. Set Your Agent Token

```bash
# For Claude Code (most common)
export CLAUDE_CODE_TOKEN=sk_...

# Or for other agents
export CURSOR_TOKEN=sk_...
export WINDSURF_TOKEN=sk_...
export CLINE_TOKEN=sk_...
export AIDER_TOKEN=sk_...
```

### 3. Start Backend (if using cloud sync)

```bash
# Requires Docker
cd ~/YD\ 2026/session-wrap-backend
docker-compose up -d

# Verify it's running
curl http://localhost:3000/health  # Should return {"status":"ok"}
```

### 4. Login to Cloud (Optional)

```bash
wrap login
wrap status    # Verify login
```

## Usage

### Save Session

```bash
# Quick save
wrap

# With summary
wrap "Feature XYZ complete"

# Detailed summary
wrap "
- Completed feature ABC
- Fixed bugs in module XYZ
- All tests passing
"
```

### Cloud Sync

```bash
# Automatic if logged in
# Otherwise just saved locally

# Check status
wrap status

# View cloud history
wrap history

# Logout when done
wrap logout
```

### Obsidian Integration

```bash
# Auto-syncs with every wrap
# View knowledge base
kb

# Edit notes
code ~/YD\ 2026/obsidian
```

## CLI Commands

| Command | Purpose |
|---------|---------|
| `wrap` | Save session locally |
| `wrap "summary"` | Save with custom summary |
| `wrap login` | Login to cloud (optional) |
| `wrap logout` | Logout from cloud |
| `wrap status` | Check login status |
| `wrap history` | View wrap history |
| `wrap help` | Show help |

## What Gets Saved

1. **Local (Always):**
   - Session wrap file: `~/.claude/projects/-Users-dex-YD-2026/memory/session_YYYYMMDD_wrap.md`
   - Obsidian files synced
   - Git checkpoint created

2. **Cloud (If logged in):**
   - Wrap metadata (summary, timestamp, file counts)
   - Memory size statistics
   - Workspace name
   - Agent type

## Multi-Agent Support

✅ Works with:
- Claude Code
- Cursor
- Windsurf
- Cline
- Aider
- Continue.dev
- Copilot
- Any agent with token auth

System auto-detects your agent from environment variables.

## Deployment

### Local Development

```bash
cd ~/YD\ 2026/session-wrap-backend

# Install dependencies
npm install

# Start services
docker-compose up -d

# Check health
curl http://localhost:3000/health
```

### Production (Railway/Render)

1. Connect GitHub repo
2. Set environment variables from `.env.example`
3. Deploy

See `session-wrap-backend/README.md` for detailed instructions.

## Troubleshooting

### "Docker daemon not running"

```bash
# Start Docker
orbstack start
# or open Docker Desktop
```

### "Cannot connect to PostgreSQL"

```bash
# Check containers
docker-compose ps

# Restart database
docker-compose restart db

# View logs
docker-compose logs db
```

### "Login failed"

```bash
# Verify token is correct
echo $CLAUDE_CODE_TOKEN

# Test token validity
curl https://api.claude.ai/user/profile -H "Authorization: Bearer $CLAUDE_CODE_TOKEN"
```

## File Structure

```
~/YD 2026/
├── session-wrap.sh          # Main wrap command (local + cloud)
├── wrap-cli.sh              # Cloud auth CLI
├── .zshrc-wrap              # Aliases & functions
├── obsidian/                # Knowledge base
├── .claude/...              # Memory files
│
└── session-wrap-backend/    # Cloud backend
    ├── src/
    │   ├── index.js         # Express server
    │   ├── middleware/      # Authentication
    │   ├── routes/          # API endpoints
    │   └── db/              # Database schema
    ├── docker-compose.yml   # Local dev
    ├── Dockerfile           # Production
    ├── package.json
    └── README.md            # Full backend docs
```

## Architecture

```
Your Agent (Claude Code / Cursor / Windsurf / Cline / etc.)
    ↓
wrap "Summary"
    ├─ Local save (MEMORY_DIR)
    ├─ Obsidian sync
    ├─ Git checkpoint
    └─ Cloud sync (if logged in)
        ↓
    JWT token stored in ~/.session-wrap/token
        ↓
    PostgreSQL database
```

## Free or Paid?

✅ **100% Free & Open Source**

- Local usage: Completely free
- Cloud sync: Free for users with agent subscriptions (Claude Code, etc.)
- Open source: Self-host or use cloud

## Next Steps

1. **Local Testing:**
   ```bash
   source ~/.zshrc-wrap
   wrap "First test"
   ```

2. **Optional Cloud Sync:**
   ```bash
   docker-compose up -d
   wrap login
   wrap status
   ```

3. **Production:**
   - Deploy backend to Railway/Render
   - Set `SESSION_WRAP_API_URL` environment variable

## Support

- **Backend Issues:** See `session-wrap-backend/README.md`
- **CLI Issues:** See `session-wrap-backend/SKILL.md`
- **Knowledge Base:** Check `~/YD 2026/obsidian/`

---

**Status:** Production Ready ✅
**Last Updated:** 2026-03-26
**Supports:** 7+ AI agents
**Type:** Open source skill
