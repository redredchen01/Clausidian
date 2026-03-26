# Production Projects

YD 2026 的三個核心生產項目（P1/P2/P3）。持續開發和維護。

## 項目概览

| 項目 | 描述 | 狀態 | 大小 |
|------|------|------|------|
| **dexapi** | YDAPI 核心服務 | 🟢 Active | 756M |
| **test-ydapi** | YDAPI 測試環境 | 🟢 Active | 137M |
| **watermark-0324** | APEX 去水印工具 | 🟢 Active | 1.3G |

---

## 快速開始

### P1: dexapi（YDAPI 核心）

```bash
cd dexapi

# 查看項目結構
cat CLAUDE.md              # 項目規則
ls -la                     # 目錄列表

# 開發命令（根據項目配置）
npm install                # 安裝依賴
npm run dev                # 啟動開發服務器
npm test                   # 運行測試
npm run build              # 構建生產版本
```

**用途：** YDAPI 主服務，核心 API 和業務邏輯

---

### P2: test-ydapi（YDAPI 測試環境）

```bash
cd test-ydapi

# 查看項目結構
cat CLAUDE.md              # 項目規則

# 測試命令
npm install                # 安裝依賴
npm test                   # 運行測試
npm run integration-test   # 集成測試（可能）
```

**用途：** 測試環境和集成測試，驗證 P1 的功能

**規模：** 3264 files, 137M

---

### P3: watermark-0324（APEX 去水印工具）

```bash
cd watermark-0324

# 查看項目結構
cat CLAUDE.md              # 項目規則
tree -L 2                  # 目錄結構

# 子模塊
ls apex-plugins/           # 多語言插件
ls ghost-remover/          # 鬼影移除引擎

# 開發命令（多語言）
# 見各子模塊的 CLAUDE.md
```

**用途：** 去水印和鬼影移除工具，支持多種框架

**特點：**
- apex-plugins/ - database, django, dotnet, flutter, golang, nestjs, python, react, rust
- ghost-remover/ - 核心引擎和 API
- instincts/ - 智能分析

---

## 開發規範

### 分支策略
- **main/master** - 生產分支（保護）
- **develop** - 開發主分支
- **feature/** - 新功能分支
- **bugfix/** - 修復分支
- **release/** - 發布分支

### 提交消息格式
```
type(scope): brief description

[optional detailed body]

Closes #ISSUE_NUMBER
Co-Authored-By: Name <email@example.com>
```

**Types:**
- `feat` - 新功能
- `fix` - 修復
- `refactor` - 重構
- `test` - 測試
- `docs` - 文檔
- `chore` - 維護
- `perf` - 性能優化

### 代碼風格
見各項目的 CLAUDE.md 或 .editorconfig

### 測試覆蓋率
- 生產代碼應有單元測試
- 重要功能應有集成測試
- 見各項目的測試目錄

---

## 常見開發任務

### 添加新功能到 P1
```bash
cd dexapi
git checkout -b feature/new-feature develop
# ... 開發 ...
git push origin feature/new-feature
# 創建 Pull Request
```

### 修復 Bug
```bash
cd dexapi
git checkout -b bugfix/issue-name develop
# ... 修復 ...
git commit -m "fix(module): description"
git push origin bugfix/issue-name
```

### 運行測試
```bash
cd test-ydapi
npm test                    # 運行所有測試
npm test -- --coverage      # 帶覆蓋率
```

### 構建生產版本
```bash
cd dexapi
npm run build
npm run build:prod          # 如適用
```

---

## 依賴和版本

### P1: dexapi
- Node.js: (見 package.json)
- npm/yarn: (見 lock file)

### P2: test-ydapi
- Node.js: (見 package.json)
- npm/yarn: (見 lock file)

### P3: watermark-0324
- Python: (見 requirements.txt)
- Go: (見 go.mod)
- Node.js: (見 package.json)

---

## 部署

見各項目的 CLAUDE.md 或部署文檔

---

## 監控和日誌

### 本地開發
```bash
cd dexapi
npm run dev              # 帶日誌輸出
```

### 生產日誌
- 見各項目的部署文檔

---

## 常見問題

### 我如何快速進入這些項目？
```bash
source ~/.zshrc-workspace
p1          # 進入 dexapi
p2          # 進入 test-ydapi
p3          # 進入 watermark-0324
```

### 如何同時在多個項目工作？
使用多個終端窗口或 tmux:
```bash
tmux new-window -n p1 -c projects/production/dexapi
tmux new-window -n p2 -c projects/production/test-ydapi
tmux new-window -n p3 -c projects/production/watermark-0324
```

### 如何跨項目更新依賴？
```bash
for project in dexapi test-ydapi watermark-0324; do
  cd projects/production/$project
  npm update              # 或 pip install --upgrade
  git add -A
  git commit -m "chore(deps): update dependencies"
done
```

---

## 相關文檔

- [../PROJECTS.md](../PROJECTS.md) - 所有項目詳細信息
- [../README.md](../README.md) - 工作區首頁
- [../../CLAUDE.md](../../CLAUDE.md) - 項目規則
- [../../docs/DEVELOPMENT.md](../../docs/DEVELOPMENT.md) - 開發指南

---

**最後更新：** 2026-03-26
