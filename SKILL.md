---
name: session-wrap
version: 2.1.1
description: |
  Universal session wrap-up: automatically persist project context to memory files for seamless resume.
  Works with ANY AI agent — Claude Code, Codex, Gemini CLI, Cursor, Windsurf, Cline, Roo Code,
  Aider, Continue.dev, Copilot, Amp, OpenClaw, Devin, bolt.new, and any future agent framework.
  Use when: user says "收工", "wrap up", "結束", "整理記憶", "resume準備", "保存上下文",
  "下次繼續", "先到這", "今天先這樣", "done for now", "save context", "end session",
  "今日はここまで", or any session-ending intent in any language.
  Also trigger proactively when a major milestone is reached and user seems done.
allowed-tools:
  - Bash
  - Read
  - Write
  - Glob
  - Grep
---

# Session Wrap — Universal Agent Memory Persistence

Capture project state at session end so the next session resumes with full context. Works with **any AI agent** that can read files — coding agents, personal assistants, multi-channel bots.

**Problem**: AI agents lose all context between sessions. Users waste time re-explaining context.
**Solution**: Structured memory files that any agent auto-loads on next session start.

## Trigger Keywords

| Language | Keywords |
|----------|----------|
| 中文 | 收工、結束、整理記憶、先到這、今天先這樣、下次繼續、保存上下文、開新對話 |
| English | wrap up, done for now, save context, end session, call it a day, let's stop here |
| 日本語 | 終了、今日はここまで、保存して |

Also trigger proactively when: major milestone reached, user signals finality, or context window is filling up.

## Step 1: Detect Platform & Memory Path

Detect which agent you are and choose the correct persistence mechanism.

### Platform Detection Table

| Platform | How to detect | Memory write path | Instructions file (read on boot) |
|----------|--------------|-------------------|----------------------------------|
| **Claude Code** | Has `~/.claude/` dir or CLAUDE_* env vars | `~/.claude/projects/<hash>/memory/` (auto-memory system) | `CLAUDE.md` (3 layers) |
| **Codex** (OpenAI) | Running as Codex CLI, or AGENTS.md present | `.ai-memory/` in project root | `AGENTS.md` |
| **Gemini CLI** | Has `~/.gemini/` dir or GEMINI.md present | `.ai-memory/` in project root | `GEMINI.md` (3 layers) |
| **Cursor** | Has `.cursor/` dir | `.cursor/memory/` | `.cursorrules` or `.cursor/rules/*.mdc` |
| **Windsurf** | Has `.windsurf/` dir or `.windsurfrules` | Windsurf internal Memories DB (also write `.ai-memory/` as fallback) | `.windsurfrules` |
| **Cline** | Has `.cline/` dir or `.clinerules` | `.cline/memory/` (Memory Bank) | `.clinerules` or `.cline/rules/` |
| **Roo Code** | Has `.roo/` dir or `.roorules` | `.roo/memory/` | `.roo/rules/` |
| **Aider** | Has `.aider.conf.yml` | `.ai-memory/` (load via `--read` flag) | `.aider.conf.yml` |
| **Continue.dev** | Has `.continue/` dir | `.ai-memory/` | `.continuerules` or `.continue/rules/` |
| **GitHub Copilot** | Has `.github/copilot-instructions.md` | `.ai-memory/` | `.github/copilot-instructions.md` |
| **Amp** | Has `AGENT.md` (Sourcegraph style) | `.ai-memory/` | `AGENT.md` (3 layers) |
| **OpenClaw** | Has `~/.openclaw/` dir or `openclaw.json` | `~/.openclaw/workspace/memory/` or `<workspace>/memory/` | `AGENTS.md` + `SOUL.md` in workspace |
| **Devin** | Cloud environment | Write `.ai-memory/` in repo (Devin syncs from repo) | Cloud Knowledge base |
| **bolt.new** | WebContainer environment | Write `.ai-memory/` in project | UI System Prompt |
| **Unknown** | None of above detected | `.ai-memory/` in project root | — |

**Detection order**: Check platform-specific dirs/env vars in the order above. First match wins.

**Fallback**: If platform is unknown or lacks native memory, always use `.ai-memory/` in project root — it's the universal convention this skill establishes.

### Cross-Platform Compatibility

For agents WITHOUT native memory (Codex, Gemini CLI, Aider, Copilot, etc.), also append a boot instruction to their instructions file so memory gets loaded next session:

```
# Auto-Memory
On session start, read all .md files in .ai-memory/ directory for project context from previous sessions.
```

This one-liner goes into `AGENTS.md`, `GEMINI.md`, `AGENT.md`, `.github/copilot-instructions.md`, or equivalent. Only add it once (check if already present).

## Step 2: Gather State

Run in parallel:

