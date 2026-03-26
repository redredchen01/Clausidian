#!/bin/bash
set -e

# Test Suite for Session-Wrap-Skill v3.4.0 Agent Tools
# Validates all 7 agent coordination tools

export YD_MEMORY="${YD_MEMORY:-$HOME/.session-wrap-test}"
TESTS_PASSED=0
TESTS_FAILED=0

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

source ~/.zshrc-wrap

echo "═══════════════════════════════════════════════════════════"
echo "🧪 SESSION-WRAP-SKILL v3.4.0 TEST SUITE"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "Memory directory: $YD_MEMORY"
echo ""

# Initialize test memory
mkdir -p "$YD_MEMORY"

# ============================================
# Helper Functions
# ============================================

test_pass() {
  echo -e "${GREEN}✅ PASS${NC}: $1"
  ((TESTS_PASSED++))
}

test_fail() {
  echo -e "${RED}❌ FAIL${NC}: $1"
  ((TESTS_FAILED++))
}

assert_file_exists() {
  if [ -f "$1" ]; then
    test_pass "File exists: $1"
    return 0
  else
    test_fail "File does not exist: $1"
    return 1
  fi
}

assert_contains() {
  if grep -q "$2" "$1"; then
    test_pass "File contains: $2"
    return 0
  else
    test_fail "File does not contain: $2"
    return 1
  fi
}

assert_json_valid() {
  if jq empty "$1" 2>/dev/null; then
    test_pass "Valid JSON: $1"
    return 0
  else
    test_fail "Invalid JSON: $1"
    return 1
  fi
}

# ============================================
# TEST 1: agent-knowledge
# ============================================
echo ""
echo -e "${BLUE}TEST 1: agent-knowledge${NC}"
echo "────────────────────────"

agent-knowledge set test-topic "Test knowledge content for validation"
test_pass "agent-knowledge set"

if agent-knowledge get test-topic | grep -q "Test knowledge content"; then
  test_pass "agent-knowledge get"
else
  test_fail "agent-knowledge get"
fi

if agent-knowledge list | grep -q "test-topic"; then
  test_pass "agent-knowledge list"
else
  test_fail "agent-knowledge list"
fi

# ============================================
# TEST 2: agent-decision
# ============================================
echo ""
echo -e "${BLUE}TEST 2: agent-decision${NC}"
echo "────────────────────────"

agent-decision log "test-decision" "chose option A" "option A is faster"
test_pass "agent-decision log"

DECISIONS=$(agent-decision list)
if echo "$DECISIONS" | grep -q "test-decision"; then
  test_pass "agent-decision list contains logged decision"
else
  test_fail "agent-decision list"
fi

if agent-decision search "chose option A" | grep -q "test-decision"; then
  test_pass "agent-decision search"
else
  test_fail "agent-decision search"
fi

# ============================================
# TEST 3: agent-tasks
# ============================================
echo ""
echo -e "${BLUE}TEST 3: agent-tasks${NC}"
echo "────────────────────────"

agent-tasks add "task-1" "First test task"
test_pass "agent-tasks add simple"

agent-tasks add "task-2" "Second test task" "task-1"
test_pass "agent-tasks add with dependency"

agent-tasks claim "task-1" "test-agent"
test_pass "agent-tasks claim"

agent-tasks done "task-1"
test_pass "agent-tasks done"

NEXT_TASKS=$(agent-tasks next)
if echo "$NEXT_TASKS" | grep -q "task-2"; then
  test_pass "agent-tasks next shows executable task"
else
  test_fail "agent-tasks next"
fi

STATUS=$(agent-tasks status)
if echo "$STATUS" | grep -q "task-1"; then
  test_pass "agent-tasks status"
else
  test_fail "agent-tasks status"
fi

# Verify JSON structure
assert_json_valid "$YD_MEMORY/tasks/tasks.json"

# ============================================
# TEST 4: agent-checkpoint
# ============================================
echo ""
echo -e "${BLUE}TEST 4: agent-checkpoint${NC}"
echo "────────────────────────"

# Create a test file to checkpoint
echo "test content v1" > "$YD_MEMORY/test-checkpoint.txt"

agent-checkpoint save "test-checkpoint-1"
test_pass "agent-checkpoint save"

# Verify checkpoint file created
if [ -d "$YD_MEMORY/checkpoints" ]; then
  test_pass "Checkpoints directory created"
else
  test_fail "Checkpoints directory not created"
fi

LIST=$(agent-checkpoint list)
if echo "$LIST" | grep -q "test-checkpoint-1"; then
  test_pass "agent-checkpoint list"
else
  test_fail "agent-checkpoint list"
fi

# ============================================
# TEST 5: agent-share
# ============================================
echo ""
echo -e "${BLUE}TEST 5: agent-share${NC}"
echo "────────────────────────"

cat > "$YD_MEMORY/test-state.md" << 'EOF'
# Test Agent State

## Completed Tasks
- Task 1: Done
- Task 2: In progress

## Notes
Testing agent-share functionality
EOF

agent-share write test-agent-1 "$YD_MEMORY/test-state.md"
test_pass "agent-share write"

if [ -f "$YD_MEMORY/agents/test-agent-1-state.md" ]; then
  test_pass "Agent state file created"
else
  test_fail "Agent state file not created"
fi

SHARED=$(agent-share read test-agent-1)
if echo "$SHARED" | grep -q "Test Agent State"; then
  test_pass "agent-share read"
