# Dev Spec: HR Admin Bot Skill Package

> **Feature ID**: hr-admin-bot-package
> **Based on**: `s0_brief_spec.md`
> **Stage**: S1 Technical Analysis

---

## 1. 技術棧

| 層級 | 技術 | 版本 |
|------|------|------|
| Runtime | Python | 3.9+ |
| Bot Framework | python-telegram-bot | v20+ (async) |
| Google Sheets | gspread + google-auth | latest |
| Email | smtplib (stdlib) | built-in |
| Async | asyncio | built-in |
| Package | pyproject.toml + setuptools | PEP 621 |

## 2. 目錄結構

```
hr-admin-bot-package/
├── src/
│   └── hr_admin_bots/
│       ├── __init__.py          # version, package exports
│       ├── config.py            # Config dataclass, load from JSON
│       ├── shared/
│       │   ├── __init__.py
│       │   ├── auth.py          # EmployeeAuth: ID lookup from Sheet
│       │   ├── sheets.py        # SheetsClient: gspread wrapper
│       │   └── notifier.py      # EmailNotifier: SMTP sender
│       ├── bots/
│       │   ├── __init__.py
│       │   ├── base.py          # BaseBot: common ConversationHandler pattern
│       │   ├── onboarding.py    # OnboardingBot
│       │   ├── work_permit.py   # WorkPermitBot
│       │   ├── leave.py         # LeaveBot
│       │   └── offboarding.py   # OffboardingBot
│       └── manager.py           # BotManager: start/stop all bots
├── config.example.json          # 配置範例
├── pyproject.toml               # PEP 621 package config
├── requirements.txt             # pip dependencies
├── README.md
└── tests/
    ├── __init__.py
    ├── test_auth.py
    ├── test_sheets.py
    ├── test_notifier.py
    └── test_bots/
        ├── test_onboarding.py
        ├── test_leave.py
        ├── test_work_permit.py
        └── test_offboarding.py
```

## 3. Google Sheets 結構

一個 Spreadsheet，5 個 Worksheet：

### Sheet 1: 員工名冊 (employees)
| 欄位 | 類型 | 說明 |
|------|------|------|
| employee_id | string | 員工編號 (PK) |
| name | string | 姓名 |
| department | string | 部門 |
| position | string | 職位 |
| email | string | 員工 Email |
| manager_email | string | 直屬經理 Email |
| hire_date | date | 入職日期 |
| annual_leave_quota | int | 年假額度 |
| status | string | active/resigned |

### Sheet 2: 入職記錄 (onboarding)
| 欄位 | 類型 | 說明 |
|------|------|------|
| id | auto | 序號 |
| employee_id | string | 員工編號 |
| name | string | 姓名 |
| department | string | 部門 |
| submitted_at | datetime | 提交時間 |
| form_status | string | submitted/confirmed |

### Sheet 3: 工作證申請 (work_permits)
| 欄位 | 類型 | 說明 |
|------|------|------|
| id | auto | 序號 |
| employee_id | string | 員工編號 |
| name | string | 姓名 |
| department | string | 部門 |
| position | string | 職位 |
| apply_date | date | 申請日期 |
| submitted_at | datetime | 提交時間 |

### Sheet 4: 請假記錄 (leaves)
| 欄位 | 類型 | 說明 |
|------|------|------|
| id | auto | 序號 |
| employee_id | string | 員工編號 |
| name | string | 姓名 |
| leave_type | string | 假別 |
| start_date | date | 開始日期 |
| end_date | date | 結束日期 |
| days | float | 天數 |
| reason | string | 原因 |
| status | string | pending/approved/rejected |
| submitted_at | datetime | 提交時間 |
| approved_at | datetime | 審批時間 |

### Sheet 5: 離職記錄 (offboarding)
| 欄位 | 類型 | 說明 |
|------|------|------|
| id | auto | 序號 |
| employee_id | string | 員工編號 |
| name | string | 姓名 |
| department | string | 部門 |
| submitted_at | datetime | 提交時間 |
| checklist_status | string | pending/in_progress/completed |

## 4. 核心模組設計

### 4.1 Config (`config.py`)

```python
@dataclass
class BotConfig:
    token: str
    enabled: bool = True

@dataclass
class Config:
    bots: dict[str, BotConfig]      # onboarding, work_permit, leave, offboarding
    google_sheet_id: str
    google_credentials_file: str
    smtp_host: str
    smtp_port: int
    smtp_user: str
    smtp_password: str
    hr_email: str

    @classmethod
    def from_json(cls, path: str) -> "Config": ...
```

### 4.2 EmployeeAuth (`shared/auth.py`)

```python
class EmployeeAuth:
    def __init__(self, sheets_client: SheetsClient): ...
    async def lookup(self, employee_id: str) -> Employee | None: ...
    async def verify(self, employee_id: str) -> tuple[bool, Employee | None]: ...
```

- 查詢 Sheet 1 (員工名冊)
- 返回 Employee dataclass 或 None
- 快取 5 分鐘避免頻繁 API 呼叫

### 4.3 SheetsClient (`shared/sheets.py`)

```python
class SheetsClient:
    def __init__(self, credentials_file: str, sheet_id: str): ...
    def get_worksheet(self, name: str) -> Worksheet: ...
    def find_employee(self, employee_id: str) -> dict | None: ...
    def append_row(self, worksheet_name: str, data: list) -> None: ...
    def get_leave_balance(self, employee_id: str, leave_type: str) -> float: ...
    def check_duplicate(self, worksheet_name: str, employee_id: str, **filters) -> bool: ...
```

