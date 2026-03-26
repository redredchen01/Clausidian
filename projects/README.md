# Projects

YD 2026 工作區的統一項目目錄。

## 結構

```
projects/
├── production/        # 生產環境主項目（P1/P2/P3）
├── tools/             # 開發工具和支援項目
└── experimental/      # 試驗和開發環境
```

## 快速開始

### Production Projects

主要項目目錄。持續開發和維護。

```bash
cd production/dexapi              # P1 - YDAPI 核心
cd production/test-ydapi          # P2 - YDAPI 測試環境
cd production/watermark-0324      # P3 - APEX 去水印工具
```

### Tools

開發工具和支援項目。

```bash
cd tools/session-wrap-backend     # 多 Agent 會話同步後端
```

### Experimental

試驗性項目和本地開發環境。

```bash
cd experimental/sub2api-deploy    # 本地部署環境
```

## 詳細信息

→ 見 [PROJECTS.md](../PROJECTS.md) 了解每個項目的詳細信息

## 開發指南

→ 見 [docs/DEVELOPMENT.md](../docs/DEVELOPMENT.md) 了解如何在此工作區開發

## Shell Aliases

```bash
source ~/.zshrc-workspace

p1          # 進入 production/dexapi
p2          # 進入 production/test-ydapi
p3          # 進入 production/watermark-0324
pj          # 進入 projects/ 根目錄
pw          # 進入工作區根目錄
yd-status   # 查看所有項目狀態
```

## 項目統計

| 層級 | 項目 | 大小 | 狀態 |
|------|------|------|------|
| **Production** | 3 | 2.2G | 🟢 Active |
| **Tools** | 1 | 47M | 🟡 Maintenance |
| **Experimental** | 1 | 68M | 🟠 Development |

---

見各層級 README 了解詳情。
