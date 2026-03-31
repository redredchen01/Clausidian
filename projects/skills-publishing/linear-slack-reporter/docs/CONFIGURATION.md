# Linear Slack Reporter - Configuration Guide

詳細的配置和設置指南。

## 環境變數配置

### 必需變數

#### `LINEAR_API_KEY`
Linear API 密鑰，用於認證。

**獲取方式：**
1. 進入 Linear Settings → API
2. 點擊「Create API key」
3. 複製 API Key

**設置方式：**

```bash
# 方式 1：直接設置
export LINEAR_API_KEY="lin_your_api_key_here"

# 方式 2：.env 文件
echo "LINEAR_API_KEY=lin_..." >> ~/.zshrc
source ~/.zshrc

# 方式 3：配置文件（推薦）
mkdir -p ~/.linear-config
echo "export LINEAR_API_KEY='lin_...'" > ~/.linear-config/credentials
chmod 600 ~/.linear-config/credentials
source ~/.linear-config/credentials
```

#### `SLACK_BOT_TOKEN`
Slack Bot 令牌，用於發送消息。

**獲取方式：**
1. 進入 Slack App Management
2. 進入 OAuth & Permissions
3. 複製「Bot User OAuth Token」
4. 確保有 `chat:write` 和 `channels:read` 權限

**設置方式：**

```bash
export SLACK_BOT_TOKEN="xoxb_your_token_here"
```

### 可選變數

#### `SLACK_WEBHOOK_URL`
Slack Webhook URL（備用發送方式）。

```bash
export SLACK_WEBHOOK_URL="https://hooks.slack.com/services/YOUR/WEBHOOK/URL"
```

#### `LOG_FILE`
日誌文件位置，默認 `~/.linear-slack-reporter.log`

```bash
export LOG_FILE="$HOME/.linear-slack-reporter.log"
```

---

## 配置文件格式

### 基本配置文件結構

建立 `~/.linear-reporter.conf`：

```bash
#!/bin/bash
# Linear Slack Reporter 配置文件

# ========== 認證 ==========
LINEAR_API_KEY="lin_..."
SLACK_BOT_TOKEN="xoxb_..."
SLACK_WEBHOOK_URL="https://hooks.slack.com/..."

# ========== 默認參數 ==========
DEFAULT_CHANNEL="#bugs"
DEFAULT_FILTER="Backlog,Todo"
DEFAULT_PRIORITY=""

# ========== 日誌 ==========
LOG_FILE="$HOME/.linear-slack-reporter.log"
LOG_LEVEL="info"

# ========== API 配置 ==========
LINEAR_API_TIMEOUT="30"
SLACK_API_TIMEOUT="10"

# ========== 性能 ==========
MAX_ITEMS="100"
BATCH_SIZE="50"

# ========== 調試 ==========
DEBUG=false
VERBOSE=false
```

### 使用配置文件

```bash
# 在 ~/.bashrc 或 ~/.zshrc 中
source ~/.linear-reporter.conf

# 現在可以使用配置值
/linear-slack-reporter --channel "$DEFAULT_CHANNEL"
```

---

## 進階配置

### GraphQL 查詢自訂

如果需要修改查詢的字段，可以編輯技能文件中的 GraphQL 查詢部分：

```bash
# 編輯技能文件
nano ~/.claude/commands/linear-slack-reporter.md

# 找到「步驟 3：查詢 Linear GraphQL API」部分
# 修改 query 變數
```

### 字段映射

支持的字段：
- `identifier` - Issue ID（如 FE-1234）
- `title` - 標題
- `priority` - 優先級
- `status` - 狀態
- `assignee` - 指派人
- `team` - 團隊
- `createdAt` - 建立時間
- `updatedAt` - 更新時間
- `url` - Linear 中的 URL

---

## Slack 頻道設置

### 建立專用頻道

```bash
# 在 Slack 中建立頻道
# #daily-bugs
# #urgent-alerts
# #team-standup
# 等等
```

### 添加 Bot 到頻道

```bash
# 方式 1：手動添加（推薦）
# 進入頻道 → Details → Members → Add member → 選擇 Bot

# 方式 2：使用公開頻道（Bot 自動可訪問）
# 建立公開頻道而非私有頻道
```

### 設置通知規則

在 Slack 頻道中設置通知規則，以便團隊成員能及時收到警報。

---

## 定時任務配置

### Cron 表達式

支持標準的 cron 表達式：

```
┌───────────── minute (0 - 59)
│ ┌───────────── hour (0 - 23)
│ │ ┌───────────── day of month (1 - 31)
│ │ │ ┌───────────── month (1 - 12)
│ │ │ │ ┌───────────── day of week (0 - 6) (Sunday to Saturday)
│ │ │ │ │
│ │ │ │ │
* * * * *
```

