# Architecture

YD 2026 工作區的架構和設計。

---

## 工作區架構

### 目錄層級

```
YD 2026/
├── projects/                    # 項目根目錄
│   ├── production/              # 生產項目 (P1/P2/P3)
│   ├── tools/                   # 開發工具
│   └── experimental/            # 試驗環境
├── docs/                        # 文檔
├── scripts/                     # 自動化腳本
├── obsidian/                    # 知識庫
├── Archived/                    # 歷史項目
└── 配置文件
```

### 層級結構

```
根層：YD 2026 (工作區)
  ├─ 項目層：projects/
  │   ├─ 類別層：production/, tools/, experimental/
  │   │   └─ 項目層：dexapi/, test-ydapi/, 等
  │   │       └─ 子模塊層：sub2api/, frontend/, 等
  │   └─ 文檔層：README.md
  ├─ 文檔層：docs/, README.md, CLAUDE.md
  ├─ 支持層：scripts/, obsidian/
  └─ 配置層：.zshrc-workspace, package.json
```

---

## 項目分類

### Production (P1/P2/P3)

**用途：** 生產環境和持續開發

**P1: dexapi (YDAPI 核心)**
- 主 API 服務
- 業務邏輯和數據模型
- 756M

**P2: test-ydapi (YDAPI 測試)**
- 集成測試環境
- UAT 環境
- 137M / 3264 files

**P3: watermark-0324 (APEX 工具)**
- 去水印和鬼影移除工具
- 多語言插件系統（database, django, dotnet, flutter, golang, nestjs, python, react, rust）
- 1.3G

### Tools

**session-wrap-backend**
- 多 Agent 會話同步後端
- Node.js + Express.js + PostgreSQL
- 47M

### Experimental

**sub2api-deploy**
- 本地開發環境
- Docker Compose + PostgreSQL + Redis
- 68M

---

## 開發工作流

### 分支策略

```
main/master (生產 - 受保護)
    ↓
develop (開發主分支)
    ↓
├── feature/* (功能分支)
├── bugfix/* (修復分支)
├── refactor/* (重構分支)
└── docs/* (文檔分支)
    ↓
合併回 develop
    ↓
發布準備
    ↓
發佈到 main/master
```

### CI/CD 流程

```
提交 (feature branch)
    ↓
Pre-commit hooks (git)
    ↓
GitHub Actions
    ├─ 代碼檢查 (lint)
    ├─ 單元測試
    ├─ 集成測試
    └─ 構建驗證
    ↓
代碼審查 (Pull Request)
    ↓
合併到 develop
    ↓
部署到 staging
    ↓
合併到 main
    ↓
部署到生產
```

---

## 依賴和通信

### 項目依賴圖

```
P1: dexapi (YDAPI Core)
    ├─ API Server
    ├─ Business Logic
    └─ Database Models
        ↓
P2: test-ydapi (Test Environment)
    ├─ Replicas P1 + P2
    ├─ Integration Tests
    └─ UAT Setup

P3: watermark-0324 (APEX Tool)
    ├─ apex-plugins/ (多語言適配)
    │   ├─ database
    │   ├─ django
    │   ├─ dotnet
    │   ├─ flutter
    │   ├─ golang
    │   ├─ nestjs
    │   ├─ python
    │   ├─ react
    │   └─ rust
    └─ ghost-remover/ (核心引擎)
        ├─ API Server
        ├─ Processing Engine
        └─ Model Management

Tools: session-wrap-backend
    ├─ Authentication
    ├─ Session Management
    └─ Cloud Sync
        ↓ (支持)
    P1, P2, P3 開發流程

Experimental: sub2api-deploy
    ├─ Local Environment
    ├─ Docker Services
    │   ├─ PostgreSQL
    │   └─ Redis
    └─ Testing Infrastructure
```

---

## 數據流

### 開發環境數據流

```
開發者代碼
    ↓
Git Commit & Push
    ↓
GitHub Webhook
    ↓
GitHub Actions (CI)
    ├─ Lint & Style Check
    ├─ Unit Tests
    └─ Build
    ↓
Code Review (PR)
    ├─ Reviewer Feedback
    └─ Approval
    ↓
Merge to develop
    ↓
Integration Tests
    ↓
Deployment
    ├─ Staging (可選)
    └─ Production
```

### 生產數據流

```
User Request
    ↓
Load Balancer
    ↓
API Gateway (P1)
    ├─ Authentication
    ├─ Rate Limiting
    └─ Routing
    ↓
Business Logic
    ├─ Validation
    ├─ Processing
    └─ Database
        └─ PostgreSQL
    ↓
Cache (Redis)
    ↓
Response
    ↓
User
```

---

## 技術棧

### Production Projects

