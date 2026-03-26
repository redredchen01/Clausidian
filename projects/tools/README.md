# Tools

開發工具和支援項目。

## 項目

### session-wrap-backend

多 Agent 會話同步雲後端。支持 Claude Code, Cursor, Windsurf, Cline 等。

**狀態：** 🟡 Maintenance
**版本：** 1.0.1
**大小：** 47M

#### 快速開始

```bash
cd session-wrap-backend

# 安裝依賴
npm install

# 開發模式
npm run dev

# 生產構建
npm run build

# Docker
docker-compose up
docker-compose down
```

#### 功能

- 多 Agent 認證和會話管理
- JWT 驗證
- 會話存儲和歷史
- 用戶資料管理

#### API 端點

```
POST   /api/auth/login           - 多 Agent 登入
POST   /api/auth/verify          - 驗證 JWT
GET    /api/wraps                - 獲取會話列表
GET    /api/wraps/:id            - 獲取會話詳情
POST   /api/wraps                - 創建新會話
PUT    /api/wraps/:id            - 更新會話
DELETE /api/wraps/:id            - 刪除會話
GET    /api/wraps/history        - 會話歷史
GET    /api/users/profile        - 用戶資料
```

#### 環境變數

見 `.env.example`：
```
DATABASE_URL=postgresql://user:password@localhost/dbname
JWT_SECRET=your-secret-key
NODE_ENV=development
PORT=3000
```

#### 部署

見 `Dockerfile` 和 `docker-compose.yml`

#### 文檔

- [SKILL.md](SKILL.md) - 詳細技術文檔

---

## 相關文檔

- [../PROJECTS.md](../PROJECTS.md) - 項目詳情
- [../../docs/DEVELOPMENT.md](../../docs/DEVELOPMENT.md) - 開發指南

---

**最後更新：** 2026-03-26
