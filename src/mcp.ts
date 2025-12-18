#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { loadConfig } from './core/config.js';
import { createLogger } from './core/logger.js';
import { openDb } from './infra/db.js';
import { HallState } from './core/state.js';

const cfg = loadConfig(process.env);
const log = createLogger({ ...cfg, HALL_LOG_LEVEL: 'silent' });
const db = openDb(cfg);
const state = new HallState(db, log);

const server = new Server(
  {
    name: 'hall',
    version: '0.1.0'
  },
  {
    capabilities: {
      tools: {},
      resources: {}
    }
  }
);

// Tool input schemas
const TaskCreateInput = z.object({
  title: z.string().min(1).max(200).describe('Task title'),
  description: z.string().max(2000).optional().describe('Task description')
});

const TaskGetInput = z.object({
  taskId: z.string().min(4).describe('Task ID')
});

const TaskListInput = z.object({
  limit: z.number().int().min(1).max(200).default(50).optional().describe('Max tasks to return')
});

const IntentPostInput = z.object({
  taskId: z.string().min(4).describe('Task ID this intent belongs to'),
  agentId: z.string().min(1).max(120).describe('Your agent identifier'),
  files: z.array(z.string().min(1)).min(1).max(200).describe('Files you intend to modify'),
  boundaries: z.string().max(4000).optional().describe('What you promise NOT to change'),
  acceptanceCriteria: z.string().min(10).max(4000).describe('REQUIRED: How to verify the work is done (min 10 chars)')
});

const ClaimCreateInput = z.object({
  agentId: z.string().min(1).max(120).describe('Your agent identifier'),
  files: z.array(z.string().min(1)).min(1).max(200).describe('Files to claim exclusive access to'),
  ttlSeconds: z.number().int().min(5).max(3600).default(900).optional().describe('Claim duration in seconds')
});

const ClaimReleaseInput = z.object({
  agentId: z.string().min(1).max(120).describe('Your agent identifier'),
  files: z.array(z.string().min(1)).min(1).max(200).optional().describe('Files to release (all if omitted)')
});

const EvidenceAttachInput = z.object({
  taskId: z.string().min(4).describe('Task ID'),
  agentId: z.string().min(1).max(120).describe('Your agent identifier'),
  command: z.string().min(1).max(2000).describe('Command that was run'),
  output: z.string().min(0).max(500000).describe('Command output (stdout/stderr)')
});

const OverlapCheckInput = z.object({
  files: z.array(z.string().min(1)).min(1).max(200).describe('Files to check for overlaps')
});

const ChangelogLogInput = z.object({
  agentId: z.string().min(1).max(120).describe('Your agent identifier'),
  filePath: z.string().min(1).describe('File that was changed'),
  changeType: z.enum(['create', 'modify', 'delete']).describe('Type of change'),
  summary: z.string().min(1).max(500).describe('Brief description of what changed'),
  taskId: z.string().optional().describe('Associated task ID'),
  diffSnippet: z.string().max(5000).optional().describe('Key lines changed (optional)'),
  commitHash: z.string().max(100).optional().describe('Git commit hash if available')
});

