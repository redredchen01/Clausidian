---
description: "PR diff 自動審查：安全（硬編碼密鑰、SQL 注入）、性能（N+1 查詢）、風格、邏輯缺陷。4 類別 17 項檢查"
allowed-tools: Bash, Read, Grep
argument-hint: "[--pr <path|url>] [--file <path>] [--category <security|performance|style|logic|all>] [--format <json|markdown|sarif>] [--strict] [--dry-run]"
---

# /code-review-assistant — Intelligent PR Code Review

自動化代碼審查工具，識別安全漏洞、性能瓶頸、編碼風格問題和邏輯缺陷。支援本地文件、Git Diff 和遠程 PR。

## Trigger
- "審查 PR 代碼"
- "檢查代碼安全問題"
- "自動化代碼質量檢查"
- "性能瓶頸分析"
- "代碼風格檢查"

## Input

```
$ARGUMENTS — 可選參數
  --pr <path|url>        PR Diff 路徑或 GitHub URL
  --file <path>          單個文件路徑
  --category <cat>       檢查類別 (security|performance|style|logic|all)
                         預設: all
  --format <format>      輸出格式 (json|markdown|sarif)
                         預設: markdown
  --strict               啟用嚴格模式（所有警告當作錯誤）
  --ignore <patterns>    忽略匹配的模式（正則表達式，逗號分隔）
  --language <lang>      指定代碼語言 (python|javascript|go|rust|java)
  --dry-run              不儲存結果，僅預覽
  --verbose              詳細日誌輸出
```

---

## 步驟 1：驗證和解析輸入

```bash
validate_input() {
  local pr_path="$1"
  local errors=0

  if [ -z "$pr_path" ]; then
    echo "❌ 缺少必需參數：--pr <path> 或 --file <path>"
    exit 1
  fi

  # 如果是 URL，下載 PR diff
  if [[ "$pr_path" =~ ^https?:// ]]; then
    echo "⏳ 正在下載 PR diff..."
    pr_path=$(mktemp)
    if curl -s "$1" > "$pr_path"; then
      echo "✅ PR diff 下載成功"
    else
      echo "❌ 無法下載 PR diff"
      exit 1
    fi
  fi

  # 檢查文件存在
  if [ ! -f "$pr_path" ]; then
    echo "❌ 文件不存在: $pr_path"
    exit 1
  fi

  echo "$pr_path"
}

PR_FILE=$(validate_input "$PR_PATH")
```

---

## 步驟 2：解析參數和配置

```bash
parse_args() {
  PR_PATH=""
  FILE_PATH=""
  CATEGORY="all"
  FORMAT="markdown"
  STRICT_MODE=0
  IGNORE_PATTERNS=""
  LANGUAGE=""
  DRY_RUN=0
  VERBOSE=0

  while [ $# -gt 0 ]; do
    case "$1" in
      --pr)
        PR_PATH="$2"
        shift 2
        ;;
      --file)
        FILE_PATH="$2"
        shift 2
        ;;
      --category)
        CATEGORY="$2"
        shift 2
        ;;
      --format)
        FORMAT="$2"
        shift 2
        ;;
      --strict)
        STRICT_MODE=1
        shift
        ;;
      --ignore)
        IGNORE_PATTERNS="$2"
        shift 2
        ;;
      --language)
        LANGUAGE="$2"
        shift 2
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

  if [ "$VERBOSE" = "1" ]; then
    echo "📋 配置已載入："
    echo "   Category: $CATEGORY"
    echo "   Format: $FORMAT"
    echo "   Strict: $STRICT_MODE"
  fi
}

parse_args "$@"
```

---

## 步驟 3：提取代碼差異

```bash
extract_diff() {
  local file="$1"

  # 如果是 Git diff 格式
  if grep -q "^diff --git" "$file"; then
    grep "^[+-]" "$file" | grep -v "^[+-][+-][+-]" > /tmp/code_changes.txt
  else
    cat "$file" > /tmp/code_changes.txt
  fi

  if [ "$VERBOSE" = "1" ]; then
    echo "📄 提取的代碼更改行數：$(wc -l < /tmp/code_changes.txt)"
  fi
}

extract_diff "$PR_FILE"
CODE_CHANGES=$(cat /tmp/code_changes.txt)
```

