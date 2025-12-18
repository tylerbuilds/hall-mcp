# HALL

HALL (Holistic Agent Live Lobby) is a local-first coordination layer for building a software dev team out of multiple coding agents.

The goal is simple: agents can work in chaos, but they can also see each other. HALL provides:

- **Intent announcements** (what an agent plans to change)
- **Claims** (who owns which files for a short time)
- **Overlap detection** (conflicts before they become merge carnage)
- **Evidence receipts** (commands run, outputs captured)
- **Real-time events** (file change stream, task updates, gate results)

## No surprises policy

- HALL never auto-edits your repo.
- It never phones home.
- It logs what it is doing and why.
- Anything destructive is behind an explicit command.

## Quick start

Prereqs: Node.js 20+.

```bash
npm install
npm run dev
```

In a second terminal:

```bash
npm run build
npm run cli -- status
```

Default endpoints:

- API: `http://localhost:4177/api`
- WebSocket: `ws://localhost:4177/ws`

## CLI examples

```bash
npm run cli -- task create --title "Fix failing integration test" --description "Repro + fix + evidence"

npm run cli -- intent post --taskId <taskId> --agentId claude-code --files "src/core/*" --acceptance "Tests pass; docs updated" --boundaries "No database schema changes"

npm run cli -- claim --agentId claude-code --files "src/core/router.ts" --ttl 900

npm run cli -- evidence attach --taskId <taskId> --agentId claude-code --command "pytest -q" --output "..."
```

## Architecture

- **Fastify** server with:
  - Helmet headers
  - Rate limiting
  - Zod validation
  - Pino structured logs
- **SQLite** (better-sqlite3) for state (tasks, intents, claims, evidence)
- **Chokidar** for repo file watching
- **WebSocket** for event broadcast to all connected agents

## Configuration

Copy and edit:

```bash
cp .env.example .env
```

Key settings:

- `HALL_PORT` (default `4177`)
- `HALL_REPO_ROOT` (default `.`)
- `HALL_DB_PATH` (default `./.hall/hall.sqlite`)
- `HALL_RATE_LIMIT_RPM` (default `300`)

## Security posture

Local-first, default-deny, least surprise:

- Only binds to `127.0.0.1` by default
- Rate limits enabled by default
- Helmet security headers enabled by default
- Input validation on all mutating endpoints
- Logs are structured and redactable

See `SECURITY.md` for more.

## MCP Server

HALL includes an MCP (Model Context Protocol) server so AI coding agents can coordinate through `hall_*` tools.

```bash
npm run build
npm run mcp   # stdio transport
```

### IDE Setup

See [docs/IDE-SETUP.md](docs/IDE-SETUP.md) for detailed setup instructions for:
- Claude Code
- Cursor
- Google AntiGravity
- OpenCode
- VS Code with Continue

### Project Templates

Copy templates from `templates/` to enable HALL in your projects:

```bash
# For Claude Code
cp templates/CLAUDE.md.template /your/project/CLAUDE.md

# For Cursor
cp templates/.cursorrules.template /your/project/.cursorrules

# For project-level MCP config (any tool)
cp templates/.mcp.json.template /your/project/.mcp.json
# Then edit .mcp.json to set the correct path to HALL
```

### Available Tools

| Tool | Description |
|------|-------------|
| `hall_status` | Get server status (tasks, intents, claims, evidence, changelog) |
| `hall_task_create` | Create a new task |
| `hall_task_list` | List recent tasks |
| `hall_task_get` | Get task with intents and evidence |
| `hall_intent_post` | Declare intent before editing (required) |
| `hall_claim` | Claim exclusive file access (requires intent) |
| `hall_claim_release` | Release claims (requires evidence) |
| `hall_claims_list` | List all active claims |
| `hall_overlap_check` | Check for conflicts before claiming |
| `hall_evidence_attach` | Attach proof of work |
| `hall_changelog_log` | Log file changes for debugging |
| `hall_changelog_search` | Search change history |

See [docs/MCP.md](docs/MCP.md) for detailed tool documentation.

## Enforced Workflow

HALL enforces quality at the server level:

1. **Intent before claim** - `hall_claim` rejects if no intent declared
2. **Evidence before release** - `hall_claim_release` rejects if no evidence attached
3. **Acceptance criteria required** - `hall_intent_post` requires criteria (min 10 chars)

This prevents agents from cutting corners.

## Changelog Feature

Track all agent changes for git-bisect-like debugging:

```bash
# Log a change
hall_changelog_log(agentId, filePath, changeType, summary)

# Search history
hall_changelog_search(filePath: "broken/file.ts", since: timestamp)
```

Find exactly when and who introduced an issue.

## Next steps

1. ~~Add MCP server wrapper so Claude Code, Cursor, OpenCode, Codex, AntiGravity can call `hall.*` tools.~~ Done!
2. ~~Add changelog for debugging when issues were introduced.~~ Done!
3. Add a gate runner that can execute your repo-specific checks and publish receipts.
4. Add symbol-level overlap detection (tree-sitter) once file-level is proving useful.

