# Brief Spec: HR Admin Bot Skill Package

> **Feature ID**: hr-admin-bot-package
> **Work Type**: 新需求
> **Priority**: 中
> **Date**: 2026-03-27
> **Source**: `s0_requirement_input.md`

---

## 1. 問題與目標

**問題**：HR 行政流程（入職/工作證/請假/離職）依賴手動填表，速度慢且容易出錯。

**目標**：開發一個可安裝的 Python Skill Package，包含 4 個 Telegram Bot，透過統一經理器一次啟動，Google Sheets 作為數據層，實現行政流程自動化。

## 2. 角色

| 角色 | 類型 | 職責 |
|------|------|------|
| 員工 | 操作者 | 透過 Telegram Bot 提交申請 |
| HR 人員 | 管理者 | 在 Google Sheet 審核/管理 |
| 直屬經理 | 被通知者/審批者 | Email 通知，Sheet 審批請假 |
| 系統管理員 | 管理者 | 維護 Bot 配置 |

## 3. 架構概覽

```
hr-admin-bot-package/
├── hr_admin_bots/
│   ├── __init__.py
│   ├── config.py              # 統一配置（讀取 config.json）
│   ├── shared/
│   │   ├── auth.py            # 員工身份驗證模組
│   │   ├── sheets.py          # Google Sheets 連接器
│   │   └── notifier.py        # Email 通知模組
│   ├── bots/
│   │   ├── onboarding.py      # Bot 1: 新人入職
│   │   ├── work_permit.py     # Bot 2: 工作證申請
│   │   ├── leave.py           # Bot 3: 假期申請
│   │   └── offboarding.py     # Bot 4: 離職流程
│   └── manager.py             # 統一經理器
├── config.json                # 配置檔（Bot token、Sheet ID 等）
├── requirements.txt
├── setup.py / pyproject.toml
└── README.md
```

**共用基底層**：
- `auth.py` — 員工 ID 查詢 + 身份驗證（所有 Bot 共用）
- `sheets.py` — Google Sheets CRUD（gspread）
- `notifier.py` — SMTP Email 發送
- `config.py` — 統一讀取 config.json
- `manager.py` — 啟動/停止/監控所有 Bot

## 4. 四個 Bot 流程摘要

### Bot 1: 新人入職
`/start → 輸入ID → 驗證 → 確認資料 → 自動填 Google Form (15-30欄) → 提交+備份 → Email HR`

### Bot 2: 工作證申請
`/start → 輸入ID → 自動帶入部門職位+生成日期 → 確認 → 提交到Sheet → Email HR`

### Bot 3: 假期申請（最複雜）
`/start → 輸入ID → 選假期類型+日期+原因 → 檢查餘額 → 確認 → 提交 → Email經理 → 經理審批 → Email員工結果`

支援假期類型：年假(15天)、病假(無限)、事假(10天)、喪假(3天)、婚假(5天)、產假(98天)、陪產假(15天)

### Bot 4: 離職流程
`/start → 輸入ID → 自動生成離職申請 → 確認 → 提交 → Email HR+經理 → 觸發離職Checklist`

## 5. 通知矩陣

| 事件 | 員工 | HR | 經理 |
|------|------|-----|------|
| 入職提交 | Bot | Email | - |
| 工作證提交 | Bot | Email | - |
| 請假提交 | Bot | - | Email |
| 請假審批結果 | Email | - | - |
| 離職提交 | Bot | Email | Email |

## 6. 外部依賴

| 服務 | 庫 | 用途 |
|------|-----|------|
| Telegram Bot API | `python-telegram-bot` | Bot 互動 |
| Google Sheets API | `gspread` + `google-auth` | 數據層 |
| Google Forms API | `gspread` / HTTP | 入職表單(Bot 1) |
| SMTP | `smtplib` | Email 通知 |

## 7. 驗收標準

- [ ] `python multi_bot_manager.py` 一次啟動 4 個 Bot
- [ ] 員工 ID 查詢正確識別身份
- [ ] 各 Bot 流程數據正確寫入 Google Sheets
- [ ] 請假 Bot 正確檢查假期餘額
- [ ] 相關人員收到 Email 通知
- [ ] 可作為 `pip install` 的 package

## 8. 排除範圍

- 不做 Web UI（用 Google Sheets 管理）
- 不做多語言（僅中文）
- 不做複雜權限（信任 Bot 使用者 = 員工本人）
- 不做跨公司多租戶

## 9. 異常處理（需實作）

| 情境 | 行為 |
|------|------|
| 員工 ID 不存在 | 「查無此人」+ 重新輸入 |
| Sheet 連線失敗 | 「系統暫時無法使用」+ log |
| 請假餘額不足 | 提示不足 + 建議改假別 |
| 重複提交 | 偵測 + 阻擋 |
| Email 失敗 | log + 不阻斷主流程 |

## 10. 技術約束

- Python 3.9+
- 單一 Google Sheet 作為數據源（非 DB）
- 每個 Bot 需獨立 Telegram Bot Token
- Google Service Account 金鑰

---

> **S0 Status**: ✅ 需求確認完成
> **Next**: S1 技術分析 → 產出 dev_spec