---

## 步驟 4：安全檢查

```bash
check_security() {
  local code="$1"
  local issues=()

  # 檢查 1: 硬編碼密鑰
  if echo "$code" | grep -E '(password|secret|key|token|api_key|aws_secret|private_key).*=.*["\']' > /dev/null; then
    issues+=("🔴 SECURITY: 硬編碼的密鑰或密碼檢測到
    問題：在代碼中發現明文密鑰或密碼
    建議：使用環境變數或密鑰管理服務（AWS Secrets Manager, HashiCorp Vault）")
  fi

  # 檢查 2: SQL 注入風險
  if echo "$code" | grep -E "query|execute|sql.*\+.*var|f\".*SELECT.*WHERE" > /dev/null; then
    issues+=("🔴 SECURITY: SQL 注入風險
    問題：檢測到字符串拼接的 SQL 查詢
    建議：使用參數化查詢或 ORM，避免字符串拼接")
  fi

  # 檢查 3: 命令注入風險
  if echo "$code" | grep -E "os\.|shell=True|exec\(|subprocess\(" > /dev/null; then
    issues+=("🟠 SECURITY: 命令注入風險
    問題：使用了 shell 執行或不安全的 subprocess 調用
    建議：使用 shell=False 或 subprocess.run 的列表形式")
  fi

  # 檢查 4: 不安全的反序列化
  if echo "$code" | grep -E "pickle|yaml\.load|json\.loads.*input" > /dev/null; then
    issues+=("🟠 SECURITY: 不安全的反序列化
    問題：使用了不安全的序列化庫（如 pickle）
    建議：使用 json 或 yaml.safe_load")
  fi

  # 檢查 5: 跨站腳本（XSS）
  if echo "$code" | grep -E "innerHTML|dangerouslySetInnerHTML|\.html\(" > /dev/null; then
    issues+=("🟠 SECURITY: XSS 風險
    問題：直接設置 HTML，未進行轉義
    建議：使用文本節點或 React/Vue 的自動轉義機制")
  fi

  # 輸出
  for issue in "${issues[@]}"; do
    echo "$issue"
  done
}

SECURITY_ISSUES=$(check_security "$CODE_CHANGES")
```

---

## 步驟 5：性能檢查

```bash
check_performance() {
  local code="$1"
  local issues=()

  # 檢查 1: N+1 查詢模式
  if echo "$code" | grep -E "for.*in.*query|\.select\(\).*for\|for.*\.get\(" > /dev/null; then
    issues+=("🟡 PERFORMANCE: N+1 查詢模式檢測到
    問題：在循環中執行數據庫查詢
    示例：for item in items: db.query(SELECT ... WHERE id=item.id)
    建議：使用 JOIN 或 批量查詢 (SELECT ... WHERE id IN (...))")
  fi

  # 檢查 2: 邊界檢查削弱
  if echo "$code" | grep -E "\[[-0-9]+:\]|unlimited|MAX_INT|no.*limit" > /dev/null; then
    issues+=("🟡 PERFORMANCE: 缺失邊界檢查
    問題：可能返回過多結果導致內存溢出
    建議：添加 LIMIT 或 分頁")
  fi

  # 檢查 3: 阻塞操作
  if echo "$code" | grep -E "sleep\(|time\.sleep|Thread\.sleep" > /dev/null; then
    issues+=("🟡 PERFORMANCE: 同步阻塞操作
    問題：代碼中有 sleep() 調用，會阻塞線程
    建議：使用非同步操作（async/await）或 setTimeout")
  fi

  # 檢查 4: 正則表達式複雜度
  if echo "$code" | grep -E '\\.\*|\\.\+|\(\?=' | wc -l | grep -qE "[5-9]|[0-9]{2,}"; then
    issues+=("🟡 PERFORMANCE: 複雜正則表達式
    問題：正則表達式過於複雜，可能導致性能問題
    建議：簡化正則或使用字符串操作")
  fi

  # 檢查 5: 內存洩漏模式
  if echo "$code" | grep -E "setInterval|addEventListener.*不移除|circular.*reference" > /dev/null; then
    issues+=("🟠 PERFORMANCE: 潛在內存洩漏
    問題：事件監聽器或定時器未清理
    建議：在合適的地方移除監聽器或清除定時器")
  fi

  # 輸出
  for issue in "${issues[@]}"; do
    echo "$issue"
  done
}

PERFORMANCE_ISSUES=$(check_performance "$CODE_CHANGES")
```

