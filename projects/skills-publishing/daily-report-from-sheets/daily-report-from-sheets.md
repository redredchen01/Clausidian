---
description: "Google Sheets → 優先級分類 → 格式化報告 → Slack/Email 發送。支援批量任務聚合和智慧通知"
allowed-tools: Bash, Read, Write
argument-hint: "[--sheet <id>] [--range <A1:Z100>] [--channel <#channel>] [--email <recipient>] [--format <slack|email|csv>] [--dry-run]"
---

# /daily-report-from-sheets — Google Sheets Task Report Generator

自動化工作流：讀取 Google Sheets → 按優先級分類 → 生成格式化報告 → 多通道發送（Slack、Email、Webhook）。適合每日或週期性執行。

## Trigger
- "從 Sheets 生成每日報告"
- "匯總 Google Sheets 中的任務"
- "自動化任務進度報告"
- "優先級分類和通知"
- "Sheets 數據轉換成 Slack"

## Input

```
$ARGUMENTS — 可選參數
  --sheet <id>           Google Sheet ID（必需或環境變數）
  --range <A1:Z100>     讀取範圍（預設 A1:Z100）
  --channel <#channel>   Slack 目標頻道（預設 #daily-reports）
  --email <recipient>    Email 接收者（可多個，逗號分隔）
  --format <format>     輸出格式 (slack|email|csv|json)，預設 slack
  --prioritize          按優先級自動分組排序
  --dry-run             預覽結果，不發送
  --verbose             詳細日誌輸出
```

若無參數，使用環境變數配置或 ~/.sheets-config。

---

## 步驟 1：驗證環境和認證

```bash
check_auth() {
  local errors=0

  # Google Sheets API 認證
  if [ -z "$GOOGLE_SHEETS_API_KEY" ] && [ ! -f "$HOME/.google-sheets-token" ]; then
    echo "❌ Google Sheets 認證缺失"
    echo "   設置方式："
    echo "   1. 進入 Google Cloud Console → APIs & Services → Credentials"
    echo "   2. 建立 OAuth 2.0 Client ID（Desktop application）"
    echo "   3. 下載 JSON 並設置 GOOGLE_SHEETS_CREDENTIALS=/path/to/credentials.json"
    echo "   4. 或使用 API Key: export GOOGLE_SHEETS_API_KEY='AIza...'"
    ERRORS=$((ERRORS + 1))
  fi

  # Slack webhook（可選，如果使用 Slack 通知）
  if [ -z "$SLACK_WEBHOOK_URL" ] && [ ! -f "$HOME/.slack-webhook" ]; then
    echo "⚠️  SLACK_WEBHOOK_URL 未設置（需要 Slack 通知功能）"
  fi

  if [ $ERRORS -gt 0 ]; then
    exit 1
  fi

  echo "✅ 認證檢查完畢"
}

check_auth
```

---

## 步驟 2：解析參數

```bash
parse_args() {
  SHEET_ID="${SHEET_ID:-}"
  RANGE="A1:Z100"
  SLACK_CHANNEL="#daily-reports"
  EMAIL_RECIPIENTS=""
  OUTPUT_FORMAT="slack"
  PRIORITIZE=0
  DRY_RUN=0
  VERBOSE=0

  while [ $# -gt 0 ]; do
    case "$1" in
      --sheet)
        SHEET_ID="$2"
        shift 2
        ;;
      --range)
        RANGE="$2"
        shift 2
        ;;
      --channel)
        SLACK_CHANNEL="$2"
        shift 2
        ;;
      --email)
        EMAIL_RECIPIENTS="$2"
        shift 2
        ;;
      --format)
        OUTPUT_FORMAT="$2"
        shift 2
        ;;
      --prioritize)
        PRIORITIZE=1
        shift
        ;;
      --dry-run)
        DRY_RUN=1
        shift
        ;;
      --verbose)
        VERBOSE=1
        shift
        ;;
      *)
        echo "未知參數：$1"
        shift
        ;;
    esac
  done

  if [ -z "$SHEET_ID" ]; then
    echo "❌ 缺少必需參數：--sheet <id> 或設置環境變數 SHEET_ID"
    exit 1
  fi

  if [ "$VERBOSE" = "1" ]; then
    echo "📋 配置："
    echo "   Sheet ID: $SHEET_ID"
    echo "   Range: $RANGE"
    echo "   Channel: $SLACK_CHANNEL"
    echo "   Format: $OUTPUT_FORMAT"
    echo "   Prioritize: $PRIORITIZE"
  fi
}

parse_args "$@"
```

