# HR Admin Bot Package

4 個 Telegram Bot 組成的 HR 行政自動化工具包。Google Sheets 作為資料層，統一 BotManager 並行啟動，內建 MCP Server 供 AI agent 呼叫。

**版本：v0.5.0**

## 功能

- 4 個 Telegram Bot：入職報到、工作證申請、請假申請、離職流程
- 員工 Telegram ID 自動綁定與驗證
- 主管 Telegram 核准（InlineKeyboard）+ email fallback
- 請假餘額檢查、重疊日期偵測
- 智能建議：歷史假別/原因推薦、異常模式偵測、月報
- 背景排程提醒（待審逾時、假期即將到期）
- MCP Server：10 個 HR 工具，JSON-RPC 2.0 over stdin/stdout
- HTTP Health Check（port 8080）
- Audit Trail：所有操作寫入 Google Sheets `audit_log`
- Webhook 通知（Slack、Teams 等）

## 安裝

### pip

```bash
pip install hr-admin-bots
# 或從原始碼安裝（可編輯模式）
pip install -e .
```

### Docker

```bash
cp config.example.json config.json
# 填入 config.json（Bot Tokens、Sheet ID、SMTP）
# 準備好 credentials.json（Google Service Account）
docker-compose up -d
```

## 快速開始

1. 複製設定範本：`cp config.example.json config.json`
2. 編輯 `config.json`：填入 Bot Tokens、Google Sheet ID、SMTP、HR email
3. 放置 Google Service Account 金鑰（`credentials.json`）
4. 啟動：`hr-admin-bots serve --config config.json`

## CLI 參考

```
hr-admin-bots <subcommand> [options]
```

| 子命令 | 說明 | 主要選項 |
|--------|------|---------|
| `serve` | 啟動所有 Telegram Bot | `--config`, `--no-scheduler`, `--health-port` |
| `mcp` | 啟動 MCP Server（stdin/stdout） | `--config` |
| `lookup <id>` | 查詢員工資料（JSON 輸出） | `--config` |
| `balance <id>` | 查詢各假別餘額 | `--config` |
| `status <id>` | 查詢員工待審申請 | `--config` |
| `report` | 輸出本月 HR 月報（JSON） | `--config` |
| `version` | 顯示版本 | — |

```bash
# 範例
hr-admin-bots serve --config config.json --health-port 8080
hr-admin-bots lookup E001 --config config.json
hr-admin-bots balance E001 --config config.json
hr-admin-bots report --config config.json
```

## MCP Server 設定

MCP Server 讓 Claude Code 等 AI agent 可直接呼叫 HR 操作。

### 啟動

```bash
hr-admin-bots mcp --config config.json
```

### Claude Code 整合（.mcp.json）

```json
{
  "mcpServers": {
    "hr-admin": {
      "command": "hr-admin-bots",
      "args": ["mcp", "--config", "/path/to/config.json"]
    }
  }
}
```

### 可用工具（10 個）

| 工具 | 說明 |
|------|------|
| `hr_lookup_employee` | 依員工 ID 查詢員工資料 |
| `hr_check_leave_balance` | 查詢指定假別剩餘天數 |
| `hr_apply_leave` | 提交請假申請 |
| `hr_approve_leave` | 核准或駁回請假申請 |
| `hr_list_pending` | 列出所有待審申請 |
| `hr_submit_onboarding` | 提交入職記錄 |
| `hr_submit_work_permit` | 提交工作證申請 |
| `hr_submit_offboarding` | 提交離職申請 |
| `hr_detect_anomalies` | 偵測員工異常請假模式 |
| `hr_monthly_report` | 產生本月 HR 統計月報 |

## Google Sheets 結構

需要 1 個 Spreadsheet，包含以下 6 個 Worksheet：

| Worksheet | 用途 | 主要欄位 |
|-----------|------|---------|
| `employees` | 員工名冊 | employee_id, name, department, position, email, manager_email, telegram_id, annual_leave_quota, hire_date |
| `onboarding` | 入職記錄 | employee_id, name, department, position, onboarding_date, status |
| `work_permits` | 工作證申請 | employee_id, name, department, position, apply_date, apply_month, status |
| `leaves` | 請假記錄 | employee_id, name, department, leave_type, start_date, end_date, days, reason, status, apply_date, approved_at |
| `offboarding` | 離職記錄 | employee_id, name, department, position, apply_date, status, checklist |
| `audit_log` | 操作稽核（自動寫入） | timestamp, action, actor, target_employee, details |

## 假期類型

| 類型 | 年度額度 |
|------|---------|
| 年假 | 依 `employees.annual_leave_quota` 設定 |
| 病假 | 無限制 |
| 事假 | 10 天 |
| 喪假 | 3 天 |
| 婚假 | 5 天 |
| 產假 | 98 天 |
| 陪產假 | 15 天 |

## Webhook Payload

在 `config.json` 的 `webhooks` 陣列設定目標 URL，核准/駁回事件觸發 POST：

```json
{
  "event_type": "leave_approval",
  "data": {
    "action": "approve",
    "new_status": "approved",
    "row_index": 5
  }
}
```

## 技術棧

- Python 3.9+
- python-telegram-bot v20+（async）
- gspread + google-auth
- smtplib / urllib.request（stdlib，無額外 HTTP 依賴）

## 開發

```bash
# 安裝開發依賴
pip install -e ".[dev]"

# 跑測試
pytest tests/

# 測試涵蓋率
pytest tests/ --cov=hr_admin_bots
```