### 4.4 EmailNotifier (`shared/notifier.py`)

```python
class EmailNotifier:
    def __init__(self, config: Config): ...
    async def send(self, to: str, subject: str, body: str) -> bool: ...
    async def notify_hr(self, subject: str, body: str) -> bool: ...
    async def notify_manager(self, manager_email: str, subject: str, body: str) -> bool: ...
```

- 非阻斷：Email 失敗只記 log，不中斷主流程
- 使用 asyncio.to_thread 包裝 smtplib（同步庫）

### 4.5 BaseBot (`bots/base.py`)

```python
class BaseBot:
    def __init__(self, config: BotConfig, sheets: SheetsClient,
                 auth: EmployeeAuth, notifier: EmailNotifier): ...

    # 共用 ConversationHandler states
    WAITING_ID, CONFIRMING = range(2)

    async def start(self, update, context) -> int: ...      # 歡迎 + 要求輸入 ID
    async def verify_id(self, update, context) -> int: ...   # 驗證 ID + 顯示資料
    async def cancel(self, update, context) -> int: ...      # 取消操作

    def build_application(self) -> Application: ...          # 建構 telegram Application
```

### 4.6 各 Bot 實作

**OnboardingBot** — 繼承 BaseBot，增加：
- `confirm_info()` — 確認員工資料
- `submit_form()` — 寫入 Sheet 2 + 備份
- ConversationHandler: WAITING_ID → CONFIRMING → SUBMITTING

**WorkPermitBot** — 繼承 BaseBot，增加：
- `show_permit_info()` — 顯示部門/職位 + 自動生成日期
- `submit_permit()` — 寫入 Sheet 3 + Email HR

**LeaveBot** — 繼承 BaseBot，增加：
- `select_leave_type()` — 假別選擇（InlineKeyboard）
- `input_dates()` — 日期輸入 + 驗證
- `input_reason()` — 原因輸入
- `check_balance()` — 餘額檢查
- `confirm_leave()` — 確認 + 提交到 Sheet 4
- `notify_manager()` — Email 通知經理
- ConversationHandler: WAITING_ID → SELECT_TYPE → INPUT_START → INPUT_END → INPUT_REASON → CONFIRMING

**OffboardingBot** — 繼承 BaseBot，增加：
- `generate_application()` — 自動生成離職申請
- `submit_offboarding()` — 寫入 Sheet 5 + Email HR & 經理
- `create_checklist()` — 產生離職 Checklist

### 4.7 BotManager (`manager.py`)

```python
class BotManager:
    def __init__(self, config: Config): ...

    async def start_all(self) -> None:
        """啟動所有 enabled 的 Bot，使用 asyncio.gather"""
        tasks = []
        for name, bot in self.bots.items():
            if bot.config.enabled:
                tasks.append(bot.run_polling())
        await asyncio.gather(*tasks)

    def run(self) -> None:
        """CLI 入口點"""
        asyncio.run(self.start_all())
```

## 5. 假期餘額計算邏輯

```python
def get_leave_balance(employee_id: str, leave_type: str) -> float:
    # 1. 從員工名冊讀取年假額度
    quota = employee.annual_leave_quota  # 年假
    # 其他假別有固定額度：事假10, 喪假3, 婚假5, 陪產假15

    # 2. 從請假記錄統計已用天數（當年度，status=approved）
    used = sum(record.days for record in approved_leaves
               if record.leave_type == leave_type
               and record.start_date.year == current_year)

    # 3. 返回剩餘
    return quota - used
    # 病假/產假 返回 float('inf')
```

## 6. 重複提交檢測

```python
def check_duplicate(worksheet_name: str, employee_id: str, **filters) -> bool:
    # 入職：同一 employee_id 在 onboarding sheet 已有 submitted 記錄
    # 工作證：同一 employee_id 在當月已有申請
    # 請假：同一 employee_id + 同日期範圍 + pending/approved
    # 離職：同一 employee_id 已有 pending 離職記錄
```

## 7. config.json 結構

```json
{
  "bots": {
    "onboarding": { "token": "BOT_TOKEN_1", "enabled": true },
    "work_permit": { "token": "BOT_TOKEN_2", "enabled": true },
    "leave": { "token": "BOT_TOKEN_3", "enabled": true },
    "offboarding": { "token": "BOT_TOKEN_4", "enabled": true }
  },
  "google_sheet_id": "SHEET_ID",
  "google_credentials_file": "credentials.json",
  "smtp": {
    "host": "smtp.gmail.com",
    "port": 587,
    "user": "bot@company.com",
    "password": "APP_PASSWORD"
  },
  "hr_email": "hr@company.com"
}
```

## 8. 風險與緩解

| 風險 | 影響 | 緩解 |
|------|------|------|
| Google Sheets API 限額 (60 req/min) | 高並發時被限流 | 加入快取 + 批次寫入 |
| Bot Token 洩漏 | 安全風險 | config.json 加入 .gitignore |
| 員工冒用他人 ID | 數據錯誤 | V1 信任制，V2 可加 Telegram user binding |
| Sheet 當 DB 的並發問題 | 資料不一致 | 寫入時加鎖（gspread 不支援，用 append 避免衝突） |

## 9. 測試策略

- **Unit tests**: mock gspread/telegram，測試各 Bot 邏輯
- **Integration tests**: 用真實 Sheet + test Bot token
- **手動測試**: 4 個 Bot 完整流程走一遍

---

> **S1 Status**: ✅ dev_spec 完成
> **Next**: S2 Spec Review → S3 Implementation Plan → S4 Implementation