1. **Git state** (if in a git repo):
   - `git log --oneline -15`
   - `git status --short`
   - `git branch --show-current`
   - `git remote -v`
2. **Existing memory files**: scan the memory directory for files to update vs create
3. **Project artifacts**: README, config files (package.json, pyproject.toml, go.mod, Cargo.toml, etc.)
4. **Non-git projects**: scan directory structure and file modification times instead

## Step 3: Analyze & Categorize

| Memory Type | What to capture | Examples |
|-------------|----------------|----------|
| **project** | Status, version, done/pending, repo URL, branch | "v2.1 released, auth refactor on feat/auth" |
| **feedback** | Lessons, gotchas, patterns discovered | "Integration tests need real DB, not mocks" |
| **user** | Preferences, workflow style | "Prefers TDD, terse responses, uses vim" |
| **reference** | External resources, URLs, tools | "API docs at internal.company.com/api" |

**Rules**:
- **Update over create** — same topic → update existing file
- **Distill, don't dump** — extract signal, discard noise
- **Absolute dates** — "today" → "2026-03-25"
- **No ephemeral state** — no debug sessions, no temp paths
- **No code-derivable info** — architecture, API signatures belong in code
- **No git-trackable info** — commit history, diffs → use `git log`

## Step 4: Write Memory Files

Universal format (works with any agent that can read markdown):

```markdown
---
name: {{descriptive name}}
description: {{one-line summary for relevance judgment}}
type: {{project|feedback|user|reference}}
updated: {{YYYY-MM-DD}}
platform: {{claude-code|codex|gemini|cursor|windsurf|cline|roo|openclaw|universal}}
---

{{content}}
```

File naming: `{type}_{topic}.md` (e.g., `project_myapp.md`, `feedback_testing.md`)

## Step 5: Update Index

Write/update `MEMORY.md` as the index:

```markdown
# Memory Index

## Project
- [Topic](filename.md) — one-line description

## Feedback
- [Topic](filename.md) — one-line description

## User
- [Topic](filename.md) — one-line description

## Reference
- [Topic](filename.md) — one-line description
```

Keep under 200 lines. Organized by type.

## Step 6: Ensure Next-Session Bootstrap

**Critical step for agents without native memory.**

Check if the agent's instructions file exists and already has a memory-loading directive. If not, append one:

| Agent | File to check/modify | Directive to add |
|-------|---------------------|------------------|
| Codex | `AGENTS.md` | `# Memory\nOn start, read .ai-memory/*.md for prior session context.` |
| Gemini CLI | `GEMINI.md` | Same pattern |
| Amp | `AGENT.md` | Same pattern |
| Copilot | `.github/copilot-instructions.md` | Same pattern |
| Aider | `.aider.conf.yml` | Add `read:` entries pointing to `.ai-memory/` files |
| Cursor | `.cursor/rules/memory.mdc` | Create rule that reads `.cursor/memory/` on session start |
| Continue | `.continuerules` | Same pattern as AGENTS.md |
| OpenClaw | `~/.openclaw/workspace/AGENTS.md` | `# Memory\nOn start, read memory/*.md in workspace for prior session context.` |

**Do NOT modify** these files if running inside Claude Code (it has native memory) or Windsurf (has native Memories DB).

## Step 7: Confirm

Report with summary table:

```
記憶已更新：

| 檔案 | 動作 | 內容 |
|------|------|------|
| project_myapp.md | 更新 | v2.1 完成，auth 重構進行中 |
| feedback_testing.md | 新增 | 整合測試用 real DB |
| AGENTS.md | 更新 | 加入 memory bootstrap 指令 |

平台: Codex | 記憶路徑: .ai-memory/
下次開新對話會自動載入這些上下文。
```

## Anti-patterns

- **Don't dump the entire session** — distill to what matters for future sessions
- **Don't persist what git tracks** — commit history, file contents, diffs
- **Don't persist task lists** — session-scoped only
- **Don't persist code snippets** — they go stale, point to file + line
- **Don't create memory for trivial sessions** — say so and skip
- **Don't over-categorize** — 3-5 memory files is typical, 10+ is too many
- **Don't break existing instructions files** — append, don't overwrite

## Edge Cases

| Case | Handling |
|------|---------|
| No git repo | Skip git gathering, use directory listing + file mtimes |
| First session ever | Create all files from scratch, briefly explain the system |
| Nothing to save | Tell user "本次 session 沒有需要持久化的新資訊" |
| Conflicting memories | Update file, note what changed and why |
| Multiple projects | Each project gets its own memory directory |
| Cloud-only agent (Devin, bolt.new) | Write `.ai-memory/` in repo, agent syncs on next run |
| Agent can't write files | Output memory content as text, ask user to save manually |