---

## 步驟 6：風格檢查

```bash
check_style() {
  local code="$1"
  local issues=()

  # 檢查 1: 命名慣例
  if echo "$code" | grep -E "^[[:space:]]*[a-z_]+[a-z0-9]*\s*=|def [a-z_]+[a-z0-9]*\(" > /dev/null; then
    # 計算 snake_case 與 camelCase 比例，給予建議
    echo "✏️  STYLE: 命名慣例 (建議檢查)"
  fi

  # 檢查 2: 行長超限
  if echo "$code" | awk 'length > 100' | wc -l | grep -qE "[1-9]"; then
    issues+=("✏️  STYLE: 行長超過 100 字符
    建議：將長行拆分")
  fi

  # 檢查 3: 代碼重複
  if echo "$code" | sort | uniq -d | wc -l | grep -qE "[1-9]"; then
    issues+=("✏️  STYLE: 檢測到代碼重複
    建議：提取公共函數或常量")
  fi

  # 輸出
  for issue in "${issues[@]}"; do
    echo "$issue"
  done
}

STYLE_ISSUES=$(check_style "$CODE_CHANGES")
```

---

## 步驟 7：邏輯檢查

```bash
check_logic() {
  local code="$1"
  local issues=()

  # 檢查 1: 缺失錯誤處理
  if echo "$code" | grep -E "^\+" | grep -E "\.request\(|\.query\(|\.fetch\(" | grep -v "try|except|catch|throw" > /dev/null; then
    issues+=("⚠️  LOGIC: 缺失錯誤處理
    問題：API 調用或數據庫操作未用 try-catch 包裹
    建議：添加異常處理")
  fi

  # 檢查 2: 邏輯死碼
  if echo "$code" | grep -E "if.*True:|if.*False:" > /dev/null; then
    issues+=("⚠️  LOGIC: 邏輯死碼
    問題：條件總是真或假
    建議：檢查邏輯是否有誤")
  fi

  # 檢查 3: 類型不匹配
  if echo "$code" | grep -E "==.*null|== None.*!=|undefined.*==" > /dev/null; then
    issues+=("⚠️  LOGIC: 類型比較可能不當
    問題：使用 == 比較 null/None/undefined
    建議：使用 === 或顯式類型檢查")
  fi

  # 檢查 4: 未初始化變數
  if echo "$code" | grep -E "^\+.*\w+\s*[\+\*/-].*\$\w+" | grep -v "let |const |var |=" > /dev/null; then
    issues+=("⚠️  LOGIC: 可能未初始化變數
    建議：檢查變數是否正確初始化")
  fi

  # 輸出
  for issue in "${issues[@]}"; do
    echo "$issue"
  done
}

LOGIC_ISSUES=$(check_logic "$CODE_CHANGES")
```

---

## 步驟 8：報告生成

### 8a. Markdown 格式

```bash
generate_markdown_report() {
  local security="$1"
  local performance="$2"
  local style="$3"
  local logic="$4"

  cat << EOF
# Code Review Report

**Generated:** $(date '+%Y-%m-%d %H:%M:%S')

## 📊 Summary

- Security Issues: $(echo "$security" | grep -c "SECURITY")
- Performance Issues: $(echo "$performance" | grep -c "PERFORMANCE")
- Style Issues: $(echo "$style" | grep -c "STYLE")
- Logic Issues: $(echo "$logic" | grep -c "LOGIC")

---

## 🔴 Security

$([ -z "$security" ] && echo "✅ 無安全問題檢測到" || echo "$security")

---

## 🟠 Performance

$([ -z "$performance" ] && echo "✅ 無性能問題檢測到" || echo "$performance")

---

## ✏️ Style

$([ -z "$style" ] && echo "✅ 符合編碼風格" || echo "$style")

---

## ⚠️ Logic

$([ -z "$logic" ] && echo "✅ 邏輯檢查通過" || echo "$logic")

---

## ✅ Recommendations

1. 修復所有標記為 🔴 的安全問題
2. 解決 🟠 的性能瓶頸
3. 遵循 ✏️ 的編碼風格建議
4. 驗證 ⚠️ 的邏輯正確性

EOF
}

MARKDOWN_REPORT=$(generate_markdown_report "$SECURITY_ISSUES" "$PERFORMANCE_ISSUES" "$STYLE_ISSUES" "$LOGIC_ISSUES")
```

