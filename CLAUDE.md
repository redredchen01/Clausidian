# YD 2026 — Project Workspace

三個主項目（P1/P2/P3）+ Obsidian 知識庫 + Claude Code Memory

## 核心設定
- **語言：** 繁體中文，直接尖銳，無廢話
- **通信：** 技術判斷不軟化，不確定就說
- **模型：** Haiku 4.5（快速響應）

## 快速啟動（激活別名）
```bash
source ~/.zshrc-workspace    # 啟用 30+ 快速命令

# 快速導航
p1, p2, p3                   # 進入項目
pw                           # 工作區根
kb                           # 知識庫

# 快速開發
dev1/dev2/dev3               # npm install + npm run dev
test1/test2/test3            # npm test
build1/build2/build3         # npm run build

# 狀態查看
yd-status                    # 查看所有改動
yd-info                      # 項目信息
mem                          # 查看 Memory

# Session 管理
yd-start-session             # 加載上下文
yd-end-session "note"        # 保存會話

# 幫助
yd-help                      # 所有別名列表
```

## 目錄結構
```
YD 2026/
├── projects/
│   ├── production/          # 三個主項目 (P1/P2/P3)
│   ├── tools/               # 開發工具
│   └── experimental/        # 試驗項目
├── obsidian/                # 知識庫
├── PROJECTS_INFO.md         # 統一項目信息 ⭐
├── CLAUDE.md                # 本檔案
├── docs/                    # 文檔
├── scripts/                 # 腳本
└── Archived/                # 歸檔項目
```

## Projects
| P | 項目 | 快速命令 | 位置 |
|---|------|---------|------|
| **1** | YDAPI 核心 | `p1` / `dev1` | `projects/production/dexapi/` |
| **2** | YDAPI 測試 | `p2` / `dev2` | `projects/production/test-ydapi/` |
| **3** | APEX 工具 | `p3` / `dev3` | `projects/production/watermark-0324/` |

詳細：見 [PROJECTS_INFO.md](PROJECTS_INFO.md)

## 工作流
1. **會話開始：** `yd-start-session`
2. **進入項目：** `p1` (自動進入 + 加載上下文)
3. **開發：** `dev1` (npm install + dev) 或 `test1` (npm test)
4. **查看狀態：** `yd-status`
5. **會話結束：** `yd-end-session "完成功能 X"`

## 核心系統
- **Memory:** `~/.claude/projects/-Users-dex-YD-2026/memory/` (10 個核心文件)
- **Settings:** `~/.claude/settings.json` (優化 2 個 plugins)
- **Aliases:** `~/.zshrc-workspace` (30+ 快速命令)

## 選項指南
- `/agent-guide` — Sub-agent 路由規則
- `/workspace-guide` — 工作區結構細節
- `/safety-rules` — 安全操作檢查清單

**最後更新：** 2026-03-26 | **優化版本：** Phase 4
