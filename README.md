# session-wrap 🧠

**AI 對話記憶持久化** — 讓任何 AI 編碼助手都能跨 session 記住你的專案上下文。

Universal memory persistence for AI coding agents. Say "wrap up" and your context survives to the next session.

---

## 解決什麼問題？

每次開新對話，你都得重複：

> 「我們在做 XXX 專案，用 YYY 技術，上次做到 ZZZ，現在要繼續...」

**session-wrap 讓你省掉這一步。** 對話結束時說「收工」，AI 自動掃描專案狀態、寫入結構化記憶檔。下次開新對話，記憶自動載入。

---

## 支援哪些 Agent？

**全部。**

| Agent | 原生記憶 | session-wrap 記憶路徑 | 需要 bootstrap？ |
|-------|---------|---------------------|----------------|
| **Claude Code** | ✅ 有 | `~/.claude/projects/<hash>/memory/` | 不需要（原生支援） |
| **Windsurf** | ✅ 有 | `.ai-memory/` (備份) | 不需要（有 Memories DB） |
| **Cline** | ✅ Memory Bank | `.cline/memory/` | 不需要 |
| **Roo Code** | ✅ 繼承 Cline | `.roo/memory/` | 不需要 |
| **Cursor** | ❌ 無 | `.cursor/memory/` | ✅ 需要 |
| **Codex** (OpenAI) | ❌ 無 | `.ai-memory/` | ✅ 需要（修改 AGENTS.md） |
| **Gemini CLI** | ❌ 無 | `.ai-memory/` | ✅ 需要（修改 GEMINI.md） |
| **Amp** (Sourcegraph) | ❌ 無 | `.ai-memory/` | ✅ 需要（修改 AGENT.md） |
| **GitHub Copilot** | ❌ 無 | `.ai-memory/` | ✅ 需要 |
| **Aider** | ❌ 無 | `.ai-memory/` | ✅ 需要 |
| **Continue.dev** | ❌ 無 | `.ai-memory/` | ✅ 需要 |
| **Devin** | ☁️ 雲端 | `.ai-memory/` (repo 內) | 自動同步 |
| **bolt.new** | ❌ 無 | `.ai-memory/` | ✅ 需要 |

**「需要 bootstrap」** 是指：skill 會在該 agent 的指令檔（如 `AGENTS.md`）中加入一行，讓它下次啟動時自動讀取記憶目錄。只加一次，之後就自動了。

---

## 安裝 / Install

### Claude Code

```bash
git clone https://github.com/redredchen01/session-wrap-skill.git
mkdir -p ~/.claude/skills/session-wrap
cp session-wrap-skill/SKILL.md ~/.claude/skills/session-wrap/SKILL.md
```

### Cursor

```bash
git clone https://github.com/redredchen01/session-wrap-skill.git
mkdir -p .cursor/rules
cp session-wrap-skill/SKILL.md .cursor/rules/session-wrap.mdc
```

### Cline / Roo Code

將 `SKILL.md` 內容加入 `.clinerules` 或 `.roo/rules/session-wrap.md`。

### Codex / Gemini CLI / Amp / Copilot / 其他

把 `SKILL.md` 的內容貼入你的 agent 指令檔：

```bash
# Codex
cat session-wrap-skill/SKILL.md >> AGENTS.md

# Gemini CLI
cat session-wrap-skill/SKILL.md >> GEMINI.md

# Amp
cat session-wrap-skill/SKILL.md >> AGENT.md

# Copilot
cat session-wrap-skill/SKILL.md >> .github/copilot-instructions.md
```

### 通用安裝（任何 agent）

如果你的 agent 支援自定義系統提示詞，把 `SKILL.md` 的內容加進去就行。核心邏輯是純文字指令，不依賴任何特定平台 API。

---

## 使用方式

### 結束對話

用任何語言說「結束」：

```
你：收工
你：wrap up
你：先到這，下次繼續
你：done for now
你：今日はここまで
```

### AI 自動執行

```
記憶已更新：

| 檔案 | 動作 | 內容 |
|------|------|------|
| project_myapp.md | 更新 | v2.1 完成，auth 重構進行中 |
| feedback_testing.md | 新增 | 整合測試用 real DB |
| user_preferences.md | 不變 | — |

平台: Claude Code | 記憶路徑: ~/.claude/projects/.../memory/
下次開新對話會自動載入這些上下文。
```

### 手動記錄

你也可以隨時讓 AI 記住特定事項：

```
你：幫我記下，這個 API 的 rate limit 要在 gateway 層處理
```

AI 會寫入一條 feedback 記憶，不執行完整 wrap。

---

## 運作原理

```
觸發「收工」
    │
    ▼
┌─────────────────────────────────┐
│  1. 偵測平台（哪個 Agent？）      │
│  2. 決定記憶路徑                  │
│  3. 掃描 git 狀態 + 現有記憶      │
│  4. 分析本次 session 做了什麼     │
│  5. 寫入/更新記憶檔案             │
│  6. 更新 MEMORY.md 索引          │
│  7. 確保下次 bootstrap（如需要）  │
│  8. 回報摘要                     │
└─────────────────────────────────┘
    │
    ▼
下次對話自動載入 → 無縫接續
```