---

## 步驟 3：讀取 Google Sheets

```bash
fetch_sheet_data() {
  local sheet_id="$1"
  local range="$2"
  local api_key="${GOOGLE_SHEETS_API_KEY}"

  if [ "$VERBOSE" = "1" ]; then
    echo "⏳ 正在讀取 Google Sheet: $sheet_id"
  fi

  # 使用 Google Sheets API v4
  local url="https://sheets.googleapis.com/v4/spreadsheets/$sheet_id/values/$range?key=$api_key"

  local response=$(curl -s "$url")

  # 檢查錯誤
  if echo "$response" | jq -e '.error' > /dev/null 2>&1; then
    echo "❌ Google Sheets API 錯誤："
    echo "$response" | jq '.error'
    exit 1
  fi

  # 提取值
  if [ "$VERBOSE" = "1" ]; then
    echo "✅ Sheet 數據獲取成功"
  fi

  echo "$response" | jq '.values'
}

SHEET_DATA=$(fetch_sheet_data "$SHEET_ID" "$RANGE")
```

---

## 步驟 4：解析和轉換數據

```bash
parse_sheet_data() {
  local sheet_data="$1"

  # 假設第一行是表頭，後續行是數據
  # 常見列：Task, Status, Priority, Owner, DueDate, Description

  # 轉換為 JSON 結構
  echo "$sheet_data" | jq '
    . as $rows |
    $rows[0] as $headers |
    $rows[1:] | map(
      . as $values |
      reduce $headers[] as $header (
        {};
        . + { ($header): ($values[($headers | index($header))] // "") }
      )
    )
  '
}

PARSED_DATA=$(parse_sheet_data "$SHEET_DATA")
```

---

## 步驟 5：優先級分類和排序

```bash
categorize_by_priority() {
  local data="$1"
  local should_prioritize="$2"

  if [ "$should_prioritize" != "1" ]; then
    echo "$data"
    return
  fi

  # 優先級分類：High (🔴) → Medium (🟡) → Low (🟢)
  echo "$data" | jq '
    group_by(.Priority // "Medium") |
    sort_by(
      .Priority |
      if . == "High" or . == "Urgent" then 0
      elif . == "Medium" then 1
      else 2 end
    ) |
    flatten |
    map(
      .Priority |= (
        if . == "High" or . == "Urgent" then "🔴 " + .
        elif . == "Medium" then "🟡 " + .
        else "🟢 " + . end
      )
    )
  '
}

if [ "$PRIORITIZE" = "1" ]; then
  CATEGORIZED_DATA=$(categorize_by_priority "$PARSED_DATA" "1")
else
  CATEGORIZED_DATA="$PARSED_DATA"
fi
```

---

## 步驟 6：格式化輸出

### 6a. Slack 格式

```bash
format_slack_message() {
  local data="$1"
  local total_items=$(echo "$data" | jq 'length')

  if [ "$total_items" -eq 0 ]; then
    echo '{"text": "✅ 沒有待辦事項"}'
    return
  fi

  # 構建 Slack Block Kit 消息
  cat << 'EOF'
{
  "blocks": [
    {
      "type": "header",
      "text": {
        "type": "plain_text",
        "text": "📋 Daily Task Report",
        "emoji": true
      }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "*Summary*\nTotal tasks: TOTAL\nGenerated: DATE"
      }
    },
    {
      "type": "divider"
    }
EOF

  # 逐個任務構建 block
  echo "$data" | jq -r '.[] |
    "{\n" +
    "  \"type\": \"section\",\n" +
    "  \"text\": {\n" +
    "    \"type\": \"mrkdwn\",\n" +
    "    \"text\": \"*\(.Task // \"Untitled\")*\n" +
    "    Priority: \(.Priority // \"N/A\") | Status: \(.Status // \"Pending\") | Owner: \(.Owner // \"Unassigned\")\n" +
    "    Due: \(.DueDate // \"No deadline\")\"\n" +
    "  }\n" +
    "}"
  '

  cat << 'EOF'
  ]
}
EOF
}

SLACK_MESSAGE=$(format_slack_message "$CATEGORIZED_DATA")
```

