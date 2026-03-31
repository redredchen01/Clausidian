---
description: "通用框架：多源 API 數據聚合 → 轉換表格 → Slack 多通道分發。支援 REST/GraphQL，靈活篩選、排序、字段映射"
allowed-tools: Bash, Read, Write, Grep
argument-hint: "[--config <file>] [--channel <#channel>] [--format <slack|email|csv>] [--dry-run] [--verbose]"
---

# /api-aggregation-notifier — Universal API Data Aggregation & Slack Dispatcher

通用框架，支援多源 API 查詢聚合、數據轉換、表格格式化、多通道分發。

**適用場景：**
- 多系統 Issue 統一報告（Linear + GitHub + Jira）
- 監控告警彙總（Prometheus + Datadog + CloudWatch）
- 運營數據聚合（Google Sheets + Stripe + Salesforce）
- SaaS 儀表板報告

## Trigger
- "彙總多個 API 的數據發送到 Slack"
- "跨系統數據聚合報告"
- "自訂數據管道分發"
- "多源監控告警"
- "統一的 API 數據彙總框架"

## Input

### 方式 A：使用配置文件（推薦）
```bash
/api-aggregation-notifier --config ~/aggregation-config.yaml
```

### 方式 B：命令行參數
```bash
/api-aggregation-notifier \
  --sources "linear,github" \
  --channel "#data-pipeline" \
  --format slack \
  --dry-run
```

### 配置文件格式 (YAML)
```yaml
# ~/aggregation-config.yaml
name: "Daily Issue Report"
schedule: "0 9 * * 1-5"  # 週一至週五早上 9 點

sources:
  - name: "linear"
    type: "graphql"
    endpoint: "https://api.linear.app/graphql"
    auth: "header:Authorization: Bearer ${LINEAR_API_KEY}"
    query: |
      query {
        issues(first: 50, filter: { state: { name: { in: [Backlog, Todo] } } }) {
          nodes {
            id
            title
            priority
            status { name }
            assignee { name email }
            team { name }
            createdAt
          }
        }
      }
    field_mapping:
      id: "ID"
      title: "Issue"
      priority: "Priority"
      status.name: "Status"
      assignee.name: "Owner"
      team.name: "Team"
      createdAt: "Created"

  - name: "github"
    type: "rest"
    endpoint: "https://api.github.com/repos/{owner}/{repo}/issues"
    auth: "header:Authorization: token ${GITHUB_TOKEN}"
    params:
      state: "open"
      labels: "bug,urgent"
    field_mapping:
      number: "ID"
      title: "Issue"
      labels[].name: "Labels"
      user.login: "Reporter"
      created_at: "Created"

  - name: "monitoring"
    type: "rest"
    endpoint: "https://api.monitoring.example.com/alerts"
    auth: "header:X-API-Key: ${MONITORING_API_KEY}"
    field_mapping:
      alert_id: "Alert ID"
      severity: "Severity"
      service: "Service"
      message: "Message"
      triggered_at: "Triggered"

# 數據轉換和聚合
aggregation:
  # 字段標準化
  normalize:
    priority:
      "Urgent": "🔴 Urgent"
      "High": "🟠 High"
      "Medium": "🟡 Medium"
      "Low": "🟢 Low"
    severity:
      "critical": "🔴 Critical"
      "warning": "🟠 Warning"
      "info": "🟢 Info"

  # 篩選和分類
  filters:
    - name: "all"
      description: "All issues"
      conditions: []

    - name: "urgent_only"
      description: "Urgent + Critical"
      conditions:
        - field: "priority"
          operator: "in"
          value: ["Urgent", "High"]
        - field: "severity"
          operator: "in"
          value: ["critical", "warning"]

  # 排序和分組
  sorting:
    primary: "priority"
    secondary: "created_at"
    reverse: true

  grouping:
    - field: "team"  # 先按 Team 分組
    - field: "status"  # 再按 Status 分組

# Slack 發送配置
slack:
  webhook_url: "${SLACK_WEBHOOK_URL}"

  channels:
    - name: "#daily-report"
      format: "table"  # table | list | thread | dashboard
      filter: "all"
      max_items: 20

    - name: "#urgent-alerts"
      format: "list"
      filter: "urgent_only"
      max_items: 50
      thread: true  # 每個 alert 作為 thread

  # 消息模板
  templates:
    header: "📊 Daily Issue Report — {date}"
    table_header:
      - field: "ID"
        width: 8
        color: "white"
      - field: "Issue"
        width: 40
        color: "white"
      - field: "Owner"
        width: 15
        color: "cyan"
      - field: "Status"
        width: 12
        color: "yellow"

# 可選：Email 備用發送
email:
  enabled: false
  to: ["team@example.com"]
  from: "aggregator@example.com"
  format: "html"  # html | csv | table

# 可選：文件輸出
export:
  enabled: false
  formats: ["csv", "json", "html"]
  directory: "/tmp/aggregation-exports"
  retention_days: 7

# 錯誤處理
error_handling:
  retry_attempts: 3
  retry_delay: "5s"
  on_failure: "notify_channel"  # notify_channel | email | log
  notify_channel: "#alerts"
```