### 記憶分四類

| 類型 | 存什麼 | 範例 |
|------|--------|------|
| **project** | 專案狀態、版本、進度、分支 | 「v2.1 已發布，auth 重構在 feat/auth」 |
| **feedback** | 踩過的坑、教訓 | 「別用 mock DB，上次漏掉 migration bug」 |
| **user** | 使用者偏好、風格 | 「偏好 TDD、精簡回覆」 |
| **reference** | 外部資源、URL | 「API 文件在 internal.company.com/api」 |

### 記憶檔案格式

```markdown
---
name: MyApp 專案狀態
description: v2.1 已發布，auth 重構進行中
type: project
updated: 2026-03-25
platform: claude-code
---

## MyApp v2.1

**Repo**: https://github.com/user/myapp
**Branch**: feat/auth (from main)

### 已完成
- API v2 endpoint 全部遷移

### 待做
- session store 選型
```

---

## 不會保存什麼

| 不保存 | 原因 |
|--------|------|
| 程式碼片段 | 會過時，改存檔案路徑 + 行號 |
| Git 歷史 | `git log` 就有 |
| 任務清單 | 當次 session 用，不跨對話 |
| 暫存檔路徑 | 短暫存在，下次就沒了 |
| 架構/API 簽名 | 讀 code 就有 |
| Debug 過程 | 解決就結束了 |

**原則**：只保存「code 裡讀不出來、但下次 AI 需要知道」的上下文。

---

## Bootstrap 機制說明

對於沒有原生記憶的 agent（Codex、Gemini CLI、Copilot 等），session-wrap 會在該 agent 的指令檔中加入一行 bootstrap 指令：

```markdown
# Memory
On session start, read all .md files in .ai-memory/ directory for project context from previous sessions.
```

**這行指令的作用**：讓 agent 下次啟動時知道要讀取記憶檔案。

- 只加一次（會先檢查是否已存在）
- 不會覆蓋你的指令檔（是 append 不是 overwrite）
- Claude Code 和 Windsurf 不需要（有原生記憶系統）

### .ai-memory/ 是什麼？

這是 session-wrap 建立的**通用記憶目錄**。對於沒有專屬記憶路徑的 agent，統一使用 `.ai-memory/` 作為記憶存放位置。

```
your-project/
├── .ai-memory/          ← 通用記憶目錄
│   ├── MEMORY.md        ← 索引
│   ├── project_myapp.md
│   ├── feedback_testing.md
│   └── user_preferences.md
├── AGENTS.md            ← Codex 會讀到 bootstrap 指令
├── GEMINI.md            ← Gemini CLI 會讀到 bootstrap 指令
├── src/
└── ...
```

建議把 `.ai-memory/` 加入 `.gitignore`（記憶是個人的，不需要提交到 repo）：

```bash
echo ".ai-memory/" >> .gitignore
```

---

## 進階用法

### 跨專案共享使用者偏好

```bash
# 把偏好複製到全域
cp .ai-memory/user_preferences.md ~/.claude/memory/  # Claude Code
cp .ai-memory/user_preferences.md ~/.gemini/memory/  # Gemini CLI
```

### 多 Agent 同一專案

如果你在同一專案上混用多個 agent（例如用 Claude Code 寫碼、用 Cursor 快速查詢），記憶會自動隔離到各自的路徑，不會互相干擾。

### 配合 CLAUDE.md / AGENTS.md

在你的指令檔加一行提醒：

```markdown
# 對話結束時自動執行 session-wrap 保存上下文
```

---

## 常見問題 FAQ

### Q: 記憶檔案會越來越多嗎？

不會。規則是「更新優先於新建」。典型專案保持 3-5 個檔案。

### Q: 敏感資訊安全嗎？

不會存 secrets、密碼、API key。建議把記憶目錄加入 `.gitignore`。

### Q: 不用 git 的專案能用嗎？

能。沒有 git 時用目錄結構和檔案修改時間判斷狀態。

### Q: 跟 Claude Code 內建 auto memory 的差別？

auto memory 是被動的（Claude 自己決定記不記）。session-wrap 是主動的（你說「收工」就執行完整掃描和結構化寫入）。兩者互補，不衝突。

### Q: 我用的 Agent 不在支援列表上怎麼辦？

把 `SKILL.md` 的內容加入你的 agent 系統提示詞。核心邏輯是純文字指令，不依賴特定 API。記憶會寫到 `.ai-memory/` 通用目錄。

### Q: OpenClaw 支援嗎？

如果 OpenClaw 能讀取系統提示詞和寫入檔案，就能用。把 `SKILL.md` 加入它的指令系統，記憶會寫到 `.ai-memory/`。

---

## 開發 / Contributing

```bash
git clone https://github.com/redredchen01/session-wrap-skill.git
cd session-wrap-skill
# 修改 SKILL.md → 複製到你的 agent skills 目錄測試
```

歡迎 PR。改進方向：
- 更多 agent 平台的原生整合
- 記憶自動壓縮（長期記憶精簡）
- 記憶衝突解決策略
- 記憶視覺化/搜尋工具
- 團隊共享記憶（多人協作場景）

## License

MIT
