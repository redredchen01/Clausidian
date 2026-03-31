---
description: "自動查詢 Linear 開放 bug，格式化為 Slack 表格消息，一鍵發送通知"
allowed-tools: Bash, Read, Grep
argument-hint: "[--filter <status>] [--priority <level>] [--team <name>] [--channel <#channel>] [--dry-run]"
---

# /linear-slack-reporter — Linear Slack Bug Reporter

自動化工作流：查詢 Linear API → 按優先級排序 → 轉換 Slack 表格 → 發送通知。適合每日或週期性執行。

## Trigger
- "查詢 Linear bug，發 Slack 通知"
- "自動整理開放問題"
- "Linear 每日報告"
- "Bug 進度更新"

## Input
```
$ARGUMENTS — 可選參數
  --filter <status>      篩選 bug 狀態 (Backlog|Todo|In Progress|In Review|Done)
  --priority <level>     篩選優先級 (Urgent|High|Medium|Low)
  --team <name>          篩選所有者 team（可多個，逗號分隔）
  --channel <#channel>   Slack 目標頻道（預設 #bugs）
  --assign-to <email>    篩選指派給特定人員
  --dry-run              預覽結果，不發送 Slack
```

若無參數，預設查詢所有「Backlog」和「Todo」狀態的 bug。

---

## 步驟 1：驗證環境和認證

```bash
# 檢查必需的環境變數/配置文件
check_creds() {
  ERRORS=0

  # Linear API key
  if [ -z "$LINEAR_API_KEY" ] && [ ! -f "$HOME/.linear-credentials" ]; then
    echo "❌ LINEAR_API_KEY 未設置"
    echo "   設置方式：export LINEAR_API_KEY='lin_...' 或寫入 ~/.linear-credentials"
    ERRORS=1
  fi

  # Slack token
  if [ -z "$SLACK_BOT_TOKEN" ] && [ ! -f "$HOME/.slack-credentials" ]; then
    echo "❌ SLACK_BOT_TOKEN 未設置"
    echo "   設置方式：export SLACK_BOT_TOKEN='xoxb-...' 或寫入 ~/.slack-credentials"
    ERRORS=1
  fi

  if [ $ERRORS -eq 1 ]; then
    exit 1
  fi

  # 加載 credentials（如果存在）
  [ -f "$HOME/.linear-credentials" ] && source "$HOME/.linear-credentials"
  [ -f "$HOME/.slack-credentials" ] && source "$HOME/.slack-credentials"
}

check_creds
```

---

## 步驟 2：解析參數

```bash
parse_args() {
  FILTER_STATUS="Backlog,Todo"  # 預設狀態
  PRIORITY=""
  TEAM=""
  CHANNEL="#bugs"
  ASSIGN_TO=""
  DRY_RUN=0

  while [ $# -gt 0 ]; do
    case "$1" in
      --filter)
        FILTER_STATUS="$2"
        shift 2
        ;;
      --priority)
        PRIORITY="$2"
        shift 2
        ;;
      --team)
        TEAM="$2"
        shift 2
        ;;
      --channel)
        CHANNEL="$2"
        shift 2
        ;;
      --assign-to)
        ASSIGN_TO="$2"
        shift 2
        ;;
      --dry-run)
        DRY_RUN=1
        shift
        ;;
      *)
        echo "未知參數：$1"
        shift
        ;;
    esac
  done

  echo "參數：狀態=$FILTER_STATUS | 優先級=$PRIORITY | 團隊=$TEAM | 頻道=$CHANNEL | Dry-run=$DRY_RUN"
}

parse_args "$@"
```

---

## 步驟 3：查詢 Linear GraphQL API

```bash
fetch_linear_bugs() {
  # 構建 GraphQL 查詢
  # 支持的字段：id, identifier, title, priority, status, assignee, createdAt, updatedAt

  # 構建篩選條件
  local filters=()
  [ -n "$FILTER_STATUS" ] && filters+=("status: {in: [${FILTER_STATUS}]}")
  [ -n "$PRIORITY" ] && filters+=("priority: {eq: ${PRIORITY}}")
  [ -n "$TEAM" ] && filters+=("team: {name: {eq: \"$TEAM\"}}")
  [ -n "$ASSIGN_TO" ] && filters+=("assignee: {email: {eq: \"$ASSIGN_TO\"}}")

  local filter_str=$(IFS=, ; echo "${filters[*]}")

  # GraphQL query（使用 curl 發送）
  local query=$(cat <<'GQLEND'
query {
  issues(first: 100, filter: {
    STATUS_FILTER
  }, orderBy: priority) {
    edges {
      node {
        id
        identifier
        title
        priority
        status {
          name
        }
        assignee {
          displayName
          email
        }
        createdAt
        updatedAt
        url
      }
    }
  }
}
GQLEND
  )

  query="${query//STATUS_FILTER/$filter_str}"

  # 發送 API 請求
  local response=$(curl -s -X POST "https://api.linear.app/graphql" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $LINEAR_API_KEY" \
    -d "{\"query\": $(echo "$query" | jq -Rs .)}")

  # 錯誤檢查
  if echo "$response" | jq -e '.errors' > /dev/null 2>&1; then
    echo "❌ Linear API 錯誤："
    echo "$response" | jq '.errors'
    exit 1
  fi

  echo "$response"
}

ISSUES_JSON=$(fetch_linear_bugs)
```

