# MCP Configuration Setup

> `mcp-config-example.json` is a template for setting up clausidian as an MCP server in Claude Code.

## Setup Instructions

### 1. Replace the vault path

Edit `mcp-config-example.json` and replace `REPLACE_WITH_YOUR_VAULT_PATH` with your actual vault directory:

- **macOS/Linux**: `/Users/username/my-vault` or `$HOME/my-vault` (use full path, not `~`)
- **Windows**: `C:\\Users\\username\\my-vault`

### 2. Common vault locations

- **iCloud Drive**: `/Users/username/Library/Mobile Documents/com~apple~CloudDocs/my-vault`
- **Dropbox**: `/Users/username/Dropbox/my-vault`
- **Local**: `/Users/username/obsidian-vault`

### 3. Add to Claude Code MCP config

1. Edit `~/.claude/.mcp.json`
2. Paste the entire `mcpServers` block from this example into your existing `mcpServers` object

Example `~/.claude/.mcp.json`:
```json
{
  "mcpServers": {
    "clausidian": {
      "command": "clausidian",
      "args": ["serve", "--vault", "/Users/username/my-vault"]
    }
  }
}
```

### 4. Verify configuration

After editing:
1. Restart Claude Code
2. Run `/obsidian health` in any project
3. If you see vault statistics, configuration is successful

### 5. Troubleshooting

| Issue | Solution |
|-------|----------|
| Permission denied | Ensure your user has access to the vault directory |
| Path not found | Use `echo $HOME` to confirm path; always use full path (no `~`) |
| MCP not loading | Check Claude Code output logs for clausidian connection errors |
| Command not found | Ensure `clausidian` is installed: `npm install -g clausidian` |