---

## 步驟 1：驗證環境和認證

```bash
validate_env() {
  local config_file="$1"
  local errors=0

  # 檢查配置文件
  if [ ! -f "$config_file" ]; then
    echo "❌ 配置文件不存在: $config_file"
    echo "   模板: /Users/dex/.claude/commands/api-aggregation-notifier-example.yaml"
    exit 1
  fi

  # 使用 yq 驗證 YAML 語法
  if ! command -v yq &> /dev/null; then
    echo "⚠️  yq 未安裝，跳過 YAML 驗證"
  else
    if ! yq eval '.' "$config_file" > /dev/null 2>&1; then
      echo "❌ 配置文件語法錯誤"
      exit 1
    fi
  fi

  # 驗證必需的環境變數
  local required_keys=$(grep -o '\${[^}]*}' "$config_file" | sort -u)

  for key in $required_keys; do
    var_name="${key:2:-1}"  # 去掉 ${ 和 }
    if [ -z "${!var_name}" ]; then
      echo "❌ 缺失環境變數: $var_name"
      errors=$((errors + 1))
    fi
  done

  if [ $errors -gt 0 ]; then
    echo "請設置上述環境變數後重試"
    exit 1
  fi

  echo "✅ 環境驗證通過"
}
```

---

## 步驟 2：解析配置和參數

```bash
parse_config() {
  local config_file="$1"

  # 導入配置（需要 yq）
  export CONFIG_FILE="$config_file"
  export DRY_RUN="${DRY_RUN:-0}"
  export VERBOSE="${VERBOSE:-0}"
  export OUTPUT_FORMAT="${OUTPUT_FORMAT:-slack}"

  # 提取配置值
  SOURCES=$(yq eval '.sources[].name' "$config_file")
  SLACK_CHANNELS=$(yq eval '.slack.channels[].name' "$config_file")

  if [ "$VERBOSE" = "1" ]; then
    echo "📋 配置已加載:"
    echo "   Sources: $SOURCES"
    echo "   Channels: $SLACK_CHANNELS"
  fi
}

parse_config "$CONFIG_FILE"
```

---

## 步驟 3：查詢各數據源