### Cron 示例

```bash
# 每天早上 9:00 AM
0 9 * * * /linear-slack-reporter ...

# 工作日早上 9:00 AM（週一至週五）
0 9 * * 1-5 /linear-slack-reporter ...

# 每小時
0 * * * * /linear-slack-reporter ...

# 每 30 分鐘
*/30 * * * * /linear-slack-reporter ...

# 每周一早上 9:00 AM
0 9 * * 1 /linear-slack-reporter ...

# 每個月第一天
0 0 1 * * /linear-slack-reporter ...
```

### 設置 Cron

```bash
# 編輯 crontab
crontab -e

# 添加任務
0 9 * * 1-5 source ~/.linear-reporter.conf && /linear-slack-reporter --channel "#daily-standup"

# 查看已設置的任務
crontab -l

# 查看日誌
tail -f /var/log/syslog | grep CRON  # Linux
log stream --predicate 'process == "cron"'  # macOS
```

---

## 系統集成

### macOS LaunchAgent

建立 `~/Library/LaunchAgents/com.linear.slack.reporter.plist`：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.linear.slack.reporter</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>-c</string>
    <string>source ~/.linear-reporter.conf && /linear-slack-reporter --channel "#daily-standup"</string>
  </array>
  <key>StartCalendarInterval</key>
  <array>
    <dict>
      <key>Hour</key>
      <integer>9</integer>
      <key>Minute</key>
      <integer>0</integer>
      <key>Weekday</key>
      <integer>1</integer>  <!-- Monday -->
    </dict>
  </array>
  <key>StandardOutPath</key>
  <string>/tmp/linear-reporter.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/linear-reporter-error.log</string>
</dict>
</plist>
```

啟動：

```bash
# 加載
launchctl load ~/Library/LaunchAgents/com.linear.slack.reporter.plist

# 卸載
launchctl unload ~/Library/LaunchAgents/com.linear.slack.reporter.plist

# 查看狀態
launchctl list | grep linear
```

### Linux Systemd

建立 `/etc/systemd/system/linear-reporter.service`：

```ini
[Unit]
Description=Linear Slack Reporter
After=network-online.target

[Service]
Type=oneshot
User=reporter
Environment="HOME=/home/reporter"
ExecStart=/linear-slack-reporter --channel "#daily-standup"

[Install]
WantedBy=multi-user.target
```

啟動：

```bash
sudo systemctl enable linear-reporter.service
sudo systemctl start linear-reporter.service
sudo systemctl status linear-reporter.service
```

---

## 性能優化

### 查詢優化

- 使用適當的 `--filter` 減少返回的數據量
- 定期查看日誌以識別慢查詢

### 並發控制

Linux Slack Reporter 默認以單個進程執行。如果需要並行執行多個查詢，可以在 cron 中設置多個任務。

### 緩存

當前版本不支持查詢緩存。未來版本可能會添加此功能。

---

## 安全最佳實踐

### 密鑰管理

```bash
# ✅ 好：環境變數
export LINEAR_API_KEY="..."

# ✅ 好：配置文件，設置正確權限
chmod 600 ~/.linear-credentials

# ❌ 不好：硬編碼在代碼中
/linear-slack-reporter --api-key "lin_..."

# ❌ 不好：提交到 Git
git add ~/.linear-credentials  # 不要做這個！
```

### 訪問控制

- 限制 Linear 和 Slack API Key 的權限
- 定期輪換 API Key
- 使用專用服務賬戶而不是個人賬戶

### 審計日誌

檢查日誌文件以追蹤執行情況：

```bash
tail -50 ~/.linear-slack-reporter.log

# 過濾特定日期
grep "2026-03-31" ~/.linear-slack-reporter.log
```

---

## 故障排除

### 常見問題

**Q: 命令找不到**
```bash
A: 確保 skill 文件在正確位置：~/.claude/commands/linear-slack-reporter.md
   或使用完整路徑執行
```

**Q: API Key 無效**
```bash
A: 驗證 API Key：
   curl -X POST https://api.linear.app/graphql \
     -H "Authorization: Bearer $LINEAR_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"query":"{ viewer { id } }"}'
```

**Q: Slack 發送失敗**
```bash
A: 檢查 token 和 webhook URL
   確保 Bot 已被添加到頻道
```

---

## 進階主題

### 自訂報告格式

編輯技能文件中的「步驟 5：轉換為 Slack Markdown 表格」部分，修改消息格式。

### 集成其他工具

可以將輸出管道傳遞給其他工具：

```bash
/linear-slack-reporter --dry-run | tee report.json
```

---

更多幫助，請參考 [README.md](../README.md) 或提交 Issue。