const ChangelogSearchInput = z.object({
  filePath: z.string().optional().describe('Filter by file path (partial match)'),
  agentId: z.string().optional().describe('Filter by agent'),
  taskId: z.string().optional().describe('Filter by task'),
  changeType: z.enum(['create', 'modify', 'delete']).optional().describe('Filter by change type'),
  query: z.string().optional().describe('Search in summary and diff'),
  since: z.number().optional().describe('Changes after this timestamp'),
  until: z.number().optional().describe('Changes before this timestamp'),
  limit: z.number().int().min(1).max(500).default(50).optional().describe('Max results')
});

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'hall_status',
        description:
          'Get HALL server status including counts of tasks, intents, claims, and evidence. Use this to see the current state of the coordination layer.',
        inputSchema: {
          type: 'object',
          properties: {},
          required: []
        }
      },
      {
        name: 'hall_task_create',
        description:
          'Create a new task in HALL. Tasks are the top-level work items that intents and evidence attach to. Returns the created task with its ID.',
        inputSchema: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Task title (1-200 chars)' },
            description: { type: 'string', description: 'Task description (optional, max 2000 chars)' }
          },
          required: ['title']
        }
      },
      {
        name: 'hall_task_get',
        description:
          'Get a task by ID, including all its intents and evidence. Use this to see the full context of a task.',
        inputSchema: {
          type: 'object',
          properties: {
            taskId: { type: 'string', description: 'Task ID' }
          },
          required: ['taskId']
        }
      },
      {
        name: 'hall_task_list',
        description: 'List recent tasks. Returns tasks ordered by creation time (newest first).',
        inputSchema: {
          type: 'object',
          properties: {
            limit: { type: 'number', description: 'Max tasks to return (1-200, default 50)' }
          },
          required: []
        }
      },
      {
        name: 'hall_intent_post',
        description:
          'Post an intent declaring what you plan to change. HALL contract requires posting intent BEFORE claiming files. Include files you will touch, boundaries (what you promise NOT to change), and acceptance criteria. NOTE: acceptanceCriteria is REQUIRED.',
        inputSchema: {
          type: 'object',
          properties: {
            taskId: { type: 'string', description: 'Task ID this intent belongs to' },
            agentId: { type: 'string', description: 'Your agent identifier (e.g., "claude-code")' },
            files: {
              type: 'array',
              items: { type: 'string' },
              description: 'Files you intend to modify'
            },
            boundaries: { type: 'string', description: 'What you promise NOT to change (optional)' },
            acceptanceCriteria: { type: 'string', description: 'REQUIRED: How to verify the work is done (min 10 chars)' }
          },
          required: ['taskId', 'agentId', 'files', 'acceptanceCriteria']
        }
      },
      {
        name: 'hall_claim',
        description:
          'Claim exclusive access to files. REQUIRES: You must have posted an intent (hall_intent_post) for these files first. Returns conflicts if another agent already has a claim. Claims expire after TTL.',
        inputSchema: {
          type: 'object',
          properties: {
            agentId: { type: 'string', description: 'Your agent identifier' },
            files: {
              type: 'array',
              items: { type: 'string' },
              description: 'Files to claim exclusive access to'
            },
            ttlSeconds: { type: 'number', description: 'Claim duration in seconds (5-3600, default 900)' }
          },
          required: ['agentId', 'files']
        }
      },
      {
        name: 'hall_claim_release',
        description: 'Release your claims on files. REQUIRES: You must have attached evidence (hall_evidence_attach) before releasing. No receipts = no release.',
        inputSchema: {
          type: 'object',
          properties: {
            agentId: { type: 'string', description: 'Your agent identifier' },
            files: {
              type: 'array',
              items: { type: 'string' },
              description: 'Files to release (omit to release all your claims)'
            }
          },
          required: ['agentId']
        }
      },
      {
        name: 'hall_claims_list',
        description: 'List all active claims. Use this to see what files are claimed by which agents.',
        inputSchema: {
          type: 'object',
          properties: {},
          required: []
        }
      },
      {
        name: 'hall_evidence_attach',
        description:
          'Attach evidence (command + output) to a task. HALL contract requires evidence for all claims. No receipts = no merge.',
        inputSchema: {
          type: 'object',
          properties: {
            taskId: { type: 'string', description: 'Task ID' },
            agentId: { type: 'string', description: 'Your agent identifier' },
            command: { type: 'string', description: 'Command that was run' },
            output: { type: 'string', description: 'Command output (stdout/stderr)' }
          },
          required: ['taskId', 'agentId', 'command', 'output']
        }
      },
      {
        name: 'hall_overlap_check',
        description:
          'Check if any files have active claims by other agents. Use this before starting work to avoid conflicts.',
        inputSchema: {
          type: 'object',
          properties: {
            files: {
              type: 'array',
              items: { type: 'string' },
              description: 'Files to check for overlaps'
            }
          },
          required: ['files']
        }
      },
      {
        name: 'hall_changelog_log',
        description:
          'Log a file change to the changelog. Call this AFTER making any file edit to maintain a searchable history of all changes. This enables git-bisect-like debugging to find when issues were introduced.',
        inputSchema: {
          type: 'object',
          properties: {
            agentId: { type: 'string', description: 'Your agent identifier' },
            filePath: { type: 'string', description: 'File that was changed' },
            changeType: { type: 'string', enum: ['create', 'modify', 'delete'], description: 'Type of change' },
            summary: { type: 'string', description: 'Brief description of what changed (max 500 chars)' },
            taskId: { type: 'string', description: 'Associated task ID (optional)' },
            diffSnippet: { type: 'string', description: 'Key lines changed (optional, max 5000 chars)' },
            commitHash: { type: 'string', description: 'Git commit hash if available (optional)' }
          },
          required: ['agentId', 'filePath', 'changeType', 'summary']
        }
      },
      {
        name: 'hall_changelog_search',
        description:
          'Search the changelog to find when and how files were changed. Use this to debug issues by tracing file history, finding which agent made changes, or searching for specific modifications.',
        inputSchema: {
          type: 'object',
          properties: {
            filePath: { type: 'string', description: 'Filter by file path (partial match)' },
            agentId: { type: 'string', description: 'Filter by agent' },
            taskId: { type: 'string', description: 'Filter by task' },
            changeType: { type: 'string', enum: ['create', 'modify', 'delete'], description: 'Filter by change type' },
            query: { type: 'string', description: 'Search in summary and diff' },
            since: { type: 'number', description: 'Changes after this timestamp (ms)' },
            until: { type: 'number', description: 'Changes before this timestamp (ms)' },
            limit: { type: 'number', description: 'Max results (1-500, default 50)' }
          },
          required: []
        }
      }
    ]
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'hall_status': {
        const status = state.status();
        return {
          content: [{ type: 'text', text: JSON.stringify(status, null, 2) }]
        };
      }

      case 'hall_task_create': {
        const input = TaskCreateInput.parse(args);
        const task = state.createTask(input.title, input.description);
        return {
          content: [{ type: 'text', text: JSON.stringify(task, null, 2) }]
        };
      }

      case 'hall_task_get': {
        const input = TaskGetInput.parse(args);
        const task = state.getTask(input.taskId);
        if (!task) {
          return {
            content: [{ type: 'text', text: `Task not found: ${input.taskId}` }],
            isError: true
          };
        }
        const intents = state.listIntents(input.taskId);
        const evidence = state.listEvidence(input.taskId);
        return {
          content: [{ type: 'text', text: JSON.stringify({ task, intents, evidence }, null, 2) }]
        };
      }

      case 'hall_task_list': {
        const input = TaskListInput.parse(args ?? {});
        const tasks = state.listTasks(input.limit ?? 50);
        return {
          content: [{ type: 'text', text: JSON.stringify(tasks, null, 2) }]
        };
      }

      case 'hall_intent_post': {
        const input = IntentPostInput.parse(args);
        const intent = state.postIntent(input);
        return {
          content: [{ type: 'text', text: JSON.stringify(intent, null, 2) }]
        };
      }

      case 'hall_claim': {
        const input = ClaimCreateInput.parse(args);

        // ENFORCEMENT: Must have declared intent for these files first
        const intentCheck = state.hasIntentForFiles(input.agentId, input.files);
        if (!intentCheck.hasIntent) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    status: 'rejected',
                    reason: 'NO_INTENT',
                    message: `You must post an intent (hall_intent_post) before claiming files. Missing intent for: ${intentCheck.missingFiles.join(', ')}`,
                    missingFiles: intentCheck.missingFiles
                  },
                  null,
                  2
                )
              }
            ],
            isError: true
          };
        }

        const result = state.createClaim(input.agentId, input.files, input.ttlSeconds ?? 900);
        if (result.conflictsWith.length > 0) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    status: 'conflict',
                    claim: result.claim,
                    conflictsWith: result.conflictsWith,
                    message: `Files already claimed by: ${result.conflictsWith.join(', ')}`
                  },
                  null,
                  2
                )
              }
            ]
          };
        }
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ status: 'ok', claim: result.claim, conflictsWith: [] }, null, 2)
            }
          ]
        };
      }

      case 'hall_claim_release': {
        const input = ClaimReleaseInput.parse(args);

        // ENFORCEMENT: Must have attached evidence before releasing claims
        const activeClaims = state.getAgentClaims(input.agentId);
        if (activeClaims.length > 0) {
          const evidenceCheck = state.hasEvidenceForTask(input.agentId);
          if (!evidenceCheck.hasEvidence) {
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      status: 'rejected',
                      reason: 'NO_EVIDENCE',
                      message: 'You must attach evidence (hall_evidence_attach) proving your work before releasing claims. No receipts = no release.',
                      activeClaims: activeClaims
                    },
                    null,
                    2
                  )
                }
              ],
              isError: true
            };
          }
        }

        const released = state.releaseClaims(input.agentId, input.files);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ status: 'ok', released, files: input.files ?? 'all' }, null, 2)
            }
          ]
        };
      }

      case 'hall_claims_list': {
        const claims = state.listActiveClaims();
        return {
          content: [{ type: 'text', text: JSON.stringify(claims, null, 2) }]
        };
      }

      case 'hall_evidence_attach': {
        const input = EvidenceAttachInput.parse(args);
        const evidence = state.attachEvidence(input);
        return {
          content: [{ type: 'text', text: JSON.stringify(evidence, null, 2) }]
        };
      }

      case 'hall_overlap_check': {
        const input = OverlapCheckInput.parse(args);
        const claims = state.listActiveClaims();
        const overlaps: { file: string; claimedBy: string; expiresAt: number }[] = [];
        for (const claim of claims) {
          for (const file of input.files) {
            if (claim.files.includes(file)) {
              overlaps.push({ file, claimedBy: claim.agentId, expiresAt: claim.expiresAt });
            }
          }
        }
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  hasOverlaps: overlaps.length > 0,
                  overlaps,
                  checkedFiles: input.files
                },
                null,
                2
              )
            }
          ]
        };
      }

      case 'hall_changelog_log': {
        const input = ChangelogLogInput.parse(args);
        const entry = state.logChange(input);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ status: 'logged', entry }, null, 2)
            }
          ]
        };
      }

      case 'hall_changelog_search': {
        const input = ChangelogSearchInput.parse(args ?? {});
        const entries = state.searchChangelog(input);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  count: entries.length,
                  entries,
                  filters: input
                },
                null,
                2
              )
            }
          ]
        };
      }

      default:
        return {
          content: [{ type: 'text', text: `Unknown tool: ${name}` }],
          isError: true
        };
    }
  } catch (err: any) {
    return {
      content: [{ type: 'text', text: `Error: ${err?.message ?? String(err)}` }],
      isError: true
    };
  }
});