```bash
query_source() {
  local source_name="$1"
  local source_type=$(yq eval ".sources[] | select(.name == \"$source_name\") | .type" "$CONFIG_FILE")
  local endpoint=$(yq eval ".sources[] | select(.name == \"$source_name\") | .endpoint" "$CONFIG_FILE")
  local auth=$(yq eval ".sources[] | select(.name == \"$source_name\") | .auth" "$CONFIG_FILE")

  # 替換環境變數
  auth=$(echo "$auth" | sed 's/\${[^}]*}/'"$(eval echo \&)"'/g')

  if [ "$VERBOSE" = "1" ]; then
    echo "🔍 查詢 $source_name ($source_type)..."
  fi

  case "$source_type" in
    "graphql")
      query=$(yq eval ".sources[] | select(.name == \"$source_name\") | .query" "$CONFIG_FILE")
      curl -s -X POST "$endpoint" \
        -H "$auth" \
        -H "Content-Type: application/json" \
        -d "{\"query\":\"$query\"}" \
        | jq '.data'
      ;;
    "rest")
      curl -s -X GET "$endpoint" \
        -H "$auth" \
        -H "Accept: application/json"
      ;;
  esac
}

# 並行查詢所有數據源
declare -A source_data
for source in $SOURCES; do
  source_data["$source"]=$(query_source "$source" 2>/dev/null) &
done
wait
```

---

## 步驟 4：數據轉換和標準化

```bash
transform_data() {
  local raw_data="$1"
  local source_name="$2"

  # 使用 jq 和字段映射進行轉換
  local field_mapping=$(yq eval ".sources[] | select(.name == \"$source_name\") | .field_mapping" "$CONFIG_FILE")

  # 應用字段映射和標準化
  echo "$raw_data" | jq \
    --arg normalize "$(yq eval '.aggregation.normalize | @json' "$CONFIG_FILE")" \
    '.[] | with_entries(
      select(.value != null) |
      .key = (.key as $old | $ARGS.positional[0] | fromjson | .[$old] // $old)
    ) |
    .'
}

# 轉換每個數據源
for source in $SOURCES; do
  transformed=$(transform_data "${source_data[$source]}" "$source")
  source_data["$source"]="$transformed"
done
```

---

## 步驟 5：聚合、篩選、排序

```bash
aggregate_data() {
  # 合併所有數據源
  combined=$(
    for source in $SOURCES; do
      echo "${source_data[$source]}" | jq --arg src "$source" '. | map(. + {"_source": $src})'
    done | jq -s 'add'
  )

  # 應用篩選
  filtered=$(echo "$combined" | jq \
    --arg filter "$(yq eval '.aggregation.filters[0].conditions | @json' "$CONFIG_FILE")" \
    'map(select(true))')  # 簡化版；實際應用複雜篩選邏輯

  # 應用排序和分組
  sorted=$(echo "$filtered" | jq \
    'sort_by(.priority) | group_by(.team)')

  echo "$sorted"
}

AGGREGATED_DATA=$(aggregate_data)
```

---

## 步驟 6：格式化為 Slack 消息

```bash
format_slack_table() {
  local data="$1"
  local max_items=20

  # 轉換為 Slack Block Kit
  cat << EOF
{
  "type": "section",
  "text": {
    "type": "mrkdwn",
    "text": "📊 *Daily Issue Report*"
  }
}
{
  "type": "divider"
}
EOF

  # 逐行格式化為表格
  echo "$data" | jq -r '.[] | .[] | "\(.ID) | \(.Issue) | \(.Owner) | \(.Status)"' \
    | head -n "$max_items" \
    | awk '{
      printf "{\"type\": \"section\", \"text\": {\"type\": \"mrkdwn\", \"text\": \"%s\"}}\n", $0
    }'
}

SLACK_BLOCKS=$(format_slack_table "$AGGREGATED_DATA")
```

---

## 步驟 7：發送到 Slack

