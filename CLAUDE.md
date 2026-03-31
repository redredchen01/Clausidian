# YD 2026 Workspace

三個活躍主項目 + Obsidian 知識庫 + Claude Memory。

## 核心設定
- 語言：繁體中文
- 風格：直接、技術導向、少廢話

## 快速啟動
```bash
source ~/.zshrc-workspace

p1                      # GWX
p2                      # TG Bot
p3                      # NS_0327
pw                      # 工作區根
kb                      # obsidian/
yd-status               # 主項目狀態
yd-info                 # 項目索引
```

## Projects
| P | 項目 | 位置 | 常用命令 |
|---|------|------|----------|
| **1** | GWX | `projects/production/gwx/` | `gwx-install`, `gwx-test` |
| **2** | TG Bot | `projects/production/claude_code_telegram_bot/` | `tg-start`, `tg-smoke` |
| **3** | NS_0327 | `projects/experimental/NS_0327/` | `ns-install`, `ns-test` |

詳細索引：見 `PROJECTS_INFO.md`

## 目錄結構
```text
YD 2026/
├── projects/
│   ├── production/
│   │   ├── gwx/
│   │   └── claude_code_telegram_bot/
│   ├── experimental/
│   │   └── NS_0327/
│   └── tools/
├── docs/
├── scripts/
├── obsidian/
├── PROJECTS_INFO.md
└── .zshrc-workspace
```

## 注意
- session-wrap 產品文檔已歸檔至 `docs/archive/session-wrap/`。