// Resources: expose HALL contract and agent rules
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: [
      {
        uri: 'hall://contract',
        name: 'HALL Contract',
        description: 'The HALL agent rules - the law of the room',
        mimeType: 'text/markdown'
      },
      {
        uri: 'hall://status',
        name: 'HALL Status',
        description: 'Current HALL server status',
        mimeType: 'application/json'
      }
    ]
  };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;

  if (uri === 'hall://contract') {
    return {
      contents: [
        {
          uri,
          mimeType: 'text/markdown',
          text: `# HALL Contract

## The Law of the Room

### 1) Evidence is the currency
If you claim something works, you must attach receipts:
- Command(s) run
- Output (or pointer to logs)
- What you expected
- What actually happened

No receipts, no merge.

### 2) Intent before edits
Before touching code, post an intent with:
- Task ID
- Files likely to change
- Boundaries (what you promise not to change)
- Acceptance criteria
- Risks you can already see

### 3) Claims prevent collisions
You must claim a file before editing it.
- Claims expire (TTL)
- If a claim exists, you either wait, split the work, or negotiate

### 4) No silent failure
Forbidden patterns:
- bare \`except\`
- \`except Exception: pass\` without logging
- swallowing errors in background tasks
- returning success when failure occurred

### 5) Small changes win
If a change touches more than needed, split it.

## Workflow
1. \`hall_task_create\` - Create a task
2. \`hall_intent_post\` - Declare what you'll change
3. \`hall_claim\` - Lock the files
4. Make your changes
5. \`hall_evidence_attach\` - Prove it works
6. \`hall_claim_release\` - Release the files`
        }
      ]
    };
  }

  if (uri === 'hall://status') {
    return {
      contents: [
        {
          uri,
          mimeType: 'application/json',
          text: JSON.stringify(state.status(), null, 2)
        }
      ]
    };
  }

  throw new Error(`Unknown resource: ${uri}`);
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error('HALL MCP server error:', err);
  process.exit(1);
});
