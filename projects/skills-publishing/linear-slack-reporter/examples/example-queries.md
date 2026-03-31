# Linear Slack Reporter - 使用示例

## 基本示例

### 1. 查詢所有未完成的 bug

```bash
/linear-slack-reporter \
  --filter "Backlog,Todo,In Progress" \
  --channel "#daily-bugs"
```

**輸出：** Slack 消息顯示所有未完成的 bug，按優先級排序。

---

## 進階示例

### 2. 只查詢高優先級的 bug

```bash
/linear-slack-reporter \
  --priority Urgent \
  --filter "Backlog,Todo" \
  --channel "#urgent-alerts"
```

**適用場景：** 緊急 bug 的即時告警

---

### 3. 團隊特定的 bug 報告

```bash
/linear-slack-reporter \
  --team Backend \
  --filter "Backlog,Todo,In Progress" \
  --channel "#backend-team"

/linear-slack-reporter \
  --team Frontend \
  --filter "Backlog,Todo,In Progress" \
  --channel "#frontend-team"
```

**適用場景：** 按團隊分發 bug 列表

---

### 4. 個人任務隊列

```bash
/linear-slack-reporter \
  --assign-to alice@company.com \
  --channel "#alice-queue" \
  --priority "Urgent,High"

/linear-slack-reporter \
  --assign-to bob@company.com \
  --channel "#bob-queue" \
  --priority "Urgent,High"
```

**適用場景：** 自動化個人任務通知

---

### 5. In Progress bug 跟蹤

```bash
/linear-slack-reporter \
  --filter "In Progress" \
  --channel "#work-in-progress"
```

**適用場景：** 監督當前進行中的工作

---

## 預覽和測試

### 6. Dry-run 模式（預覽）

```bash
/linear-slack-reporter \
  --priority Urgent \
  --dry-run
```

**輸出：** 在終端顯示 Slack 消息內容，不實際發送

---

### 7. 詳細日誌模式

```bash
/linear-slack-reporter \
  --filter "Backlog,Todo" \
  --verbose
```

**輸出：** 顯示詳細的執行日誌

---

## 定時任務示例

### 8. 每日早晨 standup 報告

```bash
# 將以下添加到 crontab
0 9 * * 1-5 /linear-slack-reporter \
  --filter "Backlog,Todo,In Progress" \
  --channel "#daily-standup" \
  >> ~/.linear-reporter.log 2>&1
```

**執行：** 每個工作日早上 9:00 AM

---

### 9. 下班前緊急 bug 檢查

```bash
# 添加到 crontab
0 17 * * 1-5 /linear-slack-reporter \
  --priority "Urgent,High" \
  --filter "Backlog,Todo" \
  --channel "#end-of-day-check" \
  >> ~/.linear-reporter.log 2>&1
```

**執行：** 每個工作日 5:00 PM

---

### 10. 實時監控（每小時）

```bash
# 監控高優先級的 In Progress bug
0 * * * * /linear-slack-reporter \
  --priority High \
  --filter "In Progress" \
  --channel "#realtime-alerts" \
  >> ~/.linear-reporter.log 2>&1
```

**執行：** 每小時頂部（xx:00）

---

## CI/CD 集成示例

### 11. GitHub Actions

```yaml
name: Linear Bug Report
on:
  schedule:
    - cron: '0 9 * * 1-5'

jobs:
  report:
    runs-on: ubuntu-latest
    steps:
      - name: Run Linear Reporter
        env:
          LINEAR_API_KEY: ${{ secrets.LINEAR_API_KEY }}
          SLACK_BOT_TOKEN: ${{ secrets.SLACK_BOT_TOKEN }}
        run: |
          /linear-slack-reporter \
            --channel "#github-actions-reports" \
            --filter "Backlog,Todo"
```

---

### 12. GitLab CI

```yaml
linear_report:
  script:
    - export LINEAR_API_KEY="$LINEAR_API_KEY"
    - export SLACK_BOT_TOKEN="$SLACK_BOT_TOKEN"
    - /linear-slack-reporter \
        --channel "#gitlab-reports" \
        --priority Urgent
  only:
    - schedules
```

---

## 組合示例

### 13. 複合查詢：特定團隊的高優先級 bug

```bash
/linear-slack-reporter \
  --team "Backend" \
  --priority "Urgent,High" \
  --filter "Backlog,Todo" \
  --channel "#backend-urgent"
```

**結果：** 只顯示 Backend 團隊的未完成的高優先級 bug

---

### 14. 多頻道分發