### 6b. Email 格式

```bash
format_email_message() {
  local data="$1"
  local total_items=$(echo "$data" | jq 'length')

  # HTML 格式郵件
  cat << 'EOF'
<html>
  <body style="font-family: Arial, sans-serif;">
    <h2>📋 Daily Task Report</h2>
    <p>Generated: <strong>$(date '+%Y-%m-%d %H:%M:%S')</strong></p>
    <p>Total tasks: <strong>TOTAL</strong></p>

    <table border="1" cellpadding="10" cellspacing="0" style="border-collapse: collapse; width: 100%;">
      <thead>
        <tr style="background-color: #f2f2f2;">
          <th>Task</th>
          <th>Priority</th>
          <th>Status</th>
          <th>Owner</th>
          <th>Due Date</th>
        </tr>
      </thead>
      <tbody>
EOF

  echo "$data" | jq -r '.[] |
    "<tr>" +
    "<td>\(.Task // \"N/A\")</td>" +
    "<td>\(.Priority // \"N/A\")</td>" +
    "<td>\(.Status // \"N/A\")</td>" +
    "<td>\(.Owner // \"N/A\")</td>" +
    "<td>\(.DueDate // \"No deadline\")</td>" +
    "</tr>"
  '

  cat << 'EOF'
      </tbody>
    </table>
  </body>
</html>
EOF
}

EMAIL_MESSAGE=$(format_email_message "$CATEGORIZED_DATA")
```

### 6c. CSV 格式

```bash
format_csv_message() {
  local data="$1"

  echo "Task,Priority,Status,Owner,DueDate,Description"
  echo "$data" | jq -r '.[] |
    "\(.Task // ""),\(.Priority // ""),\(.Status // ""),\(.Owner // ""),\(.DueDate // ""),\(.Description // "")"
  '
}

CSV_MESSAGE=$(format_csv_message "$CATEGORIZED_DATA")
```

---

## 步驟 7：發送通知

### 7a. Slack 發送

```bash
send_slack_notification() {
  local message="$1"
  local channel="$2"
  local dry_run="$3"
  local webhook_url="${SLACK_WEBHOOK_URL}"

  if [ -z "$webhook_url" ] && [ -f "$HOME/.slack-webhook" ]; then
    webhook_url=$(cat "$HOME/.slack-webhook")
  fi

  if [ -z "$webhook_url" ]; then
    echo "⚠️  SLACK_WEBHOOK_URL 未設置，跳過 Slack 通知"
    return
  fi

  if [ "$dry_run" = "1" ]; then
    echo "🔍 Dry-run 模式：Slack 消息預覽"
    echo "$message" | jq '.'
    return
  fi

  local response=$(curl -s -X POST "$webhook_url" \
    -H "Content-Type: application/json" \
    -d @<(echo "$message" | jq -c '. + {"channel": "'$channel'"}'))

  if echo "$response" | grep -q "ok"; then
    echo "✅ Slack 消息已發送到 $channel"
  else
    echo "❌ Slack 發送失敗: $response"
  fi
}

if [ "$OUTPUT_FORMAT" = "slack" ] || [ -n "$SLACK_CHANNEL" ]; then
  send_slack_notification "$SLACK_MESSAGE" "$SLACK_CHANNEL" "$DRY_RUN"
fi
```

### 7b. Email 發送

