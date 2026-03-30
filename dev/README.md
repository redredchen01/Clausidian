# Development Directories — YD 2026

獨立開發環境和工具倉庫。

## 目錄結構

```
dev/
├── clausidian/                 # 獨立 Clausidian 開發 repo
│   ├── .git → redredchen01/Clausidian
│   ├── package.json (v2.0.0)
│   ├── bin/cli.mjs
│   ├── src/ (55+ commands)
│   └── test/ (122/124 passing)
├── CLAUSIDIAN_PROGRESS.md      # 進度追蹤
└── README.md                   # 本文件
```

## Clausidian 獨立開發

**官方倉庫：** https://github.com/redredchen01/Clausidian
**npm 套件：** https://www.npmjs.com/package/clausidian

### 快速開始

```bash
cd clausidian

# 檢查版本
cat package.json | grep '"version"'   # v2.0.0

# 運行測試
npm test                              # 122/124 passing

# 開發新功能
touch src/commands/my-feature.mjs

# 推送到獨立 repo
git push origin main
```

### 與工作區同步

**主複本：** `/Users/dex/YD 2026/projects/tools/clausidian/`
**獨立副本：** `/Users/dex/YD 2026/dev/clausidian/`

**同步方向：** Workspace → Independent

```bash
# 從工作區複製最新代碼
cd /Users/dex/YD\ 2026
cp -r projects/tools/clausidian/* dev/clausidian/

# 提交並推送到獨立 repo
cd dev/clausidian
git add -A
git commit -m "sync: update from workspace"
git push origin main
```

## 版本管理

| 位置 | 用途 | 版本 | Status |
|------|------|------|--------|
| **npm** | 公開套件 | 2.0.0 | ✅ Live |
| **GitHub** | 官方倉庫 | v2.0.0 | ✅ Tagged |
| **Workspace** | 主開發 | 2.0.0 | ✅ Master |
| **dev/** | 獨立副本 | 2.0.0 | ✅ Synced |

## 開發工作流程

### 1. 本地開發（工作區）

```bash
cd projects/tools/clausidian
npm test
# 修改代碼，確保測試通過
```

### 2. 同步到獨立 repo

```bash
cd dev/clausidian
cp -r ../../projects/tools/clausidian/* .
git add -A
git commit -m "feat: describe changes"
git push origin main
```

### 3. npm 發佈（如需版本更新）

```bash
cd projects/tools/clausidian
npm version patch  # or minor/major
npm publish
```

## 已知問題

| Issue | 優先級 | 狀態 |
|-------|--------|------|
| `test/index-manager.test.mjs:70` — Missing `nav-prev` | Low | Backlog |
| Git 結構 — clausidian 在工作區 git 中 | Medium | Design review |

## 下一步

- [ ] **修復測試** — Resolve graph generation failure
- [ ] **Git 策略** — Evaluate git submodule vs. monorepo
- [ ] **CI/CD 設置** — GitHub Actions 自動化測試 + npm publish
- [ ] **開發指南** — 新增貢獻者文檔

---

**更新時間：** 2026-03-30
**Maintainer：** redredchen01
**License：** MIT
