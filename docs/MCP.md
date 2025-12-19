# HALL Server (MCP)

This guide explains how to use HALL with AI coding agents via the Model Context Protocol (MCP).

## What is MCP?

MCP is a standard protocol that lets AI tools call external services. HALL exposes its coordination features as MCP tools, so agents like Claude Code, Cursor, or any MCP-compatible client can:

- Create and track tasks
- Declare intent before editing files
- Claim files to prevent conflicts
- Attach evidence (command output) to prove work

## Quick Start

```bash
# Build the project
npm run build

# Test the MCP server manually (Ctrl+C to exit)
npm run mcp
```

The MCP server uses stdio transport (stdin/stdout JSON-RPC).

## Setup by Tool

### Claude Code

Add to `~/.claude.json` (or use `claude mcp add`):

```json
{
  "mcpServers": {
    "hall": {
      "command": "node",
      "args": ["/absolute/path/to/hall/dist/mcp.js"],
      "env": {
        "HALL_DB_PATH": "/absolute/path/to/your/repo/.hall/hall.sqlite"
      }
    }
  }
}
```

Or via CLI:

```bash
claude mcp add hall node /path/to/hall/dist/mcp.js
```

### Cursor

Add to `.cursor/mcp.json` in your project:

```json
{
  "mcpServers": {
    "hall": {
      "command": "node",
      "args": ["./path/to/hall/dist/mcp.js"]
    }
  }
}
```

### VS Code + Continue

Add to your Continue config:

```json
{
  "mcpServers": [
    {
      "name": "hall",
      "command": "node",
      "args": ["/path/to/hall/dist/mcp.js"]
    }
  ]
}
```

### Generic MCP Client

Any MCP client can connect via:

```bash
node /path/to/hall/dist/mcp.js
```

Communication is JSON-RPC 2.0 over stdio.

## Available Tools

### `hall_status`

Get current HALL server status.

```
Returns: { tasks, intents, claims, evidence, now }
```

### `hall_task_create`

Create a new task (top-level work item).

```
Inputs:
  - title (required): Task title (1-200 chars)
  - description (optional): Details (max 2000 chars)

Returns: { id, title, description, createdAt }
```

### `hall_task_get`

Get a task with all its intents and evidence.

```
Inputs:
  - taskId (required): Task ID

Returns: { task, intents[], evidence[] }
```

### `hall_task_list`

List recent tasks.

```
Inputs:
  - limit (optional): Max results (1-200, default 50)

Returns: Task[]
```

### `hall_intent_post`

Declare what you plan to change BEFORE editing. Required by HALL contract.

```
Inputs:
  - taskId (required): Task ID
  - agentId (required): Your identifier (e.g., "claude-code")
  - files (required): Array of file paths you'll modify
  - boundaries (optional): What you promise NOT to change
  - acceptanceCriteria (optional): How to verify the work

Returns: { id, taskId, agentId, files, boundaries, acceptanceCriteria, createdAt }
```

### `hall_claim`

Claim exclusive access to files. Required before editing.

```
Inputs:
  - agentId (required): Your identifier
  - files (required): Array of file paths to claim
  - ttlSeconds (optional): Claim duration (5-3600, default 900)

Returns:
  - If no conflicts: { status: "ok", claim, conflictsWith: [] }
  - If conflicts: { status: "conflict", claim, conflictsWith: ["other-agent"], message }
```

### `hall_claim_release`

Release your claims when done editing.

```
Inputs:
  - agentId (required): Your identifier
  - files (optional): Specific files to release (omit to release all)

Returns: { status: "ok", released }
```

### `hall_claims_list`

List all active claims across all agents.

```
Returns: Claim[] with { agentId, files[], expiresAt, createdAt }
```

### `hall_evidence_attach`

Attach proof that your work is complete. Required by HALL contract.

```
Inputs:
  - taskId (required): Task ID
  - agentId (required): Your identifier
  - command (required): Command that was run
  - output (required): Command output (stdout/stderr)

Returns: { id, taskId, agentId, command, output, createdAt }
```

### `hall_overlap_check`

Check if files are claimed by other agents before starting work.

```
Inputs:
  - files (required): Array of file paths to check

Returns: { hasOverlaps, overlaps[], checkedFiles }
```

## Resources

The MCP server also exposes these resources:

- `hall://contract` - The HALL agent rules (markdown)
- `hall://status` - Current server status (JSON)

## Typical Workflow

Here's how an agent should use HALL:

```
1. Check status
   → hall_status

2. Create or find task
   → hall_task_create { title: "Fix auth bug" }
   → Returns: { id: "abc123", ... }

3. Check for conflicts
   → hall_overlap_check { files: ["src/auth.ts"] }
   → Returns: { hasOverlaps: false, ... }

4. Declare intent
   → hall_intent_post {
       taskId: "abc123",
       agentId: "claude-code",
       files: ["src/auth.ts"],
       boundaries: "No changes to session handling",
       acceptanceCriteria: "Auth tests pass"
     }

5. Claim files
   → hall_claim {
       agentId: "claude-code",
       files: ["src/auth.ts"],
       ttlSeconds: 900
     }

6. Make your changes (edit the files)

7. Attach evidence
   → hall_evidence_attach {
       taskId: "abc123",
       agentId: "claude-code",
       command: "npm test -- --grep auth",
       output: "✓ 12 tests passed"
     }

8. Release claims
   → hall_claim_release { agentId: "claude-code" }
```

## Environment Variables

The MCP server respects these environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `HALL_DB_PATH` | `.hall/hall.sqlite` | SQLite database path |
| `HALL_REPO_ROOT` | `.` | Repository root for file watching |

## Troubleshooting

### "Database is locked"

Only one process can write to SQLite at a time. Make sure you're not running multiple HALL servers against the same database.

### Claims not working

Claims are per-agent, identified by `agentId`. Make sure each agent uses a consistent, unique identifier.

### Tool not appearing

1. Check your MCP config path is absolute
2. Verify the build: `npm run build`
3. Test manually: `echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | npm run mcp`

## Multi-Agent Setup

When running multiple agents:

1. Each agent needs a unique `agentId` (e.g., "claude-code-1", "cursor-agent")
2. All agents should point to the same `HALL_DB_PATH`
3. Use `hall_overlap_check` before claiming to avoid conflicts
4. Keep claim TTLs short (5-15 minutes) to avoid blocking others

## The HALL Contract

See [agents.md](agents.md) for the full contract, but the key rules are:

1. **Evidence is currency** - No receipts, no merge
2. **Intent before edits** - Declare what you'll change
3. **Claims prevent collisions** - Lock files before editing
4. **No silent failure** - Log errors, don't swallow them
5. **Small changes win** - Split large changes