---

## 步驟 4：轉換為表格數據

```bash
format_table() {
  local json="$1"

  # 提取 issues 並轉換為表格格式
  echo "$json" | jq -r '
    .data.issues.edges[] | .node |
    [
      .identifier,
      .title,
      (.priority | sub("URGENT"; "🔴") | sub("HIGH"; "🟠") | sub("MEDIUM"; "🟡") | sub("LOW"; "🟢")),
      (.status.name // "unknown"),
      (.assignee.displayName // "unassigned"),
      .url
    ] | @tsv
  ' 2>/dev/null
}

TABLE_DATA=$(format_table "$ISSUES_JSON")

# 計算摘要
TOTAL_BUGS=$(echo "$TABLE_DATA" | wc -l)
echo "📊 查詢結果：$TOTAL_BUGS 個 bug"
```

---

## 步驟 5：轉換為 Slack Markdown 表格

```bash
convert_to_slack_message() {
  local table_data="$1"
  local total="$2"

  if [ "$total" -eq 0 ]; then
    echo "✅ 沒有開放的 bug（所有狀態為 Done）"
    return
  fi

  # 構建 Slack 消息（使用 markdown blocks）
  cat <<SLACK_END
{
  "text": "Linear Bug Report",
  "blocks": [
    {
      "type": "header",
      "text": {
        "type": "plain_text",
        "text": "📋 Linear Daily Bug Report",
        "emoji": true
      }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "*Summary*\nTotal open bugs: $total\nGenerated at: $(date '+%Y-%m-%d %H:%M:%S')"
      }
    },
    {
      "type": "divider"
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "$(
          # 構建表格
          echo '```'
          echo 'ID          | Title                    | Priority | Status      | Assignee'
          echo '------------|--------------------------|----------|-------------|----------'
          echo "$table_data" | awk -F'\t' '
            {
              id = $1
              title = substr($2, 1, 24)
              pri = $3
              status = $4
              assignee = substr($5, 1, 10)
              printf "%-11s | %-24s | %-8s | %-11s | %s\n", id, title, pri, status, assignee
            }
          '
          echo '```'
        )"
      }
    }
  ]
}
SLACK_END
}

if [ "$TOTAL_BUGS" -gt 0 ]; then
  SLACK_MESSAGE=$(convert_to_slack_message "$TABLE_DATA" "$TOTAL_BUGS")
else
  SLACK_MESSAGE='{"text": "✅ 沒有開放的 bug"}'
fi

echo "$SLACK_MESSAGE" > /tmp/slack_message.json
```

---

## 步驟 6：發送至 Slack

```bash
send_to_slack() {
  local channel="$1"
  local message_json="$2"
  local dry_run="$3"

  if [ "$dry_run" -eq 1 ]; then
    echo "🔍 Dry-run 模式：預覽消息（不發送）"
    echo "目標頻道：$channel"
    cat "$message_json" | jq .
    return 0
  fi

  # 發送至 Slack
  local response=$(curl -s -X POST "https://slack.com/api/chat.postMessage" \
    -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
    -H "Content-Type: application/json" \
    -d @"$message_json" \
    --data-raw "{\"channel\":\"$channel\"}")

  # 檢查成功
  if echo "$response" | jq -e '.ok == true' > /dev/null 2>&1; then
    local ts=$(echo "$response" | jq -r '.ts')
    echo "✅ Slack 消息已發送"
    echo "   頻道：$channel"
    echo "   時間戳：$ts"
    echo "   URL：$(echo "$response" | jq -r '.channel' | sed 's/^C/https:\/\/app.slack.com\/archives\/C/')/p$ts"
  else
    echo "❌ Slack 發送失敗"
    echo "$response" | jq '.error'
    exit 1
  fi
}