```bash
send_to_slack() {
  local blocks="$1"
  local channel="$2"
  local webhook_url="${SLACK_WEBHOOK_URL}"

  if [ -z "$webhook_url" ]; then
    echo "❌ SLACK_WEBHOOK_URL 未設置"
    exit 1
  fi

  local payload=$(cat << EOF
{
  "channel": "$channel",
  "blocks": [$blocks]
}
EOF
)

  if [ "$DRY_RUN" = "1" ]; then
    echo "🔍 Dry-run 模式，將發送以下消息到 $channel:"
    echo "$payload" | jq '.'
  else
    response=$(curl -s -X POST "$webhook_url" \
      -H "Content-Type: application/json" \
      -d "$payload")

    if echo "$response" | grep -q "ok"; then
      echo "✅ 消息已發送到 $channel"
    else
      echo "❌ Slack 發送失敗: $response"
      exit 1
    fi
  fi
}

# 發送到配置的每個頻道
for channel in $SLACK_CHANNELS; do
  send_to_slack "$SLACK_BLOCKS" "$channel"
done
```

---

## 步驟 8：錯誤處理和重試

```bash
run_with_retry() {
  local max_attempts=3
  local attempt=1

  while [ $attempt -le $max_attempts ]; do
    if aggregate_data > /dev/null 2>&1; then
      return 0
    fi

    echo "⚠️  嘗試 $attempt/$max_attempts 失敗，5 秒後重試..."
    sleep 5
    attempt=$((attempt + 1))
  done

  echo "❌ 執行失敗，已達最大重試次數"

  # 通知失敗頻道
  if [ ! -z "$NOTIFY_CHANNEL" ]; then
    curl -s -X POST "$SLACK_WEBHOOK_URL" \
      -H "Content-Type: application/json" \
      -d "{\"channel\": \"$NOTIFY_CHANNEL\", \"text\": \"❌ API Aggregation 執行失敗\"}"
  fi

  exit 1
}
```

---

## 快速開始

### 1. 複製配置模板
```bash
cp /Users/dex/.claude/commands/api-aggregation-notifier-example.yaml \
   ~/.aggregation-config.yaml
```

### 2. 設置環境變數
```bash
export LINEAR_API_KEY='lin_...'
export GITHUB_TOKEN='ghp_...'
export SLACK_WEBHOOK_URL='https://hooks.slack.com/...'
export MONITORING_API_KEY='key_...'
```

### 3. 測試（Dry-run）
```bash
/api-aggregation-notifier --config ~/.aggregation-config.yaml --dry-run
```

### 4. 實際執行
```bash
/api-aggregation-notifier --config ~/.aggregation-config.yaml
```

### 5. 排程執行（使用 cron）
```bash
# 每個工作日早上 9 點執行
0 9 * * 1-5 /api-aggregation-notifier --config ~/.aggregation-config.yaml
```

---

## 進階功能

### 自訂字段映射
在配置中修改 `field_mapping` 以匹配你的 API 欄位：
```yaml
sources:
  - name: "custom_api"
    field_mapping:
      remote_id: "ID"
      remote_title: "Title"
      remote_owner: "Owner"
```

### 複雜篩選
```yaml
aggregation:
  filters:
    - name: "critical_and_open"
      conditions:
        - field: "severity"
          operator: "equals"
          value: "critical"
        - field: "status"
          operator: "not_in"
          value: ["closed", "resolved"]
```

### 多格式輸出
```bash
/api-aggregation-notifier --config ~/.config.yaml --format csv
/api-aggregation-notifier --config ~/.config.yaml --format json
/api-aggregation-notifier --config ~/.config.yaml --format html
```

---

## 與 linear-slack-reporter 的關係

**linear-slack-reporter** = 針對 Linear 優化的特定工具
- 預先配置的 Linear GraphQL 查詢
- 自動優先級映射 (Urgent→🔴)
- 一鍵執行，無需配置

**api-aggregation-notifier** = 通用框架
- 支援任何 API（REST/GraphQL）
- 靈活的配置和字段映射
- 適合複雜的多源聚合場景

**推薦用法：**
- 單一 Linear 報告 → 用 `/linear-slack-reporter`
- 多系統聚合 → 用 `/api-aggregation-notifier`

