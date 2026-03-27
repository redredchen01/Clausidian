# HR Admin Bot Package

4 個 Telegram Bot 組成的 HR 行政自動化工具包，統一經理器啟動，Google Sheets 作為數據層。

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

## Google Sheet 結構

需要 1 個 Spreadsheet，包含 5 個 Worksheet：

| Worksheet | 用途 |
|-----------|------|
| employees | 員工名冊（ID、姓名、部門、職位、Email、主管Email） |
| onboarding | 入職記錄 |
| work_permits | 工作證申請記錄 |
| leaves | 請假記錄 |
| offboarding | 離職記錄 |

## 啟動

```bash
# 使用預設 config.json
python -m hr_admin_bots.manager

# 指定配置檔
python -m hr_admin_bots.manager --config /path/to/config.json

# 或透過安裝後的 CLI
hr-admin-bots --config config.json
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
- smtplib (stdlib)