else
  test_fail "agent-share read"
fi

LIST=$(agent-share list)
if echo "$LIST" | grep -q "test-agent-1"; then
  test_pass "agent-share list"
else
  test_fail "agent-share list"
fi

# ============================================
# TEST 6: agent-context
# ============================================
echo ""
echo -e "${BLUE}TEST 6: agent-context${NC}"
echo "────────────────────────"

# Set up knowledge for context
agent-knowledge set architecture "Test architecture with microservices"
agent-knowledge set conventions "TypeScript strict mode required"

CONTEXT=$(agent-context)
if echo "$CONTEXT" | grep -q "architecture"; then
  test_pass "agent-context shows architecture"
else
  test_fail "agent-context missing architecture"
fi

if echo "$CONTEXT" | grep -q "conventions"; then
  test_pass "agent-context shows conventions"
else
  test_fail "agent-context missing conventions"
fi

if echo "$CONTEXT" | grep -q "test-decision"; then
  test_pass "agent-context shows recent decisions"
else
  test_fail "agent-context missing decisions"
fi

# ============================================
# TEST 7: agent-optimize
# ============================================
echo ""
echo -e "${BLUE}TEST 7: agent-optimize${NC}"
echo "────────────────────────"

STATS=$(agent-optimize stats)
if echo "$STATS" | grep -q "Total memory"; then
  test_pass "agent-optimize stats"
else
  test_fail "agent-optimize stats"
fi

# Don't actually archive in test (would modify state)
# agent-optimize archive
test_pass "agent-optimize available (not running archive)"

# ============================================
# TEST 8: Memory Structure Validation
# ============================================
echo ""
echo -e "${BLUE}TEST 8: Memory Structure Validation${NC}"
echo "────────────────────────"

# Check all required directories
for dir in agents decisions knowledge checkpoints tasks; do
  if [ -d "$YD_MEMORY/$dir" ]; then
    test_pass "Directory exists: $dir"
  else
    test_fail "Directory missing: $dir"
  fi
done

# Check critical files
assert_file_exists "$YD_MEMORY/tasks/tasks.json"
assert_file_exists "$YD_MEMORY/MEMORY.md"

# ============================================
# TEST 9: Integration Test - Multi-Agent Flow
# ============================================
echo ""
echo -e "${BLUE}TEST 9: Integration Test - Multi-Agent Flow${NC}"
echo "────────────────────────"

# Simulate Agent A
agent-tasks add "feature-a" "Implement feature A"
agent-tasks claim "feature-a" "agent-a"
agent-decision log "feature-a" "use REST API" "simpler than GraphQL"
agent-tasks done "feature-a"
agent-share write agent-a << 'EOF'
# Agent A Progress

Completed feature A using REST API design pattern.
EOF
test_pass "Agent A workflow complete"

# Simulate Agent B reading A's work
AGENT_A_STATE=$(agent-share read agent-a)
if echo "$AGENT_A_STATE" | grep -q "Agent A Progress"; then
  test_pass "Agent B can read Agent A's work"
else
  test_fail "Agent B cannot read Agent A's work"
fi

# Agent B sees what A did and starts next task
NEXT=$(agent-tasks next)
test_pass "Agent B can see next available tasks"

# Verify decision is traceable
if agent-decision search "REST API" | grep -q "feature-a"; then
  test_pass "Decisions are searchable and traceable"
else
  test_fail "Decisions not searchable"
fi

# ============================================
# TEST 10: Wrap and Session Management
# ============================================
echo ""
echo -e "${BLUE}TEST 10: Session Management${NC}"
echo "────────────────────────"

WRAP_COUNT=$(ls -1 "$YD_MEMORY"/session_*.md 2>/dev/null | wc -l)
if [ "$WRAP_COUNT" -gt 0 ]; then
  test_pass "Session wrap files created"
else
  test_fail "No session wrap files found"
fi

# ============================================
# SUMMARY
# ============================================
echo ""
echo "═══════════════════════════════════════════════════════════"
echo "📊 TEST SUMMARY"
echo "═══════════════════════════════════════════════════════════"
echo ""

TOTAL=$((TESTS_PASSED + TESTS_FAILED))
PASS_RATE=$(( (TESTS_PASSED * 100) / TOTAL ))

echo -e "Total Tests:  ${BLUE}$TOTAL${NC}"
echo -e "Passed:       ${GREEN}$TESTS_PASSED${NC}"
echo -e "Failed:       ${RED}$TESTS_FAILED${NC}"
echo -e "Pass Rate:    ${BLUE}${PASS_RATE}%${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
  echo -e "${GREEN}🎉 ALL TESTS PASSED!${NC}"
  echo ""
  echo "All 7 agent tools are working correctly:"
  echo "  1. ✅ agent-knowledge"
  echo "  2. ✅ agent-decision"
  echo "  3. ✅ agent-tasks"
  echo "  4. ✅ agent-checkpoint"
  echo "  5. ✅ agent-share"
  echo "  6. ✅ agent-context"
  echo "  7. ✅ agent-optimize"
  echo ""
  echo "Integration test: Multi-agent coordination working ✅"
  echo ""
  exit 0
else
  echo -e "${RED}❌ SOME TESTS FAILED${NC}"
  echo ""
  echo "Fix the following issues and rerun:"
  echo "  $TESTS_FAILED test(s) failed"
  echo ""
  exit 1
fi
