#!/bin/bash

# Session Wrap — Auto-save context at session end
# Usage: ./session-wrap.sh [optional-summary]

set -e

WORKSPACE="/Users/dex/YD 2026"
MEMORY_DIR="/Users/dex/.claude/projects/-Users-dex-YD-2026/memory"
OBSIDIAN_DIR="$WORKSPACE/obsidian"

TIMESTAMP=$(date +%Y-%m-%d\ %H:%M:%S)
DATE=$(date +%Y%m%d)
SUMMARY="${1:-Auto-wrap at session end}"

echo "🔄 Session Wrap — $TIMESTAMP"
echo ""

# 1. Create session wrap file
echo "📝 Creating session wrap..."
WRAP_FILE="$MEMORY_DIR/session_${DATE}_wrap.md"

cat > "$WRAP_FILE" << EOF
---
name: Session ${DATE} Wrap
description: Auto-generated session summary
type: project
timestamp: $TIMESTAMP
---

# Session ${DATE} — Auto Wrap

## Summary
$SUMMARY

## Obsidian Sync Status
- Files: $(find "$OBSIDIAN_DIR" -type f -name "*.md" | wc -l)
- Last update: $(date -r "$OBSIDIAN_DIR/_index.md" +%Y-%m-%d\ %H:%M:%S 2>/dev/null || echo "Unknown")

## Memory Status
- Files: $(ls -1 "$MEMORY_DIR"/*.md 2>/dev/null | wc -l)
- Size: $(du -sh "$MEMORY_DIR" | cut -f1)

## Next Session Recommendations
- [ ] Load MEMORY.md for context
- [ ] Check project status from Memory
- [ ] Continue from last checkpoint

---
Generated: $TIMESTAMP
EOF

echo "✅ Wrap file: $WRAP_FILE"

# 2. Sync Obsidian content to Memory
echo ""
echo "🔗 Syncing Obsidian → Memory..."
if [ -f "$WORKSPACE/obsidian-sync.sh" ]; then
    bash "$WORKSPACE/obsidian-sync.sh" 2>/dev/null || true
fi

# 3. Update MEMORY.md last sync timestamp
echo ""
echo "📋 Updating MEMORY index..."
SYNC_TIME=$(date +%Y-%m-%d\ %H:%M)
sed -i '' "s/\*最後更新：.*/\*最後更新：$SYNC_TIME (session-wrap)\*/" "$MEMORY_DIR/MEMORY.md" 2>/dev/null || true

# 4. Create checkpoint
echo ""
echo "✨ Creating checkpoint..."
git -C "$OBSIDIAN_DIR" add -A 2>/dev/null || true
git -C "$OBSIDIAN_DIR" commit -m "session-wrap: checkpoint at $TIMESTAMP" 2>/dev/null || echo "⚠️  Obsidian git: No changes to commit"

echo ""
echo "✅ Session wrap complete!"
echo ""
echo "Next session checklist:"
echo "  1. Review: cat $WRAP_FILE"
echo "  2. Load: source ~/.zshrc-workspace"
echo "  3. Status: cat $MEMORY_DIR/MEMORY.md"
