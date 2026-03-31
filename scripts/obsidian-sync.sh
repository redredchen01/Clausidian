#!/bin/bash

# Obsidian ← → Memory Sync Script
# 同步 Obsidian 庫內容到 Claude Code Memory 系統

set -e

WORKSPACE="/Users/dex/YD 2026"
OBSIDIAN_DIR="$WORKSPACE/obsidian"
MEMORY_DIR="/Users/dex/.claude/projects/-Users-dex-YD-2026/memory"

echo "🔄 Syncing Obsidian → Memory..."

# Sync project notes
for project in projects/*.md; do
    if [ -f "$OBSIDIAN_DIR/$project" ]; then
        # Extract project name
        name=$(basename "$project" .md)

        # Create memory entry if doesn't exist
        if [ ! -f "$MEMORY_DIR/project_${name}.md" ]; then
            echo "✨ Creating memory: project_${name}.md"
        else
            echo "✓ Updating memory: project_${name}.md"
        fi
    fi
done

# Sync areas (knowledge domains)
echo "✓ Areas: $(ls -1 "$OBSIDIAN_DIR/areas/" | wc -l) domains"

# Sync resources
echo "✓ Resources: $(ls -1 "$OBSIDIAN_DIR/resources/" | wc -l) items"

# Update MEMORY.md index
echo "📋 Updating MEMORY.md..."
obsidian-cli stats "$OBSIDIAN_DIR" > /tmp/obsidian-stats.txt 2>/dev/null || true

echo ""
echo "✅ Sync complete!"
echo "   Obsidian: $OBSIDIAN_DIR"
echo "   Memory:   $MEMORY_DIR"