```bash
# 發送所有 bug 到主頻道
/linear-slack-reporter \
  --channel "#all-bugs" \
  --filter "Backlog,Todo,In Progress"

# 同時發送高優先級 bug 到告警頻道
/linear-slack-reporter \
  --priority "Urgent,High" \
  --channel "#critical-bugs"

# 發送 In Progress 的 bug 到工作頻道
/linear-slack-reporter \
  --filter "In Progress" \
  --channel "#active-work"
```

---

## 配置文件示例

### 15. 使用配置文件簡化命令

建立 `~/.linear-reporter.conf`：

```bash
# 默認值
DEFAULT_CHANNEL="#daily-bugs"
DEFAULT_FILTER="Backlog,Todo"
DEFAULT_PRIORITY=""

# 認證
source ~/.linear-credentials

# 日誌
LOG_FILE="$HOME/.linear-reporter.log"
```

使用：

```bash
source ~/.linear-reporter.conf

# 現在命令更簡潔
/linear-slack-reporter --channel "$DEFAULT_CHANNEL"

# 也可以覆蓋
/linear-slack-reporter --channel "#urgent" --priority Urgent
```

---

## 實時監控示例

### 16. 建立一個監控腳本

```bash
#!/bin/bash
# monitor-linear.sh - 實時監控 Linear bug

CHANNELS=(
  "#frontend-urgent"
  "#backend-urgent"
  "#ops-urgent"
)

TEAMS=(
  "Frontend"
  "Backend"
  "Operations"
)

for i in "${!TEAMS[@]}"; do
  /linear-slack-reporter \
    --team "${TEAMS[$i]}" \
    --priority Urgent \
    --filter "Backlog,Todo" \
    --channel "${CHANNELS[$i]}" \
    --verbose
done

echo "✅ 監控完成"
```

執行：

```bash
chmod +x monitor-linear.sh
./monitor-linear.sh  # 手動執行
# 或添加到 cron 定期執行
*/30 * * * * /path/to/monitor-linear.sh >> /var/log/linear-monitor.log 2>&1
```

---

## 故障排除示例

### 17. 測試連接

```bash
# 測試 API 連接
curl -X POST https://api.linear.app/graphql \
  -H "Authorization: Bearer $LINEAR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query":"{ viewer { id name } }"}'
```

### 18. 測試 Slack webhook

```bash
curl -X POST "$SLACK_WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d '{"text": "Test message"}'
```

---

## 性能測試

### 19. 查詢 100+ bug 的性能

```bash
# 測試大量 bug 的查詢性能
time /linear-slack-reporter \
  --filter "Backlog,Todo,In Progress,In Review" \
  --dry-run

# 輸出可能類似：
# real    0m2.345s
# user    0m1.234s
# sys     0m0.345s
```

---

## 實際工作流程示例

### 20. 完整的日常 bug 管理工作流

早上 9:00 - 查看所有待辦 bug：
```bash
/linear-slack-reporter --filter "Backlog,Todo" --channel "#morning-standup"
```

中午 12:00 - 檢查高優先級進度：
```bash
/linear-slack-reporter --priority "Urgent,High" --filter "In Progress" --channel "#midday-check"
```

下午 5:00 - 緊急 bug 檢查：
```bash
/linear-slack-reporter --priority "Urgent" --channel "#eod-urgent"
```

自動 cron 配置：

```bash
0 9 * * 1-5 /linear-slack-reporter --filter "Backlog,Todo" --channel "#morning-standup"
0 12 * * 1-5 /linear-slack-reporter --priority "Urgent,High" --filter "In Progress" --channel "#midday-check"
0 17 * * 1-5 /linear-slack-reporter --priority "Urgent" --channel "#eod-urgent"
```

---

## 提示和技巧

1. **使用 `--verbose` 進行調試**
   ```bash
   /linear-slack-reporter --verbose 2>&1 | tee debug.log
   ```

2. **保存日誌用於審計**
   ```bash
   /linear-slack-reporter >> ~/.linear-reporter.log 2>&1
   ```

3. **組合多個條件進行精確查詢**
   ```bash
   /linear-slack-reporter \
     --team "Backend" \
     --priority "Urgent" \
     --filter "Backlog,Todo" \
     --assign-to "alice@company.com"
   ```

4. **使用 alias 簡化命令**
   ```bash
   # 添加到 .bashrc 或 .zshrc
   alias linear-urgent='linear-slack-reporter --priority Urgent --dry-run'
   alias linear-team-backend='linear-slack-reporter --team Backend'
   ```

---

更多示例和用法，請參考主文檔。
