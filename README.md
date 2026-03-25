# session-wrap v2.1

**通用 AI Agent 記憶持久化** — 對話結束自動保存上下文，下次無縫接續。支援所有主流 AI 編碼助手。

Universal memory persistence for every AI agent. Say "wrap up" — context survives to the next session.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## 痛點 / The Problem

每次開新 AI 對話：

```
你：我們在做 XXX 專案，用 YYY 技術，上次做到 ZZZ...
你：對，那個 bug 是因為 AAA，我們決定用 BBB 方案...
你：然後 config 在 CCC 路徑，記得要先跑 DDD...
```

**重複解釋上下文 = 浪費時間 + 遺漏關鍵資訊。**

## 解法 / The Solution

```
你：收工
```

AI 自動掃描專案狀態 → 寫入結構化記憶 → 下次自動載入。**零手動操作。**

---

## 支援平台 / Supported Agents

> **v2.1 支援 14+ 個 AI 編碼助手，涵蓋所有主流 agent framework。**

### 有原生記憶的 Agent（直接整合）

| Agent | 記憶路徑 | 備註 |
|-------|---------|------|
| **Claude Code** | `~/.claude/projects/<hash>/memory/` | 完整原生支援，自動載入 |
| **Windsurf** | 內建 Memories DB + `.ai-memory/` 備份 | 雙寫確保不丟失 |
| **Cline** | `.cline/memory/` | Memory Bank 原生整合 |
| **Roo Code** | `.roo/memory/` | 繼承 Cline 機制 |

### 無原生記憶的 Agent（Bootstrap 自動注入）

| Agent | 指令檔 | Bootstrap 方式 |
|-------|--------|---------------|
| **Codex** (OpenAI) | `AGENTS.md` | 自動 append 記憶載入指令 |
| **Gemini CLI** (Google) | `GEMINI.md` | 自動 append 記憶載入指令 |
| **Amp** (Sourcegraph) | `AGENT.md` | 自動 append 記憶載入指令 |
| **GitHub Copilot** | `.github/copilot-instructions.md` | 自動 append 記憶載入指令 |
| **Cursor** | `.cursor/rules/` | 建立 memory rule 檔 |
| **Continue.dev** | `.continuerules` | 自動 append 記憶載入指令 |
| **Aider** | `.aider.conf.yml` | 加入 `read:` 指向記憶檔 |

### 個人 AI 助理平台