### 8b. JSON 格式

```bash
generate_json_report() {
  local security="$1"
  local performance="$2"
  local style="$3"
  local logic="$4"
  local timestamp=$(date -Iseconds)

  cat << EOF
{
  "report": {
    "timestamp": "$timestamp",
    "summary": {
      "security": $(echo "$security" | grep -c "SECURITY" || echo "0"),
      "performance": $(echo "$performance" | grep -c "PERFORMANCE" || echo "0"),
      "style": $(echo "$style" | grep -c "STYLE" || echo "0"),
      "logic": $(echo "$logic" | grep -c "LOGIC" || echo "0")
    },
    "issues": {
      "security": $(echo "$security" | jq -R -s -c 'split("\n") | map(select(length > 0))' || echo "[]"),
      "performance": $(echo "$performance" | jq -R -s -c 'split("\n") | map(select(length > 0))' || echo "[]"),
      "style": $(echo "$style" | jq -R -s -c 'split("\n") | map(select(length > 0))' || echo "[]"),
      "logic": $(echo "$logic" | jq -R -s -c 'split("\n") | map(select(length > 0))' || echo "[]")
    }
  }
}
EOF
}

JSON_REPORT=$(generate_json_report "$SECURITY_ISSUES" "$PERFORMANCE_ISSUES" "$STYLE_ISSUES" "$LOGIC_ISSUES")
```

### 8c. SARIF 格式（IDE 集成）

```bash
generate_sarif_report() {
  local security="$1"

  cat << 'EOF'
{
  "version": "2.1.0",
  "runs": [
    {
      "tool": {
        "driver": {
          "name": "CodeReviewAssistant",
          "version": "1.0.0",
          "rules": [
            {
              "id": "SEC001",
              "shortDescription": { "text": "Hardcoded Secrets" },
              "level": "error"
            },
            {
              "id": "PERF001",
              "shortDescription": { "text": "N+1 Query Pattern" },
              "level": "warning"
            }
          ]
        }
      },
      "results": []
    }
  ]
}
EOF
}

SARIF_REPORT=$(generate_sarif_report "$SECURITY_ISSUES")
```

---

## 步驟 9：輸出結果

```bash
output_report() {
  local format="$1"
  local report="$2"
  local dry_run="$3"
  local output_file="/tmp/code-review-$(date '+%s').txt"

  case "$format" in
    markdown)
      echo "$MARKDOWN_REPORT" | tee "$output_file"
      ;;
    json)
      echo "$JSON_REPORT" | jq '.' | tee "$output_file"
      ;;
    sarif)
      echo "$SARIF_REPORT" | jq '.' | tee "$output_file"
      ;;
  esac

  if [ "$dry_run" != "1" ]; then
    echo "💾 報告已保存: $output_file"
  fi
}

output_report "$FORMAT" "$MARKDOWN_REPORT" "$DRY_RUN"
```

---

## 完整執行流程