**P1 & P2: dexapi**
- 後端：JavaScript/TypeScript (Node.js)
- 前端：React (如適用)
- 數據庫：PostgreSQL
- 緩存：Redis

**P3: watermark-0324**
- 核心引擎：Python
- 插件系統：多語言
- API：Node.js / Go

### Tools

**session-wrap-backend**
- 運行時：Node.js
- 框架：Express.js
- 數據庫：PostgreSQL
- 容器：Docker

### Development

**測試框架**
- JavaScript: Jest, Mocha
- Python: pytest
- Go: testing

**構建工具**
- Webpack / Vite
- Docker & Docker Compose
- npm / pip / go mod

**代碼質量**
- ESLint / Prettier (JS)
- Black / Flake8 (Python)
- golangci-lint (Go)

---

## 配置管理

### 配置層級

```
全局配置
    ├─ /Users/dex/.claude/CLAUDE.md (全局規則)
    └─ ~/.zshrc (Shell 配置)

工作區配置
    ├─ ~/YD 2026/CLAUDE.md (項目規則)
    ├─ ~/YD 2026/.zshrc-workspace (別名)
    ├─ ~/YD 2026/package.json (npm)
    └─ ~/YD 2026/.gitignore

項目配置
    ├─ projects/production/dexapi/CLAUDE.md
    ├─ projects/production/dexapi/package.json
    ├─ projects/production/dexapi/.eslintrc
    └─ 等

環境配置
    ├─ .env (本地環境變數)
    └─ .env.example (模板)
```

### 配置優先級

```
項目 .env (最高)
    ↓
項目 package.json
    ↓
工作區 package.json
    ↓
系統環境變數
    ↓
默認值 (最低)
```

---

## 部署架構

### 本地開發

```
Developer Workstation
    ├─ Editor (VS Code, etc.)
    ├─ Local Services
    │   ├─ PostgreSQL (Docker)
    │   ├─ Redis (Docker)
    │   └─ Dev Servers (npm run dev)
    └─ Local Git
```

### 應用環境

```
Staging
    ├─ Cloud Provider
    │   ├─ API Servers
    │   ├─ Database
    │   ├─ Cache
    │   └─ Storage
    └─ CI/CD Deployment

Production
    ├─ Cloud Provider
    │   ├─ API Servers (多實例)
    │   ├─ Database (副本)
    │   ├─ Cache (集群)
    │   └─ Storage
    ├─ Load Balancer
    ├─ CDN
    └─ Monitoring & Logging
```

---

## 擴展點

### 添加新項目

1. 在 `projects/production/` (或其他類別) 創建項目目錄
2. 添加 `CLAUDE.md` 項目規則
3. 添加 `README.md` 項目文檔
4. 更新 `PROJECTS.md` 工作區文檔
5. 更新 `.zshrc-workspace` 別名（如需）

### 集成外部服務

1. 在 `experimental/` 創建集成項目
2. 測試和驗證
3. 成熟後遷移到 `production/` 或 `tools/`

### 自定義工作流

1. 在 `scripts/` 添加自動化腳本
2. 更新 `.zshrc-workspace` 添加別名
3. 文檔化於 `docs/DEVELOPMENT.md`

---

## 安全考慮

### 代碼安全

- Pre-commit hooks 檢查
- 代碼審查流程
- 依賴安全掃描 (`npm audit`, `pip audit`)
- SAST/DAST 工具集成

### 數據安全

- PostgreSQL 加密（傳輸和存儲）
- Redis 認證和加密
- 環境變數管理（不提交 .env）
- 訪問控制和日誌

### 基礎設施安全

- 最小權限原則
- 容器安全掃描
- 定期安全審計
- 依賴更新

---

## 可靠性和性能

### 高可用性

- 多實例部署
- 數據庫副本
- 負載均衡
- 自動故障轉移

### 性能優化

- 響應式 API 設計
- 數據庫查詢優化
- 緩存策略
- CDN 集成

### 監控

- 應用性能監控 (APM)
- 日誌集中化
- 警報和通知
- SLA 追蹤

---

## 擴展性

### 水平擴展

```
負載均衡器
    ├─ API Server 1
    ├─ API Server 2
    ├─ API Server 3
    └─ API Server N
        ↓
    PostgreSQL (Primary/Replica)
    Redis (Cluster)
    Storage (分佈式)
```

### 垂直擴展

- 增加服務器資源
- 優化算法和查詢
- 使用更快的存儲

---

## 相關文檔

- [DEVELOPMENT.md](DEVELOPMENT.md) - 開發指南
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md) - 故障排除
- [CONTRIBUTING.md](../CONTRIBUTING.md) - 貢獻指南
- [PROJECTS.md](../PROJECTS.md) - 項目詳情
- [CLAUDE.md](../CLAUDE.md) - 項目規則

---

**最後更新：** 2026-03-26
**版本：** 1.0