| Agent | 記憶路徑 | 備註 |
|-------|---------|------|
| **[OpenClaw](https://github.com/openclaw/openclaw)** | `~/.openclaw/workspace/memory/` | 多頻道 AI 助理（WhatsApp/Telegram/Slack 等），有 workspace 機制 |

### 雲端 Agent

| Agent | 方式 |
|-------|------|
| **Devin** | 寫入 `.ai-memory/`，Devin 從 repo 同步 |
| **bolt.new** | 寫入 `.ai-memory/`，下次載入專案時讀取 |

### 其他 / 未來 Agent

任何能讀檔案 + 接受文字指令的 agent 都能用。記憶寫入通用目錄 `.ai-memory/`。

---

## 安裝 / Install

### 方法一：Clone（推薦）

```bash
git clone https://github.com/redredchen01/session-wrap-skill.git
```

然後根據你的 agent 複製到對應位置：

```bash
# Claude Code
mkdir -p ~/.claude/skills/session-wrap
cp session-wrap-skill/SKILL.md ~/.claude/skills/session-wrap/SKILL.md

# Cursor
mkdir -p .cursor/rules
cp session-wrap-skill/SKILL.md .cursor/rules/session-wrap.mdc

# Cline
cp session-wrap-skill/SKILL.md .cline/rules/session-wrap.md

# Roo Code
cp session-wrap-skill/SKILL.md .roo/rules/session-wrap.md
```

### 方法二：直接加入指令檔

適用於 Codex、Gemini CLI、Amp、Copilot 等使用單一指令檔的 agent：

```bash
# Codex
cat session-wrap-skill/SKILL.md >> AGENTS.md

# Gemini CLI
cat session-wrap-skill/SKILL.md >> GEMINI.md

# Amp (Sourcegraph)
cat session-wrap-skill/SKILL.md >> AGENT.md

# GitHub Copilot
cat session-wrap-skill/SKILL.md >> .github/copilot-instructions.md

# Continue.dev
cat session-wrap-skill/SKILL.md >> .continuerules
```

### OpenClaw

OpenClaw 有原生 skill 系統，直接安裝：

```bash
# workspace 級別（單一 agent 專用）
mkdir -p ~/.openclaw/workspace/skills/session-wrap
cp session-wrap-skill/SKILL.md ~/.openclaw/workspace/skills/session-wrap/SKILL.md

# 或全域級別（所有 agent 共享）
mkdir -p ~/.openclaw/skills/session-wrap
cp session-wrap-skill/SKILL.md ~/.openclaw/skills/session-wrap/SKILL.md
```

OpenClaw 的 skill loader 自動偵測 `SKILL.md`，記憶寫入 `~/.openclaw/workspace/memory/`。

### 方法三：通用安裝

把 `SKILL.md` 內容加入任何 agent 的系統提示詞或規則檔中。核心邏輯是純文字指令，不依賴特定 API。

---

## 使用方式 / Usage

### 結束對話

用任何語言說「結束」，支援中/英/日：

| 語言 | 觸發詞 |
|------|--------|
| 中文 | 收工、結束、先到這、今天先這樣、下次繼續、保存上下文 |
| English | wrap up, done for now, save context, end session, call it a day |
| 日本語 | 終了、今日はここまで、保存して |

### AI 自動輸出

```
記憶已更新：

| 檔案 | 動作 | 內容 |
|------|------|------|
| project_myapp.md | 更新 | v2.1 完成，auth 重構進行中 |
| feedback_testing.md | 新增 | 整合測試用 real DB |
| user_preferences.md | 不變 | — |

平台: Codex | 記憶路徑: .ai-memory/
下次開新對話會自動載入這些上下文。
```

### 隨時記錄

不用等到結束，隨時都能記：

```
你：幫我記下，這個 API 的 rate limit 要在 gateway 層處理，不要在每個 service 各自處理
```

---

## 運作原理 / How it works

```
觸發「收工」
    │
    ▼
┌──────────────────────────────────┐
│  1. 偵測平台（哪個 Agent？）       │
│  2. 決定記憶路徑                   │
│  3. 掃描 git 狀態 + 現有記憶       │
│  4. 分析本次 session 的關鍵資訊    │
│  5. 寫入/更新記憶檔案              │
│  6. 更新 MEMORY.md 索引           │
│  7. Bootstrap 注入（如需要）       │
│  8. 回報摘要表格                   │
└──────────────────────────────────┘
    │
    ▼
下次對話自動載入 → 無縫接續
```

### 記憶四大類型

| 類型 | 存什麼 | 範例 |
|------|--------|------|
| **project** | 專案狀態、版本、進度、分支 | 「v2.1 已發布，auth 重構在 feat/auth」 |
| **feedback** | 踩過的坑、教訓 | 「別用 mock DB，上次漏掉 migration bug」 |
| **user** | 使用者偏好、風格 | 「偏好 TDD、精簡回覆」 |
| **reference** | 外部資源、URL | 「API 文件在 internal.company.com/api」 |

### 記憶檔案格式

每個檔案用 YAML frontmatter 標記，任何 agent 都能解析：

```markdown
---
name: MyApp 專案狀態
description: v2.1 已發布，auth 重構進行中
type: project
updated: 2026-03-25
platform: codex
---

## MyApp v2.1

**Repo**: https://github.com/user/myapp
**Branch**: feat/auth

### 已完成
- API v2 endpoint 全部遷移

### 待做
- session store 選型
```

### 索引檔 MEMORY.md

```markdown
# Memory Index

## Project
- [MyApp 狀態](project_myapp.md) — v2.1 已發布，auth 重構中

## Feedback
- [測試經驗](feedback_testing.md) — 整合測試用 real DB
```

---

## 不會保存什麼 / What it skips

| 不保存 | 原因 |
|--------|------|
| 程式碼片段 | 會過時，改存檔案路徑 + 行號 |
| Git 歷史 | `git log` 就有 |
| 任務清單 | 當次 session 專用 |
| 暫存檔路徑 | 短暫存在，下次就沒了 |
| 架構/API 簽名 | 讀 code 就有 |
| Debug 過程 | 解決就結束了 |
| 密碼/API Key | 安全考量，永不保存 |

**原則**：只保存「code 裡讀不出來、但下次 AI 需要知道」的上下文。

---

## Bootstrap 機制

對於沒有原生記憶的 agent，session-wrap 會**一次性**在其指令檔中加入：

```markdown
# Memory
On session start, read all .md files in .ai-memory/ directory for project context from previous sessions.
```

這讓 agent 下次啟動時知道要讀記憶。只加一次，不會重複。不會覆蓋你的指令檔（是 append）。

### .ai-memory/ 目錄結構

```
your-project/
├── .ai-memory/              ← 通用記憶目錄
│   ├── MEMORY.md            ← 索引
│   ├── project_myapp.md     ← 專案狀態
│   ├── feedback_testing.md  ← 開發教訓
│   └── user_preferences.md  ← 使用者偏好
├── AGENTS.md                ← Codex 讀到 bootstrap 指令
├── GEMINI.md                ← Gemini CLI 讀到 bootstrap 指令
├── src/
└── ...
```

> 💡 建議把 `.ai-memory/` 加入 `.gitignore`（記憶是個人的）：
> ```bash
> echo ".ai-memory/" >> .gitignore
> ```

---

## 進階用法 / Advanced

### 跨專案共享偏好

```bash
cp .ai-memory/user_preferences.md ~/.claude/memory/     # Claude Code 全域
cp .ai-memory/user_preferences.md ~/.gemini/memory/     # Gemini CLI 全域
```

### 多 Agent 同專案

同一專案用多個 agent？記憶自動隔離到各自路徑，不會互相干擾。

### 搭配指令檔

在 `CLAUDE.md` 或 `AGENTS.md` 加一行提醒：

```markdown
# 對話結束時自動執行 session-wrap 保存上下文
```

---

## 常見問題 FAQ

**Q: 記憶會越來越多嗎？**
不會。規則是「更新優先於新建」。典型專案 3-5 個檔案。

**Q: 敏感資訊安全嗎？**
不存 secrets。建議把記憶目錄加入 `.gitignore`。

**Q: 不用 git 能用嗎？**
能。沒 git 時用目錄結構和檔案修改時間判斷。

**Q: 跟 Claude Code auto memory 差別？**
auto memory 是被動的（AI 自己決定記不記）。session-wrap 是主動的（你觸發就完整掃描）。兩者互補。

**Q: 我的 Agent 不在列表上？**
把 `SKILL.md` 加入系統提示詞。核心是純文字指令，不依賴特定 API。記憶寫到 `.ai-memory/`。

---

## 版本歷史 / Changelog

| 版本 | 日期 | 變更 |
|------|------|------|
| v2.1.1 | 2026-03-25 | 新增 OpenClaw 支援（原生 skill 整合 + workspace 記憶路徑） |
| v2.1 | 2026-03-25 | 支援 14+ agent（Codex, Gemini CLI, Amp, Copilot 等）、Bootstrap 機制、完整中文文件 |
| v2.0 | 2026-03-25 | 通用化（Claude Code + Cursor + Windsurf）、多語觸發、雙語 README |
| v1.0 | 2026-03-25 | 初版，Claude Code 專用 |

## Contributing

```bash
git clone https://github.com/redredchen01/session-wrap-skill.git
cd session-wrap-skill
# 修改 SKILL.md → 複製到 agent skills 目錄測試
```

歡迎 PR：更多 agent 整合、記憶壓縮、衝突解決、視覺化工具、團隊共享記憶。

## License

MIT
