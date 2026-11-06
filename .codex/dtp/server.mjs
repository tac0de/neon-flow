import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  beginProjectWork, CheckRejected, fullCheckResponse, getProjectBinding,
  getProjectContext, prepareProjectWork, runFeedback, runProject,
} from './project.mjs';

const dtp = pathToFileURL(join(homedir(), '.codex/tools/tracework-dtp') + '/');
const [
  { McpServer, StdioServerTransport, z },
  { compareAgentWork, compareVerification, latestVerification },
  { panelServer },
  { projectPaths },
] = await Promise.all(
  ['mcp-runtime.mjs', 'core/kernel.mjs', 'core/panel.mjs', 'core/paths.mjs']
    .map(path => import(new URL(path, dtp))),
);

const project = 'neon-flow';
const checkout = process.cwd();
const binding = getProjectBinding(project, checkout);
const { worktree } = binding;

const { state, artifacts } = projectPaths(project);
const uuid = z.string().uuid();
const queryText = z.string().max(300).optional();
const server = new McpServer({ name: 'neon-flow-dtp', version: '0.2.0' });
let running = false;
let panelUrl;

const reply = data => ({
  structuredContent: data,
  content: [{ type: 'text', text: JSON.stringify(data) }],
});
const failure = message => ({ isError: true, content: [{ type: 'text', text: message }] });

function openPanel() {
  panelUrl ??= new Promise((resolve, reject) => {
    const panel = panelServer(state, { project, worktree });
    panel.once('error', reject);
    panel.listen(0, '127.0.0.1', () => {
      panel.unref();
      resolve(`http://127.0.0.1:${panel.address().port}/`);
    });
  }).catch(error => {
    panelUrl = undefined;
    throw error;
  });
  return panelUrl;
}

server.registerTool('prepare_work', {
  description: 'Start a DTP v1 task before edits. Read CODEX_THREAD_ID from the current Codex command shell and pass it as threadId.',
  inputSchema: z.strictObject({ contractVersion: z.literal(1), query: queryText, threadId: uuid }),
  annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: false },
}, ({ query, threadId }) => {
  return reply(prepareProjectWork({ id: project, state, binding, query, threadId }));
});

server.registerTool('get_project_context', {
  description: 'Read current changes, source locations, related test candidates, completion criteria and the most recent recorded failure in this worktree. A query can include filenames or source symbols.',
  inputSchema: z.strictObject({ query: queryText, workId: uuid.optional(), threadId: uuid.optional() }),
  annotations: { openWorldHint: false },
}, ({ query, workId, threadId }) => {
  if (workId && !threadId) return failure('활성 CODEX_THREAD_ID를 threadId로 전달해 주세요.');
  return reply(getProjectContext(project, { binding, state, query, workId, threadId }));
});

server.registerTool('begin_agent_work', {
  description: 'Start measuring a user-requested project task before work begins. Pass the returned workId to run_check to measure time to verification.',
  inputSchema: z.strictObject({ threadId: uuid }),
  annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: false },
}, ({ threadId }) => {
  return reply(beginProjectWork({ id: project, state, checkout, threadId }));
});

server.registerTool('run_feedback', {
  description: 'Test the current changed working tree with related Vitest files, falling back to the complete test suite when impact cannot be resolved. Feedback is separate from full verification.',
  inputSchema: z.strictObject({ threadId: uuid, workId: uuid.optional() }),
  annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: false },
}, async ({ threadId, workId }) => {
  if (running) return failure('이 MCP 연결에서 DTP 검사가 이미 실행 중입니다.');
  running = true;
  try {
    const result = await runFeedback({ id: project, state, binding, threadId, workId });
    const receipt = latestVerification(state, { project, runId: result.runId });
    const { tests, selection } = receipt.context;
    return reply({ ...result, tests, selection, timing: receipt.timing });
  } finally {
    running = false;
  }
});

server.registerTool('run_check', {
  description: 'Run registered checks on a clean worktree. For v1 use contractVersion: 1, workId from prepare_work, and the full expectedRevision. Older clients can use the legacy request.',
  inputSchema: z.strictObject({
    threadId: uuid, sessionId: uuid.optional(), workId: uuid.optional(),
    contractVersion: z.literal(1).optional(), expectedRevision: z.string().regex(/^[a-f0-9]{40}$/).optional(),
  }),
  annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: false },
}, async ({ threadId, sessionId, workId, contractVersion, expectedRevision }) => {
  const v1 = contractVersion === 1 || expectedRevision !== undefined;
  if (v1 && (contractVersion !== 1 || !workId || !expectedRevision)) {
    return failure('v1 전체 검증에는 contractVersion, workId, expectedRevision이 필요합니다.');
  }
  if (running) return failure('이 MCP 연결에서 DTP 검사가 이미 실행 중입니다.');
  running = true;
  try {
    const result = await runProject({
      id: project, state, artifacts, checkout: worktree, threadId, sessionId, workId, expectedRevision,
    });
    return reply(v1 ? fullCheckResponse(state, { project, worktree, workId, runId: result.runId }) : result);
  } catch (error) {
    if (v1 && error instanceof CheckRejected) {
      return reply({ contractVersion: 1, workId, scope: 'full', status: 'rejected', reason: error.message });
    }
    return failure(error.message);
  } finally {
    running = false;
  }
});

server.registerTool('get_run_receipt', {
  description: 'Read a DTP run receipt for this project and return its local read-only Tracework panel URL. Omit runId for the latest run. Provide baselineRunId to compare passing runs with the same inputs and check plan.',
  inputSchema: z.strictObject({ runId: uuid.optional(), baselineRunId: uuid.optional() }),
  annotations: { readOnlyHint: true, openWorldHint: false },
}, async ({ runId, baselineRunId }) => {
  const receipt = latestVerification(state, { project, runId, worktree, fullOnly: !runId });
  if (!receipt) return reply({ receipt: null });
  const url = new URL(await openPanel());
  url.searchParams.set('run', receipt.runId);
  if (baselineRunId) url.searchParams.set('baseline', baselineRunId);
  const baseline = baselineRunId && latestVerification(state, { project, worktree, runId: baselineRunId });
  return reply({ receipt, panelUrl: url.href, ...(baselineRunId ? {
    comparison: compareVerification(baseline, receipt),
    workComparison: compareAgentWork(baseline, receipt),
  } : {}) });
});

await server.connect(new StdioServerTransport());