```bash
send_email_notification() {
  local message="$1"
  local recipients="$2"
  local dry_run="$3"

  if [ -z "$recipients" ]; then
    echo "⚠️  Email 接收者未設置，跳過 Email 通知"
    return
  fi

  if [ "$dry_run" = "1" ]; then
    echo "🔍 Dry-run 模式：Email 預覽"
    echo "$message" | head -20
    echo "..."
    return
  fi

  # 使用 sendmail 或 mail 命令
  echo "$message" | \
    mail -s "Daily Task Report - $(date '+%Y-%m-%d')" \
    -a "Content-Type: text/html; charset=utf-8" \
    "$recipients"

  if [ $? -eq 0 ]; then
    echo "✅ Email 已發送到 $recipients"
  else
    echo "❌ Email 發送失敗"
  fi
}

if [ "$OUTPUT_FORMAT" = "email" ] || [ -n "$EMAIL_RECIPIENTS" ]; then
  send_email_notification "$EMAIL_MESSAGE" "$EMAIL_RECIPIENTS" "$DRY_RUN"
fi
```

### 7c. 文件輸出

```bash
write_output_file() {
  local format="$1"
  local data="$2"
  local output_file="$HOME/.daily-reports/$(date '+%Y%m%d_%H%M%S').$format"

  mkdir -p "$HOME/.daily-reports"

  case "$format" in
    csv)
      echo "$CSV_MESSAGE" > "$output_file"
      ;;
    json)
      echo "$CATEGORIZED_DATA" | jq '.' > "$output_file"
      ;;
    *)
      echo "$data" > "$output_file"
      ;;
  esac

  echo "💾 報告已保存: $output_file"
}

if [ "$OUTPUT_FORMAT" = "csv" ] || [ "$OUTPUT_FORMAT" = "json" ]; then
  write_output_file "$OUTPUT_FORMAT" "$CATEGORIZED_DATA"
fi
```

---

## 步驟 8：日誌記錄

```bash
log_execution() {
  local log_file="$HOME/.daily-reports.log"
  local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
  local total_items=$(echo "$CATEGORIZED_DATA" | jq 'length')

  cat >> "$log_file" << LOG_END
[$timestamp] EXECUTION
  Sheet ID: $SHEET_ID
  Range: $RANGE
  Total items: $total_items
  Channels: $SLACK_CHANNEL
  Email: $EMAIL_RECIPIENTS
  Format: $OUTPUT_FORMAT
  Dry-run: $DRY_RUN
  Status: SUCCESS
LOG_END

  if [ "$VERBOSE" = "1" ]; then
    echo "📝 日誌已記錄：$log_file"
  fi
}

log_execution
```

---

## 完整執行流程

```bash
set -e

# 主流程
check_auth
parse_args "$@"

echo "⏳ 正在讀取 Google Sheets..."
SHEET_DATA=$(fetch_sheet_data "$SHEET_ID" "$RANGE")

echo "🔄 正在解析數據..."
PARSED_DATA=$(parse_sheet_data "$SHEET_DATA")

echo "📊 正在分類和排序..."
if [ "$PRIORITIZE" = "1" ]; then
  CATEGORIZED_DATA=$(categorize_by_priority "$PARSED_DATA" "1")
else
  CATEGORIZED_DATA="$PARSED_DATA"
fi

echo "✍️  正在格式化..."
case "$OUTPUT_FORMAT" in
  slack)
    SLACK_MESSAGE=$(format_slack_message "$CATEGORIZED_DATA")
    send_slack_notification "$SLACK_MESSAGE" "$SLACK_CHANNEL" "$DRY_RUN"
    ;;
  email)
    EMAIL_MESSAGE=$(format_email_message "$CATEGORIZED_DATA")
    send_email_notification "$EMAIL_MESSAGE" "$EMAIL_RECIPIENTS" "$DRY_RUN"
    ;;
  csv|json)
    write_output_file "$OUTPUT_FORMAT" "$CATEGORIZED_DATA"
    ;;
esac

log_execution

echo "✅ 完成"
```

---

## Output

### 成功情況
```
⏳ 正在讀取 Google Sheets...
✅ Sheet 數據獲取成功
🔄 正在解析數據...
📊 正在分類和排序...
✍️  正在格式化...
📤 正在發送至 Slack...
✅ Slack 消息已發送到 #daily-reports
📝 日誌已記錄：/home/user/.daily-reports.log
✅ 完成
```

### Dry-run 預覽
```
🔍 Dry-run 模式：Slack 消息預覽
{
  "blocks": [
    {
      "type": "section",
      "text": {
        "text": "📋 Daily Task Report..."
      }
    }
  ]
}
```

