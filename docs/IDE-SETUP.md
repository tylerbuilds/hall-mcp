# HALL - IDE Setup Guide

This guide explains how to configure HALL for different AI coding assistants.

## Prerequisites

1. Build HALL:
   ```bash
   cd /path/to/hall-mcp
   npm install
   npx tsc -p tsconfig.json
   ```

2. Note the full path to `dist/mcp.js` (you'll need this below)

---

## Claude Code

**Config location:** `~/.claude.json` (user-level) or use CLI

### Option 1: CLI (Recommended)
```bash
claude mcp add hall --command "node" --args "/path/to/hall-mcp/dist/mcp.js" --scope user
```

### Option 2: Manual (add to ~/.claude.json)
```json
{
  "mcpServers": {
    "hall": {
      "command": "node",
      "args": ["/path/to/hall-mcp/dist/mcp.js"]
    }
  }
}
```

### Option 3: Project-level (.mcp.json in project root)
```json
{
  "mcpServers": {
    "hall": {
      "command": "node",
      "args": ["/path/to/hall-mcp/dist/mcp.js"]
    }
  }
}
```

**Restart Claude Code after adding.**

---

## Cursor

**Config location:** `~/.cursor/mcp.json`

### Template
```json
{
  "mcpServers": {
    "hall": {
      "command": "node",
      "args": ["/path/to/hall-mcp/dist/mcp.js"]
    }
  }
}
```

Create the directory if it doesn't exist:
```bash
mkdir -p ~/.cursor
```

**Restart Cursor after adding.**

---

## Google AntiGravity

**Config location:** `~/.gemini/antigravity/mcp_config.json`

### Template
```json
{
  "mcpServers": {
    "hall": {
      "command": "node",
      "args": ["/path/to/hall-mcp/dist/mcp.js"]
    }
  }
}
```

### Alternative: GUI Setup
1. Open AntiGravity
2. Click Agent session > "..." dropdown > MCP Servers
3. Select "Manage MCP Servers" > "View raw config"
4. Add the hall server configuration

**Restart AntiGravity after adding.**

---

## OpenCode

**Config location:** `~/.config/opencode/mcp.json`

### Template
```json
{
  "mcpServers": {
    "hall": {
      "command": "node",
      "args": ["/path/to/hall-mcp/dist/mcp.js"]
    }
  }
}
```

Create the directory if it doesn't exist:
```bash
mkdir -p ~/.config/opencode
```

**Restart OpenCode after adding.**

---

## VS Code with Continue

**Config location:** `~/.continue/config.json`

### Template (add to existing config)
```json
{
  "mcpServers": [
    {
      "name": "hall",
      "command": "node",
      "args": ["/path/to/hall-mcp/dist/mcp.js"]
    }
  ]
}
```

---

## Verifying Installation

After setup, verify HALL is working by asking the agent:
```
Can you check the HALL status?
```

Or run the tool directly:
```
hall_status()
```

Expected response:
```json
{
  "tasks": 0,
  "intents": 0,
  "claims": 0,
  "evidence": 0,
  "changelog": 0,
  "now": 1702900000000
}
```

---

## Project-Level Configuration

For per-project HALL setup, create `.mcp.json` in your project root:

```json
{
  "mcpServers": {
    "hall": {
      "command": "node",
      "args": ["/path/to/hall-mcp/dist/mcp.js"]
    }
  }
}
```

This allows different projects to use different HALL instances.

---

## Systemd Service (Linux)

For automatic startup on reboot:

```bash
# Create service file
mkdir -p ~/.config/systemd/user
cat > ~/.config/systemd/user/hall.service << 'EOF'
[Unit]
Description=HALL Server
After=network.target

[Service]
Type=simple
ExecStart=/usr/bin/node /path/to/hall-mcp/dist/index.js
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=default.target
EOF

# Enable and start
systemctl --user daemon-reload
systemctl --user enable hall
systemctl --user start hall

# Enable linger (keeps service running after logout)
loginctl enable-linger $USER
```

---

## Troubleshooting

### "MCP server hall not found"
1. Check the path to `dist/mcp.js` exists
2. Verify you built the project (`npx tsc`)
3. Check config file location for your IDE
4. Restart the IDE after adding config

### "Command failed: node"
1. Ensure Node.js is installed and in PATH
2. Try using full path to node: `/usr/bin/node`

### Spaces in path
If your HALL path contains spaces, the JSON config handles it automatically. No escaping needed in the args array.

### Check logs
Run HALL manually to see errors:
```bash
node "/path/to/hall-mcp/dist/mcp.js"
```
