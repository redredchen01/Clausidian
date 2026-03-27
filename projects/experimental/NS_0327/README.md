# HR Admin Bot Package

4 個 Telegram Bot 組成的 HR 行政自動化工具包，統一經理器啟動，Google Sheets 作為數據層。

**版本：v0.3.0**

## Bot 清單

| Bot | 功能 | 流程 |
|-----|------|------|
| Onboarding | 新人入職 | 輸入ID → 確認資料 → 寫入Sheet → 通知HR |
| Work Permit | 工作證申請 | 輸入ID → 自動填入部門職位 → 提交 → 通知HR |
| Leave | 假期申請 | 輸入ID → 選假別 → 填日期原因 → 檢查餘額 → 提交 → 通知經理 |
| Offboarding | 離職流程 | 輸入ID → 自動生成申請 → 提交 → 通知HR+經理 |

## 安裝

```bash
pip install -e .
```

## 配置

1. 複製 `config.example.json` → `config.json`
2. 填入 4 個 Telegram Bot Token（透過 @BotFather 建立）
3. 填入 Google Sheet ID 和 Service Account 金鑰路徑
4. 填入 SMTP Email 設定
5. （選填）填入 Webhook URL 清單

## Google Sheet 結構

需要 1 個 Spreadsheet，包含 5 個 Worksheet：

| Worksheet | 用途 |
|-----------|------|
| employees | 員工名冊（ID、姓名、部門、職位、Email、主管Email） |
| onboarding | 入職記錄 |
| work_permits | 工作證申請記錄 |
| leaves | 請假記錄 |
| offboarding | 離職記錄 |

## CLI 指令

```bash
# 啟動所有 Telegram Bot
hr-admin-bots serve [--config config.json]

# 啟動 MCP Server（供 AI agent 使用）
hr-admin-bots mcp [--config config.json]

# 快速員工查詢
hr-admin-bots lookup <employee_id> [--config config.json]

# 查詢假別餘額
hr-admin-bots balance <employee_id> [--config config.json]

# 查詢待審申請狀態
hr-admin-bots status <employee_id> [--config config.json]

# 顯示版本
hr-admin-bots version
```

## MCP Server

MCP Server 讓 Claude Code、OpenClaw 等 AI agent 可以直接呼叫 HR 操作。

透過 stdin/stdout JSON-RPC 2.0 協定通訊，無須額外的 MCP 套件。

### 啟動

```bash
hr-admin-bots mcp --config config.json
# 或
python -m hr_admin_bots.mcp_server --config config.json
```

### 可用工具

| 工具 | 說明 |
|------|------|
| `hr_lookup_employee` | 依員工 ID 查詢員工資料 |
| `hr_check_leave_balance` | 查詢指定假別的剩餘天數 |
| `hr_apply_leave` | 提交請假申請 |
| `hr_approve_leave` | 核准或駁回請假申請 |
| `hr_list_pending` | 列出所有待審申請 |
| `hr_submit_onboarding` | 提交入職記錄 |
| `hr_submit_work_permit` | 提交工作證申請 |
| `hr_submit_offboarding` | 提交離職申請 |

### Claude Code 整合範例（.mcp.json）

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

## Webhook 通知

在 `config.json` 加入 `webhooks` 陣列，即可在核准/駁回事件時自動 POST 通知：

```json
{
  "webhooks": [
    "https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK",
    "https://YOUR_TEAM.webhook.office.com/webhookb2/..."
  ]
}
```

Payload 格式：

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

## 假期類型

| 類型 | 額度 |
|------|------|
| 年假 | 依員工名冊設定 |
| 病假 | 無限制 |
| 事假 | 10天/年 |
| 喪假 | 3天 |
| 婚假 | 5天 |
| 產假 | 98天 |
| 陪產假 | 15天 |

## 技術棧

- Python 3.9+
- python-telegram-bot v20+ (async)
- gspread + google-auth
- smtplib / urllib.request (stdlib)
