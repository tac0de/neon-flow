import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadDomainSkills, resolveDomainSkills } from './domain-skills.mjs';
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
const targetPaths = z.array(z.string().min(1).max(300)).max(50).optional();
const server = new McpServer({ name: 'neon-flow', version: '0.3.0' });
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

function readSkillRegistry() {
  const registryRevision = binding.git(['rev-parse', 'HEAD']).trim();
  return { registryRevision, skills: loadDomainSkills(binding.git, registryRevision) };
}

server.registerTool('list_domain_skills', {
  description: 'List neon-flow domain skill IDs, versions, and applicability rules at the checked-out revision.',
  inputSchema: z.strictObject({}),
  annotations: { readOnlyHint: true, openWorldHint: false },
}, () => {
  const { registryRevision, skills } = readSkillRegistry();
  return reply({ registryRevision, skills: skills.map(({ id, version, title, appliesTo }) => ({ id, version, title, appliesTo })) });
});

server.registerTool('resolve_domain_skills', {
  description: 'Preview neon-flow domain skill instructions and I/O contracts for target repository-relative paths, or query terms if the paths are unknown.',
  inputSchema: z.strictObject({ paths: targetPaths, query: queryText }),
  annotations: { readOnlyHint: true, openWorldHint: false },
}, selection => {
  const { registryRevision, skills } = readSkillRegistry();
  return reply({ registryRevision, domainSkills: resolveDomainSkills(skills, selection) });
});

server.registerTool('prepare_work', {
  description: 'Start DTP before edits and return applicable domain skills, versions, and contracts. Pass target repository-relative paths when known, a query otherwise, and CODEX_THREAD_ID from the current Codex command shell as threadId.',
  inputSchema: z.strictObject({ contractVersion: z.literal(1), query: queryText, paths: targetPaths, threadId: uuid }),
  annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: false },
}, ({ query, paths, threadId }) => {
  return reply(prepareProjectWork({ id: project, state, binding, query, paths, threadId }));
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
