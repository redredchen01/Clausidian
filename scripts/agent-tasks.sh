#!/bin/bash

# agent-tasks.sh — Task dependency graph for multi-agent coordination
# Usage: agent-tasks add <id> <description> [depends-on...]
#        agent-tasks done <id>
#        agent-tasks next
#        agent-tasks status
#        agent-tasks claim <id> [agent-id]

set -e

MEMORY_DIR="${YD_MEMORY:-/Users/dex/.claude/projects/-Users-dex-YD-2026/memory}"
TASKS_DIR="$MEMORY_DIR/tasks"
TASKS_FILE="$TASKS_DIR/tasks.json"

mkdir -p "$TASKS_DIR"

# Initialize tasks file if not exists
if [ ! -f "$TASKS_FILE" ]; then
  echo '{"tasks": {}}' > "$TASKS_FILE"
fi

# Add a task
cmd_add() {
  local id="$1"
  local description="$2"
  shift 2
  local depends_on=("$@")

  if [ -z "$id" ] || [ -z "$description" ]; then
    echo "❌ Usage: agent-tasks add <id> <description> [depends-on...]"
    exit 1
  fi

  # Build JSON for dependencies
  local deps_json="[]"
  if [ ${#depends_on[@]} -gt 0 ]; then
    deps_json="[$(printf '\"%s\",' "${depends_on[@]}" | sed 's/,$//')]"
  fi

  # Use jq to add task
  local tmp=$(mktemp)
  cat "$TASKS_FILE" | jq ".tasks[\"$id\"] = {\"description\": \"$description\", \"status\": \"pending\", \"depends_on\": $deps_json, \"assigned_to\": null, \"created_at\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" > "$tmp"
  mv "$tmp" "$TASKS_FILE"

  echo "✅ Added task: $id"
  if [ ${#depends_on[@]} -gt 0 ]; then
    echo "   Depends on: ${depends_on[@]}"
  fi
}

# Mark task as done
cmd_done() {
  local id="$1"

  if [ -z "$id" ]; then
    echo "❌ Usage: agent-tasks done <id>"
    exit 1
  fi

  local tmp=$(mktemp)
  cat "$TASKS_FILE" | jq ".tasks[\"$id\"].status = \"done\"" > "$tmp"
  mv "$tmp" "$TASKS_FILE"

  echo "✅ Marked complete: $id"
}

# Find next executable tasks (all dependencies met)
cmd_next() {
  echo "🚀 Next Executable Tasks:"
  echo ""

  if [ ! -f "$TASKS_FILE" ]; then
    echo "   (no tasks yet)"
    return
  fi

  # Use jq to find pending tasks with no unsolved dependencies
  jq -r '.tasks | to_entries[] | select(.value.status == "pending") | "\(.key):\(.value.depends_on | @json)"' "$TASKS_FILE" | while IFS=: read id deps_json; do
    # Check if all dependencies are done
    local all_done=true
    local deps=$(echo "$deps_json" | jq -r '.[]' 2>/dev/null || true)

    for dep in $deps; do
      local dep_status=$(jq -r ".tasks[\"$dep\"].status // \"missing\"" "$TASKS_FILE")
      if [ "$dep_status" != "done" ]; then
        all_done=false
        break
      fi
    done

    if [ "$all_done" = true ]; then
      local desc=$(jq -r ".tasks[\"$id\"].description" "$TASKS_FILE")
      local assigned=$(jq -r ".tasks[\"$id\"].assigned_to" "$TASKS_FILE")

      if [ "$assigned" = "null" ]; then
        echo "   □ $id: $desc"
      else
        echo "   ◆ $id: $desc [assigned to: $assigned]"
      fi
    fi
  done
  echo ""
}

# Show full status
cmd_status() {
  echo "📊 Task Graph Status:"
  echo ""

  if [ ! -f "$TASKS_FILE" ]; then
    echo "   (no tasks yet)"
    return
  fi

  local pending=$(jq '[.tasks[] | select(.status == "pending")] | length' "$TASKS_FILE")
  local done=$(jq '[.tasks[] | select(.status == "done")] | length' "$TASKS_FILE")

  echo "Total: $((pending + done)) tasks"
  echo "  ✓ Done: $done"
  echo "  ○ Pending: $pending"
  echo ""

  jq -r '.tasks | to_entries[] | "\(.key): \(.value.description) [\(.value.status)]"' "$TASKS_FILE"
}

# Claim a task (mark as assigned)
cmd_claim() {
  local id="$1"
  local agent="${2:-$(detect_agent_type)}"

  if [ -z "$id" ]; then
    echo "❌ Usage: agent-tasks claim <id> [agent-id]"
    exit 1
  fi

  local tmp=$(mktemp)
  cat "$TASKS_FILE" | jq ".tasks[\"$id\"].assigned_to = \"$agent\"" > "$tmp"
  mv "$tmp" "$TASKS_FILE"

  echo "✅ Claimed by: $agent"
}

# Detect agent type
detect_agent_type() {
  if [ -n "$CLAUDE_CODE_TOKEN" ]; then echo "claude-code"; return; fi
  if [ -n "$CURSOR_TOKEN" ]; then echo "cursor"; return; fi
  if [ -n "$WINDSURF_TOKEN" ]; then echo "windsurf"; return; fi
  if [ -n "$CLINE_TOKEN" ]; then echo "cline"; return; fi
  if [ -n "$AIDER_TOKEN" ]; then echo "aider"; return; fi
  echo "unknown"
}

# Main dispatch
case "${1:-}" in
  add)
    cmd_add "$2" "$3" "${@:4}"
    ;;
  done)
    cmd_done "$2"
    ;;
  next)
    cmd_next
    ;;
  status)
    cmd_status
    ;;
  claim)
    cmd_claim "$2" "$3"
    ;;
  *)
    echo "Usage:"
    echo "  agent-tasks add <id> <description> [depends...]  — add task"
    echo "  agent-tasks done <id>                            — mark complete"
    echo "  agent-tasks next                                 — show next executable tasks"
    echo "  agent-tasks status                               — show full task graph"
    echo "  agent-tasks claim <id> [agent-id]                — claim a task"
    exit 1
    ;;
esac