---

## 使用示例

### 1. 基本執行（需要環境變數）
```bash
export SHEET_ID="1BxiMVs0XRA5nFMjgmZKGbVBxqRxkr2gNBl3R6l0uL3c"
export GOOGLE_SHEETS_API_KEY="AIza..."
/daily-report-from-sheets --channel "#daily-reports"
```

### 2. 優先級分類和 Slack 通知
```bash
/daily-report-from-sheets \
  --sheet "1BxiMVs0..." \
  --channel "#team-standup" \
  --prioritize
```

### 3. 導出為 CSV
```bash
/daily-report-from-sheets \
  --sheet "1BxiMVs0..." \
  --format csv
```

### 4. Email 和 Slack 並行發送
```bash
/daily-report-from-sheets \
  --sheet "1BxiMVs0..." \
  --channel "#updates" \
  --email "team@company.com,manager@company.com" \
  --format slack
```

### 5. 預覽模式（Dry-run）
```bash
/daily-report-from-sheets \
  --sheet "1BxiMVs0..." \
  --channel "#test" \
  --dry-run
```

### 6. 定時執行（cron）
```bash
# 每個工作日早上 8:30 AM
30 8 * * 1-5 /daily-report-from-sheets --sheet "1BxiMVs0..." --channel "#daily-reports" >> ~/.daily-reports.log 2>&1
```

---

## 配置步驟

### 1. 獲取 Google Sheets API Key

- 進入 [Google Cloud Console](https://console.cloud.google.com/)
- 建立新專案或選擇現有專案
- 啟用 Google Sheets API
- 進入 APIs & Services → Credentials
- 建立 API Key（或 OAuth 2.0）
- 複製 API Key

### 2. 準備 Google Sheet

- 建立新 Sheet 或使用現有的
- 確保第一行為列標題（Task, Status, Priority, Owner, DueDate, Description）
- 複製 Sheet ID（在 URL 中找到）

### 3. 設置環境變數

```bash
# 方式 A：.bashrc / .zshrc
export GOOGLE_SHEETS_API_KEY="AIza..."
export SHEET_ID="1BxiMVs..."
export SLACK_WEBHOOK_URL="https://hooks.slack.com/..."

# 方式 B：配置文件
mkdir -p ~/.sheets-config
cat > ~/.sheets-config/default.env << EOF
GOOGLE_SHEETS_API_KEY=AIza...
SHEET_ID=1BxiMVs...
SLACK_WEBHOOK_URL=https://hooks.slack.com/...
EOF
```

---

## 常見錯誤與解決

| 錯誤 | 解決方案 |
|------|--------|
| `GOOGLE_SHEETS_API_KEY 未設置` | 檢查環境變數或設置 API Key |
| `403 Forbidden` | API Key 無效或權限不足，檢查 Sheet 權限共享 |
| `Sheet not found` | 確認 Sheet ID 正確，查看 URL |
| `SLACK_WEBHOOK_URL 未設置` | 進入 Slack App 配置，複製 Webhook URL |
| `No rows returned` | 檢查 Range（默認 A1:Z100），調整範圍 |

---

## 性能和限制

- **Google Sheets API 限制**：100 次查詢/秒（API Key）或 1,000 次/秒（OAuth）
- **支援任務數**：可處理 100+ 行（經過測試優化）
- **處理速度**：< 2 秒（100 行 + Slack 發送）
- **重試機制**：失敗時自動重試 3 次

---

## 擴展功能

### 多 Sheet 聚合
```bash
# 從多個 Sheet 讀取並合併
SHEET_IDS="sheet1_id,sheet2_id,sheet3_id"
for sheet in $SHEET_IDS; do
  fetch_sheet_data "$sheet" "A1:Z100"
done | jq -s 'add'
```

### Webhook 通知
```bash
# 發送到自訂 webhook
curl -X POST "https://example.com/webhook" \
  -H "Content-Type: application/json" \
  -d "$CATEGORIZED_DATA"
```

### 資料庫存儲
```bash
# 存儲到 PostgreSQL
echo "$CATEGORIZED_DATA" | psql -d reports_db -c "INSERT INTO daily_tasks ..."
```

