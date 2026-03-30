# YD 2026 Projects Info

## 快速導覽

| P | 項目 | 別名 | 類型 | 技術棧 | 用途 |
|---|------|------|------|--------|------|
| **1** | GWX | `p1` | Production | Go + npm | Google Workspace CLI 主項目 |
| **2** | TG Bot 自動化 | `p2` | Production | Node.js + MJS | Obsidian/GA4/監控/Telegram 自動化 |
| **3** | NS_0327 | `p3` | Experimental | Python | HR Admin Bot 與技能實驗 |

## P1: GWX

**路徑：** `projects/production/gwx/`

**常用命令：**
```bash
p1                    # 進入項目
gwx-install           # make install
gwx-test              # go test ./...
```

**說明：**
- 主力生產項目
- Go CLI，附帶 npm 發佈包（`npm/package.json`）
- 有獨立 git repo

## P2: TG Bot 自動化平台

**路徑：** `projects/production/claude_code_telegram_bot/`

**常用命令：**
```bash
p2                    # 進入項目
tg-start              # npm start
tg-smoke              # npm run smoke
```

**說明：**
- Obsidian 日記同步、GA4 報表、SEO 審計、Telegram 通知
- Node.js + MJS
- 部分 hook 和日常自動化依賴此項目

## P3: NS_0327

**路徑：** `projects/experimental/NS_0327/`

**常用命令：**
```bash
p3                    # 進入項目
ns-install            # python3 -m pip install -e .
ns-test               # python3 -m pytest
```

**說明：**
- HR Admin Bot Skill Package
- Python 專案，入口定義在 `pyproject.toml`
- 仍屬實驗性，但目前活躍

## Tools

| 項目 | 路徑 | 用途 |
|------|------|------|
| `ctx` | `projects/tools/ctx/` | 上下文壓縮與 checkpoint 工具 |
| `clausidian` | `projects/tools/clausidian/` | Obsidian CLI 工具包 (v2.0.0+) — **見 dev/clausidian** |
| `session-wrap-skill` | `projects/tools/session-wrap-skill/` | 已拆出的 skill 倉庫副本 |
| `session-wrap-backend` | `projects/tools/session-wrap-backend/` | session-wrap backend/web 實驗區 |

## 獨立開發目錄

| 項目 | 路徑 | 類型 | 用途 |
|------|------|------|------|
| `clausidian` | `dev/clausidian/` | Independent Repo | GitHub: redredchen01/Clausidian (npm v2.0.0) |

**Clausidian 開發工作流程：**
```bash
# 進入獨立開發環境
cd dev/clausidian

# 檢查版本
cat package.json | grep '"version"'

# 運行測試
npm test                    # 122/124 passing

# 同步工作區變更
# (請見 dev/README.md)
```

**官方鏈接：**
- GitHub: https://github.com/redredchen01/Clausidian
- npm: https://www.npmjs.com/package/clausidian
- 進度追蹤: `dev/CLAUSIDIAN_PROGRESS.md`

## 工作區命令

```bash
source ~/.zshrc-workspace

p1 / p2 / p3          # 進入三個主項目
pw                    # 工作區根目錄
pj                    # projects/ 目錄
kb                    # 打開 obsidian/
mem                   # 查看 Claude memory
yd-status             # 查看主項目最新提交
yd-info               # 顯示本文件
```

## 備註

- `Archived/production/`
- `Archived/experimental/`

以上目錄包含已归档的歷史項目，不再作為主項目入口。根目錄已清理，確保無重複項目。
