# Workspace-0325 — 項目分類結構

本工作區包含 APEX 自治開發引擎及其生態系統專案。

> 📌 **詳細索引** → 見 [INDEX.md](INDEX.md)（完整的資料夾階層和說明）

```
workspace-0325/
├── 🏗️  core/apex/
│   ├── src/.claude/         ← 引擎核心（agents|commands|hooks|references|scripts）
│   ├── tests/               ← 722 個自動化測試
│   ├── build/               ← 編譯和構建
│   ├── docs/                ← 文檔（README|CHANGELOG|ARCHITECTURE）
│   ├── output/              ← 執行輸出（dev|instincts）
│   └── config/              ← 配置（CLAUDE.md|AGENTS.md）
│
├── 🛠️  skills/
│   ├── active/              ← 4 個活躍 skills
│   │   ├── session-wrap-skill/
│   │   ├── version-sync-skill/
│   │   ├── triple-publish-skill/
│   │   └── static-ghost-skill/
│   ├── build/               ← dist + node_modules
│   └── reference/           ← 預留
│
├── 🎬 apps/static-ghost/
│   ├── src/                 ← Python 源代碼
│   ├── tests/               ← 20+ 個單元測試
│   ├── build/               ← dist + egg-info
│   ├── config/              ← package.json + pyproject.toml
│   ├── output/              ← 執行輸出
│   └── README.md
│
├── 📚 system/
│   ├── reference/docs/      ← 參考文件
│   └── output/              ← 生成輸出（dev|instincts）
│
├── ⚙️  config/              ← 配置和發行包
├── README.md                ← 本文件（快速指南）
└── INDEX.md                 ← 詳細索引 📖
```

---

## 各分類說明

### 🏗️ core/ — 引擎層
**APEX** (Autonomous Pipeline EXecution Engine)
- 50-stage 開發管線，從需求 → 研究 → 設計 → 實作 → 審查 → 測試 → 提交 → 發布 → 運維 → 演化 → 自治
- 支援 16 個專門化 agent、15 個自動化 hook、9 個技術棧插件
- 雙適配器設計（Claude + Codex）
- 見：`core/apex/README.md`

### 🛠️ skills/ — Skills 層（可裝到任何 AI agent）

| Skill | 用途 | 平台 |
|-------|------|------|
| **session-wrap-skill** | 自動保存上下文、記憶持久化、跨 session 無縫接續 | Claude Code, Cursor, Codex, 19+ |
| **version-sync-skill** | 升版時自動同步 README、CHANGELOG、所有文件 | Claude Code, Cursor, Codex, 10+ |
| **triple-publish-skill** | 自動偵測專案、同步版本、發布到 GitHub + npm + PyPI | Claude Code, Cursor, Codex, 10+ |
| **static-ghost-skill** | 視頻水印移除工具的 skill 包裝 | Claude Code, Cursor, 支援調用 static-ghost |

### 🎬 apps/ — 獨立應用

**static-ghost** — 視頻去水印工具
- 用 LaMa inpainting 移除固定位置的水印（TV logo、網站水印、角落文字等）
- FFmpeg + IOPaint 管線，支援多區域、自動偵測、交互式選擇
- CLI + Python API
- 見：`apps/static-ghost/README.md`

### 📚 system/ — 系統基礎設施

| 目錄 | 內容 |
|------|------|
| **dev/** | SOP 產出（specs、knowledge、logs） |
| **docs/** | 項目文件 |
| **instincts/** | 動態學習系統（自動捕獲工具呼叫、提煉最佳實踐） |

### ⚙️ config/ — 配置與元資料

- **CLAUDE.md** — Claude Code 的完整配置（SOP 規則、MCP 觸發、Pipeline 定義）
- **AGENTS.md** — Codex/多 agent 的配置
- **\*.skill** / **\*.zip** — 發行包

---

## 快速啟動

### 1. 查看 APEX 引擎
```bash
cd core/apex/docs
cat README.md          # 50-stage 管線說明
cat CHANGELOG.md       # 版本歷史（v8.1.0）
```

### 2. 安裝 Skills 到本地
```bash
# session-wrap
cd skills/active/session-wrap-skill
npx session-wrap-skill install

# triple-publish
cd skills/active/triple-publish-skill
npx triple-publish-skill install

# version-sync
cd skills/active/version-sync-skill
npx version-sync-skill install
```

### 3. 使用視頻去水印
```bash
cd apps/static-ghost
pip install -e ".[dev]"
static-ghost pick video.mp4 --dilation 15 -o clean.mp4
```

---

## 整體架構

```
                    APEX 引擎（core/）
                    ↙           ↓           ↘
              Skills 層      應用層      系統層
          (skills/)         (apps/)    (system/)
              ↓              ↓           ↓
    [session-wrap]  [static-ghost]  [dev/docs]
    [version-sync]      + API      [instincts]
    [triple-publish]
    [static-ghost-sk]
```

**工作流**：
1. 用戶在任何 AI agent（Claude Code、Cursor 等）中說「發布」或「升版」
2. Agent 加載對應 skill（從 `config/` → `skills/`）
3. Skill 呼叫 APEX 引擎的相應 stage（如 S10 Release、version-sync）
4. 完成自動化流程

---

## 文件導航

| 資源 | 路徑 | 說明 |
|------|------|------|
| **APEX 架構** | `core/apex/docs/README.md` | 50-stage 完整說明 |
| **APEX 更新** | `core/apex/docs/CHANGELOG.md` | 版本歷史（v8.1.0） |
| **記憶系統** | `skills/active/session-wrap-skill/README.md` | 19+ 平台支援 |
| **版本同步** | `skills/active/version-sync-skill/README.md` | 文件同步詳解 |
| **三管道發布** | `skills/active/triple-publish-skill/README.md` | GitHub + npm + PyPI |
| **視頻去水印** | `apps/static-ghost/README.md` | 使用說明 + API 文檔 |
| **配置規則** | `config/CLAUDE.md` | SOP、MCP、Pipeline 定義 |
| **詳細索引** | `INDEX.md` | 完整的資料夾階層説明 |

---

## 分類原則

```
src/    = 源代碼和核心邏輯
tests/  = 測試檔案
build/  = 編譯輸出和發行版
docs/   = 文檔
output/ = 自動生成的檔案（.gitignore）
config/ = 配置檔
```

---

**更新日期**：2026-03-31
**架構版本**：8.1.0 (APEX) + skills 生態
