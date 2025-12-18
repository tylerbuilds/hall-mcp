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

See [docs/MCP.md](docs/MCP.md) for setup guides for Claude Code, Cursor, and other tools.

## Next steps

1. ~~Add MCP server wrapper so Claude Code, Cursor, OpenCode, Codex, AntiGravity can call `hall.*` tools.~~ Done!
2. Add a gate runner that can execute your repo-specific checks and publish receipts.
3. Add symbol-level overlap detection (tree-sitter) once file-level is proving useful.

