#!/usr/bin/env node

const API = process.env.HALL_API ?? 'http://localhost:4177/api';

function usage(): void {
  console.log(`HALL CLI

Usage:
  hall status
  hall task create --title "..." [--description "..."]
  hall task list [--limit 50]
  hall task get --id <taskId>
  hall intent post --taskId <id> --agentId <id> --files "a,b" [--acceptance "..."] [--boundaries "..."]
  hall claim --agentId <id> --files "a,b" [--ttl 900]
  hall claim release --agentId <id> [--files "a,b"]
  hall claim list
  hall evidence attach --taskId <id> --agentId <id> --command "..." --output "..."

Env:
  HALL_API=http://localhost:4177/api
`);
}

function getFlag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  if (i === -1) return undefined;
  return args[i + 1];
}

async function request(method: string, path: string, body?: any) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 0) return usage();

  const [a, b] = args;

  if (a === 'status') {
    const r = await request('GET', '/status');
    console.log(JSON.stringify(r.data, null, 2));
    return;
  }

  if (a === 'task' && b === 'create') {
    const title = getFlag(args, '--title');
    if (!title) return usage();
    const description = getFlag(args, '--description');
    const r = await request('POST', '/tasks', { title, description });
    console.log(JSON.stringify(r.data, null, 2));
    process.exit(r.status >= 400 ? 1 : 0);
  }

  if (a === 'task' && b === 'list') {
    const limit = getFlag(args, '--limit');
    const r = await request('GET', `/tasks${limit ? `?limit=${limit}` : ''}`);
    console.log(JSON.stringify(r.data, null, 2));
    return;
  }

  if (a === 'task' && b === 'get') {
    const id = getFlag(args, '--id');
    if (!id) return usage();
    const r = await request('GET', `/tasks/${id}`);
    console.log(JSON.stringify(r.data, null, 2));
    process.exit(r.status >= 400 ? 1 : 0);
  }

  if (a === 'intent' && b === 'post') {
    const taskId = getFlag(args, '--taskId');
    const agentId = getFlag(args, '--agentId');
    const files = (getFlag(args, '--files') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    const acceptanceCriteria = getFlag(args, '--acceptance');
    const boundaries = getFlag(args, '--boundaries');
    if (!taskId || !agentId || files.length === 0) return usage();
    const r = await request('POST', '/intents', { taskId, agentId, files, acceptanceCriteria, boundaries });
    console.log(JSON.stringify(r.data, null, 2));
    process.exit(r.status >= 400 ? 1 : 0);
  }

  if (a === 'claim' && b === 'list') {
    const r = await request('GET', '/claims');
    console.log(JSON.stringify(r.data, null, 2));
    return;
  }

  if (a === 'claim' && b === 'release') {
    const agentId = getFlag(args, '--agentId');
    if (!agentId) return usage();
    const filesStr = getFlag(args, '--files');
    const files = filesStr ? filesStr.split(',').map((s) => s.trim()).filter(Boolean) : undefined;
    const r = await request('DELETE', '/claims', { agentId, files });
    console.log(JSON.stringify(r.data, null, 2));
    process.exit(r.status >= 400 ? 1 : 0);
  }

  if (a === 'claim' && !b) {
    const agentId = getFlag(args, '--agentId');
    const files = (getFlag(args, '--files') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    const ttlSeconds = parseInt(getFlag(args, '--ttl') ?? '900', 10);
    if (!agentId || files.length === 0) return usage();
    const r = await request('POST', '/claims', { agentId, files, ttlSeconds });
    console.log(JSON.stringify(r.data, null, 2));
    process.exit(r.status === 409 ? 2 : r.status >= 400 ? 1 : 0);
  }

  if (a === 'evidence' && b === 'attach') {
    const taskId = getFlag(args, '--taskId');
    const agentId = getFlag(args, '--agentId');
    const command = getFlag(args, '--command');
    const output = getFlag(args, '--output') ?? '';
    if (!taskId || !agentId || !command) return usage();
    const r = await request('POST', '/evidence', { taskId, agentId, command, output });
    console.log(JSON.stringify(r.data, null, 2));
    process.exit(r.status >= 400 ? 1 : 0);
  }

  usage();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
