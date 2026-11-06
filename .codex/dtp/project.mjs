import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { lstatSync, realpathSync } from 'node:fs';
import { availableParallelism, homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const core = pathToFileURL(join(homedir(), '.codex/tools/tracework-dtp/core') + '/');
const [
  { beginAgentWork, fingerprint, latestVerification, recordAgentPhase, validateAgentWork, verify },
  { currentFiles, impact, workingChanges, workingSnapshot },
  { registeredProjectRoot },
] = await Promise.all(
  ['kernel.mjs', 'project-context.mjs', 'paths.mjs'].map(path => import(new URL(path, core))),
);
const neonFlow = registeredProjectRoot('neon-flow');
const projectJobs = Math.min(3, availableParallelism());
const uuid = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const revisionId = /^[a-f0-9]{40}$/;
const policyPath = '.codex/dtp.json';

export class CheckRejected extends Error {}

function openProject(id, checkout = neonFlow) {
  if (id !== 'neon-flow') throw new Error('등록된 프로젝트는 neon-flow입니다.');
  const physical = realpathSync.native(checkout);
  const registered = realpathSync.native(neonFlow);
  const worktree = physical === registered ? realpathSync(neonFlow) : physical;
  const env = Object.fromEntries(['PATH', 'HOME', 'TMPDIR', 'LANG', 'LC_ALL'].flatMap(key =>
    process.env[key] === undefined ? [] : [[key, process.env[key]]]));
  const gitAt = (cwd, args) => execFileSync('/usr/bin/git', args, { cwd, env, encoding: 'utf8', timeout: 5000 });
  const git = args => gitAt(worktree, args);
  if (physical === registered) return { worktree, env, git };
  const common = cwd => realpathSync.native(resolve(cwd, gitAt(cwd, ['rev-parse', '--git-common-dir']).trim()));
  const linked = common(worktree) === common(neonFlow);
  let localReplica = false;
  if (!linked) {
    try {
      const origin = git(['config', '--local', '--get', 'remote.origin.url']).trim();
      if (origin.startsWith('/') && realpathSync.native(origin) === registered) {
        const base = gitAt(neonFlow, ['rev-parse', 'HEAD']).trim();
        git(['merge-base', '--is-ancestor', base, 'HEAD']);
        localReplica = true;
      }
    } catch {}
  }
  if (physical !== realpathSync.native(git(['rev-parse', '--show-toplevel']).trim()) ||
      (!localReplica && !linked)) {
    throw new Error('DTP MCP는 등록 프로젝트의 Git 작업 트리에서 실행해야 합니다.');
  }
  return { worktree, env, git };
}

function projectChecks(output, env, { git, revision }) {
  const bundlePath = '.codex/dtp/verify-bundle.mjs';
  const bundleCheck = git(['ls-tree', '--name-only', revision, '--', bundlePath]).trim()
    ? bundlePath : fileURLToPath(new URL('verify-bundle.mjs', import.meta.url));
  const checks = [
    {
      id: 'build', title: '프로덕션 빌드', phase: 'execution', env, timeoutMs: 60_000,
      args: ['node_modules/vite/bin/vite.js', 'build', '--outDir', output],
      command: 'vite build --outDir <DTP 실행 경로>',
    },
    {
      id: 'typecheck', title: 'TypeScript 타입 검사', phase: 'verification', env,
      args: ['node_modules/typescript/bin/tsc', '--noEmit'], command: 'tsc --noEmit',
    },
    {
      id: 'tests', title: 'Vitest 테스트', phase: 'verification', env, timeoutMs: 60_000,
      args: ['node_modules/vitest/vitest.mjs', 'run'], command: 'vitest run',
    },
    {
      id: 'bundle', title: '빌드 산출물 확인', phase: 'verification', env, requires: 'build',
      args: [bundleCheck, output], command: 'verify-bundle <DTP 실행 경로>',
    },
  ];
  if (!git(['ls-tree', '--name-only', revision, '--', policyPath]).trim()) return checks;
  const { contractVersion, requiredChecks } = JSON.parse(git(['show', `${revision}:${policyPath}`]));
  if (contractVersion !== 1 || !Array.isArray(requiredChecks) || !requiredChecks.length ||
      new Set(requiredChecks).size !== requiredChecks.length ||
      requiredChecks.some(id => !checks.some(check => check.id === id)) ||
      (requiredChecks.includes('bundle') && !requiredChecks.includes('build'))) {
    throw new Error('프로젝트 DTP 검사 정책이 올바르지 않습니다.');
  }
  return checks.filter(check => requiredChecks.includes(check.id));
}

export function getProjectBinding(id, checkout) {
  return openProject(id, checkout);
}

export function getProjectContext(id, { checkout, binding, state, query, workId, threadId } = {}) {
  const started = performance.now();
  const { worktree, git } = binding ?? openProject(id, checkout);
  const { changes, revision } = workingSnapshot(git);
  const files = currentFiles(git, worktree);
  const gitMs = performance.now() - started;
  const changedPaths = changes.flatMap(({ path, previousPath }) => previousPath ? [path, previousPath] : [path]);
  const checks = projectChecks(undefined, undefined, { git, revision })
    .map(({ id, title, phase, command }) => ({ id, title, phase, command }));
  const lastFailure = state && latestVerification(state, { project: id, worktree, failedOnly: true });
  const indexStarted = performance.now();
  const { indexTiming, ...sourceImpact } = impact(worktree, files, changedPaths, query);
  const timing = { ...indexTiming, gitMs: Math.round(gitMs), indexMs: Math.round(performance.now() - indexStarted),
    totalMs: Math.round(performance.now() - started) };
  const result = {
    project: id, worktree, jobs: projectJobs,
    revision,
    clean: changes.length === 0, changes,
    checks,
    completion: '깨끗한 대상 Git 판본에서 DTP 전체 검사 통과',
    impact: sourceImpact, timing,
    lastFailure: lastFailure ? {
      runId: lastFailure.runId, revision: lastFailure.context.revision, finishedAt: lastFailure.finishedAt,
      scope: lastFailure.context.scope ?? 'full',
      checks: lastFailure.checks.filter(check => check.status === 'failed')
        .map(({ id, command, exitCode }) => ({ id, command, exitCode })),
    } : null,
  };
  if (workId) recordAgentPhase(state, { workId, project: id, threadId, worktree, phase: 'context.ready', durationMs: timing.totalMs });
  return result;
}

export function runFeedback({ id, state, checkout, binding, threadId, workId }) {
  requireThread(threadId);
  const { worktree, git, env } = binding ?? openProject(id, checkout);
  if (workId) validateAgentWork(state, { workId, project: id, threadId, worktree });
  const root = pathToFileURL(worktree + '/');
  const revision = git(['rev-parse', 'HEAD']).trim();
  const files = () => {
    if (git(['rev-parse', 'HEAD']).trim() !== revision) throw new Error('수정 중 검사 대상 Git 판본이 바뀌었습니다.');
    return currentFiles(git, worktree);
  };
  const expectedSourceHash = fingerprint(root, files());
  const changes = workingChanges(git);
  if (!changes.length) throw new Error('수정 중 검사를 실행할 변경 파일이 없습니다.');
  if (changes.some(({ status }) => status.includes('U') || ['AA', 'DD'].includes(status))) {
    throw new Error('충돌이 해결된 작업 트리에서 수정 중 검사를 실행해 주세요.');
  }
  if (workId) recordAgentPhase(state, { workId, project: id, threadId, worktree, phase: 'edit.observed' });
  const paths = changes.flatMap(({ path, previousPath }) => previousPath ? [path, previousPath] : [path]);
  const { tests, selection } = impact(worktree, files(), paths);
  if (!tests.length) throw new Error('실행할 등록 테스트가 없습니다.');
  return verify({
    state, root, files, expectedSourceHash, title: '수정 중 테스트',
    context: { project: id, worktree, revision, threadId, workId, scope: 'feedback', tests, selection },
    checks: [{
      id: 'feedback-tests', title: '수정 중 테스트', phase: 'verification', env, timeoutMs: 60_000,
      args: ['node_modules/vitest/vitest.mjs', 'run', ...tests],
      command: ['vitest run', ...tests].join(' '),
    }],
  });
}

function requireThread(threadId) {
  if (!uuid.test(threadId ?? '')) throw new Error('활성 Codex 대화의 CODEX_THREAD_ID가 필요합니다.');
}

export function beginProjectWork({ id, state, threadId, checkout }) {
  requireThread(threadId);
  openProject(id, checkout);
  return beginAgentWork(state, { project: id, threadId });
}

export function prepareProjectWork({ id, state, threadId, checkout, binding, query }) {
  requireThread(threadId);
  const startedAt = new Date().toISOString();
  const context = getProjectContext(id, { checkout, binding, state, query });
  const { worktree, revision: baseRevision, completion, ...details } = context;
  const owner = { project: id, threadId, worktree };
  const { workId } = beginAgentWork(state, { ...owner, baseRevision, startedAt });
  recordAgentPhase(state, { ...owner, workId, phase: 'context.ready', durationMs: context.timing.totalMs });
  return {
    ...details, contractVersion: 1, workId, startedAt, worktree, baseRevision,
    completion: { requiresCleanWorktree: true, requiredChecks: details.checks.map(check => check.id) },
  };
}

export function runProject({ id, state, artifacts, threadId, sessionId, workId, serial, checkout, binding, expectedRevision }) {
  requireThread(threadId);
  const { worktree, env, git } = binding ?? openProject(id, checkout);
  if (expectedRevision !== undefined && (!revisionId.test(expectedRevision) || !workId)) {
    throw new CheckRejected('전체 검증에는 작업 ID와 40자리 Git 커밋이 필요합니다.');
  }
  if (workId) {
    const work = validateAgentWork(state, { workId, project: id, threadId, worktree, requireBound: expectedRevision !== undefined });
    if (work.worktree && expectedRevision === undefined) {
      throw new CheckRejected('prepare_work로 시작한 작업의 전체 검증에는 expectedRevision이 필요합니다.');
    }
  }
  const root = pathToFileURL(worktree + '/');
  const revision = git(['rev-parse', 'HEAD']).trim();
  if (expectedRevision !== undefined && revision !== expectedRevision) {
    throw new CheckRejected('요청한 Git 판본과 현재 HEAD가 다릅니다.');
  }
  const files = () => {
    if (git(['rev-parse', 'HEAD']).trim() !== revision ||
        git(['status', '--porcelain=v1', '--untracked-files=normal']).trim()) {
      throw new CheckRejected('작업 트리의 변경을 먼저 확인해 주세요. DTP가 깨끗한 판본만 빌드합니다.');
    }
    const names = git(['ls-files', '-z']).split('\0').filter(Boolean);
    if (names.some(name => !lstatSync(join(worktree, name)).isFile())) {
      throw new Error('일반 파일이 아닌 추적 입력이 있습니다.');
    }
    return names;
  };
  const runId = randomUUID();
  const output = join(artifacts, runId);
  return verify({
    state, root, files, runId, jobs: serial ? 1 : projectJobs, title: '프로덕션 빌드 및 검증',
    context: { project: id, worktree, revision, threadId, ...(workId ? { workId } : {}), ...(uuid.test(sessionId ?? '') ? { sessionId } : {}), artifact: output },
    checks: projectChecks(output, env, { git, revision }),
  });
}

export function fullCheckResponse(state, { project, worktree, workId, runId }) {
  const receipt = latestVerification(state, { project, worktree, runId, fullOnly: true });
  return {
    contractVersion: 1, workId, runId, scope: 'full', status: receipt.status,
    verifiedRevision: receipt.sourceUnchanged ? receipt.context.revision : null,
    sourceUnchanged: receipt.sourceUnchanged,
    checks: Object.fromEntries(receipt.checks.map(({ id, status }) => [id, status])),
  };
}