```bash
set -e

echo "🔍 Code Review Assistant v1.0"
echo ""

# 驗證和解析
parse_args "$@"
PR_FILE=$(validate_input "$PR_PATH" "$FILE_PATH")

# 提取代碼差異
echo "📄 正在提取代碼更改..."
extract_diff "$PR_FILE"

# 執行檢查
echo "🔐 正在檢查安全問題..."
SECURITY_ISSUES=$(check_security "$CODE_CHANGES")

echo "⚡ 正在檢查性能問題..."
PERFORMANCE_ISSUES=$(check_performance "$CODE_CHANGES")

echo "✏️  正在檢查編碼風格..."
STYLE_ISSUES=$(check_style "$CODE_CHANGES")

echo "🧠 正在檢查邏輯問題..."
LOGIC_ISSUES=$(check_logic "$CODE_CHANGES")

# 生成報告
echo "📊 正在生成報告..."
case "$FORMAT" in
  json)
    REPORT=$(generate_json_report "$SECURITY_ISSUES" "$PERFORMANCE_ISSUES" "$STYLE_ISSUES" "$LOGIC_ISSUES")
    ;;
  sarif)
    REPORT=$(generate_sarif_report "$SECURITY_ISSUES")
    ;;
  *)
    REPORT=$(generate_markdown_report "$SECURITY_ISSUES" "$PERFORMANCE_ISSUES" "$STYLE_ISSUES" "$LOGIC_ISSUES")
    ;;
esac

# 輸出
output_report "$FORMAT" "$REPORT" "$DRY_RUN"

echo ""
echo "✅ 審查完成"
```

---

## 使用示例

### 1. 審查 Git Diff
```bash
git diff origin/main > /tmp/pr.diff
/code-review-assistant --pr /tmp/pr.diff
```

### 2. 只檢查安全問題
```bash
/code-review-assistant --pr /tmp/pr.diff --category security
```

### 3. 嚴格模式（所有警告當作錯誤）
```bash
/code-review-assistant --pr /tmp/pr.diff --strict
```

### 4. 輸出為 JSON（用於 CI 集成）
```bash
/code-review-assistant --pr /tmp/pr.diff --format json > review.json
```

### 5. 預覽模式（不儲存結果）
```bash
/code-review-assistant --pr /tmp/pr.diff --dry-run
```

### 6. GitHub PR 審查（用 curl 下載）
```bash
/code-review-assistant --pr "https://github.com/owner/repo/pull/123.patch"
```

### 7. 忽略特定模式
```bash
/code-review-assistant --pr /tmp/pr.diff --ignore "TODO|FIXME|test_.*"
```

---

## 配置和自訂

### 自訂檢查規則

建立 `~/.code-review-config.json`：

```json
{
  "rules": {
    "security": {
      "hardcoded_secrets": true,
      "sql_injection": true,
      "command_injection": true
    },
    "performance": {
      "n_plus_one": true,
      "unbounded_queries": true,
      "blocking_operations": true
    }
  },
  "ignore_paths": ["node_modules", "dist", ".git"],
  "strict_mode": false
}
```

---

## 與 CI/CD 集成

### GitHub Actions

```yaml
name: Code Review
on: [pull_request]

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Run Code Review
        run: |
          /code-review-assistant \
            --pr "${{ github.event.pull_request.diff_url }}" \
            --format json > review.json
      - name: Comment on PR
        uses: actions/github-script@v6
        with:
          script: |
            const fs = require('fs');
            const review = JSON.parse(fs.readFileSync('review.json', 'utf8'));
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              body: review.report.summary
            });
```

### GitLab CI

```yaml
code_review:
  script:
    - /code-review-assistant --pr "$CI_MERGE_REQUEST_DIFF_BASE_SHA" --format sarif > review.sarif
  artifacts:
    reports:
      sast: review.sarif
```

---

## 常見錯誤

| 錯誤 | 解決方案 |
|------|--------|
| 檢查不到任何問題 | 確認 diff 格式正確，使用 `--verbose` 檢查 |
| 誤報太多 | 使用 `--ignore` 排除特定模式 |
| 性能檢查太慢 | 使用 `--category` 限制檢查範圍 |
| GitHub URL 無法下載 | 確認 URL 以 `.patch` 結尾 |

---

## 限制和已知問題

- 不支援二進制文件
- 複雜的 AST 分析需要特定語言支援
- 一些邏輯問題需要上下文才能偵測

---

## 進階：自訂檢查規則

在 `~/.code-review-rules.sh` 中定義自訂檢查：

```bash
check_custom_patterns() {
  local code="$1"

  # 自訂檢查：禁止使用 console.log
  if echo "$code" | grep -E "console\.log\(" > /dev/null; then
    echo "⚠️  CUSTOM: 檢測到 console.log（應使用 logger）"
  fi
}
```

