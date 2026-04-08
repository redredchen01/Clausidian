#!/usr/bin/env python3
"""
Remove deleted command entries from registry files.
This script removes command definitions that no longer have corresponding command files.
"""

import os
import re
import json

PROJECT_ROOT = "/Users/dex/YD 2026/projects/tools/clausidian/.worktrees/feat/clausidian-convergence-v3.9.0"
COMMANDS_DIR = os.path.join(PROJECT_ROOT, "src/commands")
REGISTRY_DIR = os.path.join(PROJECT_ROOT, "src/registry")

# Get list of existing command files
existing_commands = set()
for filename in os.listdir(COMMANDS_DIR):
    if filename.endswith('.mjs'):
        cmd_name = filename.replace('.mjs', '')
        existing_commands.add(cmd_name)

print(f"✓ Found {len(existing_commands)} command files")
print(f"  Commands: {sorted(existing_commands)}")

# Commands to check for deletion in registry files
deleted_commands = [
    'archive', 'batch', 'bridge', 'broken-links', 'changelog', 'claude-md',
    'duplicates', 'events', 'export', 'focus', 'graph', 'hook', 'import',
    'launchd', 'link', 'memory', 'merge', 'move', 'neighbors', 'open',
    'orphans', 'patch', 'pin', 'quicknote', 'random', 'recent', 'relink',
    'review', 'stale', 'subscribe', 'timeline', 'unpin', 'update', 'validate', 'watch'
]

print(f"\n📋 Will remove {len(deleted_commands)} command definitions from registry")

# Process each registry file
registry_files = [f for f in os.listdir(REGISTRY_DIR) if f.endswith('.mjs')]
removed_total = 0

for registry_file in sorted(registry_files):
    filepath = os.path.join(REGISTRY_DIR, registry_file)
    
    with open(filepath, 'r') as f:
        content = f.read()
    
    # Find all command names in this file
    name_pattern = r"name:\s*['\"]([^'\"]+)['\"]"
    commands_in_file = re.findall(name_pattern, content)
    
    # Find which commands in this file should be removed
    to_remove = [cmd for cmd in commands_in_file if cmd in deleted_commands]
    
    if to_remove:
        print(f"\n📝 {registry_file}: Found {len(to_remove)} commands to remove")
        print(f"   {to_remove}")
        
        # Remove each command block (heuristic: from name: to closing },)
        for cmd_name in to_remove:
            # Pattern: find the opening brace for this command and the closing brace
            # This is fragile but works for consistently formatted files
            pattern = r"\{\s*\n\s*name:\s*['\"]" + re.escape(cmd_name) + r"['\"][^}]*\},?"
            
            new_content = re.sub(pattern, "", content, flags=re.DOTALL)
            
            if new_content != content:
                content = new_content
                removed_total += 1
                print(f"     ✓ Removed '{cmd_name}'")
            else:
                print(f"     ⚠️  Could not remove '{cmd_name}' (pattern not found)")
        
        # Write back
        with open(filepath, 'w') as f:
            f.write(content)
        
        print(f"   ✓ Updated {registry_file}")

print(f"\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
print(f"✅ Removed {removed_total} command definitions from registry files")
print(f"   Remaining files should define ~22 commands total")
print(f"\nNext steps:")
print(f"  1. Run: npm test  (to check for import errors)")
print(f"  2. Verify: npm run dev && clausidian --help  (check command count)")
