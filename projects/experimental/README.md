# Experimental

試驗性項目和開發環境。用於測試、原型開發和本地環境設置。

## 項目

### sub2api-deploy

本地部署環境用於測試和開發。包含完整的 Docker 配置和 PostgreSQL/Redis 服務。

**狀態：** 🟠 Development
**用途：** 本地開發和集成測試環境
**大小：** 68M

#### 快速開始

```bash
cd sub2api-deploy

# 啟動 Docker 環境
docker-compose up -d

# 查看日誌
docker-compose logs -f

# 停止環境
docker-compose down

# 清理所有數據（重新初始化）
docker-compose down -v
docker-compose up -d
```

#### 服務

**PostgreSQL**
- 主機：localhost
- 端口：5432
- 數據庫：(見 docker-compose.yml)
- 數據目錄：`postgres_data/`

**Redis**
- 主機：localhost
- 端口：6379
- 數據文件：`redis_data/dump.rdb`

#### 配置

見 `data/config.yaml` 和相關配置文件

#### 目錄結構

```
sub2api-deploy/
├── docker-compose.yml   # Docker 服務配置
├── data/                # 配置和數據
├── logs/                # 應用日誌
├── postgres_data/       # PostgreSQL 數據（Git 忽略）
└── redis_data/          # Redis 數據（Git 忽略）
```

#### 使用

```bash
# 進入 PostgreSQL
docker-compose exec postgres psql -U postgres

# 查看 Redis
docker-compose exec redis redis-cli

# 執行遷移
docker-compose exec app python manage.py migrate  # 或相應命令

# 執行測試
docker-compose exec app npm test  # 或 pytest
```

#### 故障排除

**容器無法啟動**
```bash
# 查看日誌
docker-compose logs

# 重建鏡像
docker-compose up -d --build
```

**端口已被佔用**
```bash
# 修改 docker-compose.yml 中的端口
# 或 kill 佔用的進程
lsof -i :5432  # 查看 PostgreSQL 端口
lsof -i :6379  # 查看 Redis 端口
```

**數據庫狀態損壞**
```bash
# 完全清理並重新初始化
docker-compose down -v
rm -rf postgres_data redis_data
docker-compose up -d
```

---

## 實驗性項目指南

### 目的
- 測試新技術棧
- 原型開發
- 集成測試環境
- 本地開發支持

### 與生產的區別
- **Experimental** 項目可能不穩定
- 不應在生產環境使用
- 用於開發和測試
- 數據可能被定期清理

### 遷移到生產
當一個實驗項目成熟時：
1. 創建 PR 說明遷移計劃
2. 進行代碼審查
3. 通過所有測試
4. 移動到 `projects/production/`
5. 更新文檔

---

## 常見任務

### 本地集成測試

```bash
# 啟動環境
docker-compose up -d

# 等待服務就緒（約 10 秒）
sleep 10

# 運行測試
npm test                # 或 pytest

# 清理
docker-compose down
```

### 開發工作流

```bash
# 終端 1：啟動服務
docker-compose up

# 終端 2：開發應用
# ... 編輯代碼 ...
# 容器會自動重新加載（如配置了）

# 或手動重新啟動
docker-compose restart app
```

### 檢查服務健康狀態

```bash
# 查看運行的容器
docker-compose ps

# 檢查 PostgreSQL
docker-compose exec postgres pg_isready

# 檢查 Redis
docker-compose exec redis ping
```

---

## 相關文檔

- [../PROJECTS.md](../PROJECTS.md) - 項目詳情
- [../../docs/DEVELOPMENT.md](../../docs/DEVELOPMENT.md) - 開發指南

---

**最後更新：** 2026-03-26

⚠️ **注意：** 此目錄中的項目在實驗階段。不適合生產使用。