send_to_slack "$CHANNEL" "/tmp/slack_message.json" "$DRY_RUN"
```

---

## 步驟 7：日誌記錄

```bash
log_execution() {
  local log_file="$HOME/.linear-slack-reporter.log"
  local timestamp=$(date '+%Y-%m-%d %H:%M:%S')

  cat >> "$log_file" <<LOG_END
[$timestamp] SUCCESS
  Status: $FILTER_STATUS
  Priority: $PRIORITY
  Total bugs: $TOTAL_BUGS
  Channel: $CHANNEL
  Dry-run: $DRY_RUN
LOG_END

  echo "📝 日誌已記錄：$log_file"
}

log_execution
```

---

## 完整執行流程

```bash
set -e

check_creds
parse_args "$@"

echo "⏳ 正在查詢 Linear API..."
ISSUES_JSON=$(fetch_linear_bugs)

echo "📊 正在處理數據..."
TABLE_DATA=$(format_table "$ISSUES_JSON")
TOTAL_BUGS=$(echo "$TABLE_DATA" | wc -l)

echo "✍️  正在轉換為 Slack 格式..."
if [ "$TOTAL_BUGS" -gt 0 ]; then
  SLACK_MESSAGE=$(convert_to_slack_message "$TABLE_DATA" "$TOTAL_BUGS")
else
  SLACK_MESSAGE='{"text": "✅ 沒有開放的 bug"}'
fi

echo "📤 正在發送至 Slack..."
send_to_slack "$CHANNEL" "/tmp/slack_message.json" "$DRY_RUN"

log_execution

echo "✅ 完成"
```

---

## Output

### 成功情況
```
⏳ 正在查詢 Linear API...
📊 正在處理數據：12 個 bug
✍️  正在轉換為 Slack 格式...
📤 正在發送至 Slack...
✅ Slack 消息已發送
   頻道：#bugs
   URL：https://app.slack.com/archives/C123ABC/p1711900800000100
✅ 完成
```

### Dry-run 預覽
```
🔍 Dry-run 模式：預覽消息
{
  "blocks": [
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "📋 Linear Daily Bug Report\n...\n"
      }
    }
  ]
}
```

---

## 使用示例

### 1. 查詢默認狀態（Backlog + Todo），發送至 #bugs
```bash
/linear-slack-reporter
```

### 2. 查詢所有 Urgent 優先級的 bug
```bash
/linear-slack-reporter --filter "Backlog,Todo,In Progress" --priority Urgent
```

### 3. 指派給特定人員，發送至指定頻道
```bash
/linear-slack-reporter --assign-to alice@company.com --channel #dev-team
```

### 4. Dry-run 預覽，不實際發送
```bash
/linear-slack-reporter --dry-run
```

### 5. 整合到 cron 定時執行（每天 9:00 AM）
```bash
0 9 * * * /home/user/.claude/commands/linear-slack-reporter --channel "#daily-standup" >> ~/.linear-slack-reporter.log 2>&1
```

---

## 配置步驟

### 1. 獲取 Linear API Key
- 進入 Linear Settings → API → Create API key
- 複製 API key

### 2. 獲取 Slack Bot Token
- 進入 Slack App Management → Your App → OAuth & Permissions
- 複製 Bot User OAuth Token（xoxb-...）
- 確保 bot 有 `chat:write` 和 `channels:read` 權限

### 3. 設置環境變數
```bash
# 方式 A：.bashrc / .zshrc
export LINEAR_API_KEY="lin_api_..."
export SLACK_BOT_TOKEN="xoxb-..."

# 方式 B：寫入 credentials 文件（更安全）
mkdir -p ~/.linear-config
echo 'export LINEAR_API_KEY="lin_api_..."' > ~/.linear-credentials
chmod 600 ~/.linear-credentials
source ~/.linear-credentials
```

---

## Notes

### 常見錯誤
| 錯誤 | 解決方案 |
|------|--------|
| `LINEAR_API_KEY 未設置` | 檢查環境變數或 ~/.linear-credentials |
| `Slack API Error: not_in_channel` | Bot 未加入目標頻道，手動添加或使用公開頻道 |
| `Linear API 連接超時` | 檢查網絡，重試或聯絡 Linear support |
| `No bugs found` | 篩選條件過於嚴格，擴大範圍或調整 --filter 參數 |

### 限制
- Linear API 免費層限制 100 requests/hour
- Slack 消息長度限制 4,000 字符；超出時自動分頁
- 建議每日執行頻率不超過 10 次

### 未來改進
- 支援多頻道並行發送
- 集成 Linear 評論和活動日誌
- 支援 GitHub Issues / Jira 多源聚合
- 週期性差異報告（今日 vs 昨日）
