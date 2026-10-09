import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { git, changedFiles, repoRoot } from './git.js';
import { matchesAny, DEFAULT_TEST_PATTERNS } from './glob.js';
import { runCommand } from './check.js';

export const DEFAULT_AGENT = 'codex exec --json --sandbox workspace-write {prompt}';
const FAKE_AGENT = `node ${JSON.stringify(join(dirname(fileURLToPath(import.meta.url)), 'fake-agent.js'))}`;

export const ARMS = {
  A: {
    name: 'tests-allowed',
    description: 'Baseline: the agent works as it normally would and may write tests.',
    policy: '',
  },
  B: {
    name: 'intent-first',
    description: 'The agent may not add or modify test files; it reports against the acceptance checks instead.',
    policy: [
      'Constraints for this task:',
      '- Do NOT create or modify any test files (unit, integration or e2e). Do not write throwaway test scripts either.',
      '- You may run tests that already exist in the repository.',
      '- Implement the change, then finish with a short report: for each acceptance check, say whether it is met and what evidence you have.',
    ].join('\n'),
  },
};

export function shellQuote(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}

export function fillTemplate(template, vars) {
  return template.replace(/\{(prompt|prompt_file|arm|task)\}/g, (_, k) => (k === 'prompt' ? shellQuote(vars.prompt) : shellQuote(vars[k])));
}

export function buildPrompt(task, armKey, intentText) {
  const parts = [task.prompt.trim()];
  if (intentText) parts.push(`Intent (written by the human):\n\n${intentText.trim()}`);
  if (task.acceptance?.length) parts.push(`Acceptance checks:\n${task.acceptance.map((a) => `- ${a}`).join('\n')}`);
  if (ARMS[armKey].policy) parts.push(ARMS[armKey].policy);
  return parts.join('\n\n');
}

// Sum token usage from agent stdout. Understands Codex `exec --json` JSONL
// (`turn.completed` events) and Claude Code `-p --output-format json|stream-json`
// (`result` objects). Returns null when nothing parseable was found.
export function parseTokens(stdout) {
  let found = false;
  const t = { input: 0, cachedInput: 0, output: 0 };
  for (const line of String(stdout).split('\n')) {
    const s = line.trim();
    if (!s.startsWith('{')) continue;
    let obj;
    try { obj = JSON.parse(s); } catch { continue; }
    const u = obj?.usage;
    if (!u || typeof u !== 'object') continue;
    if (obj.type === 'turn.completed') {
      found = true;
      t.input += u.input_tokens || 0;
      t.cachedInput += u.cached_input_tokens || 0;
      t.output += u.output_tokens || 0;
    } else if (obj.type === 'result') {
      found = true;
      t.input += (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
      t.cachedInput += u.cache_read_input_tokens || 0;
      t.output += u.output_tokens || 0;
    }
  }
  return found ? { ...t, total: t.input + t.output } : null;
}

export function loadTasks(file) {
  const abs = resolve(file);
  const spec = JSON.parse(readFileSync(abs, 'utf8'));
  const list = Array.isArray(spec) ? spec : spec.tasks;
  if (!Array.isArray(list) || !list.length) throw new Error(`${file}: expected a non-empty "tasks" array`);
  const ids = new Set();
  for (const [i, t] of list.entries()) {
    if (!t.id) t.id = `task-${i + 1}`;
    if (ids.has(t.id)) throw new Error(`${file}: duplicate task id "${t.id}"`);
    ids.add(t.id);
    if (!t.prompt) throw new Error(`${file}: task "${t.id}" has no "prompt"`);
    if (!t.verify) throw new Error(`${file}: task "${t.id}" has no "verify" command`);
  }
  return { file: abs, dir: dirname(abs), spec: Array.isArray(spec) ? {} : spec, tasks: list };
}

function withTaskDir(cmd, dir) {
  return cmd.replace(/\{taskdir\}/g, shellQuote(dir));
}

function median(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function runAB({
  tasksFile,
  cwd = process.cwd(),
  agent,
  dryRun = false,
  repeats = 1,
  arms = ['A', 'B'],
  outDir = 'results',
  keepWorktrees = false,
  timeoutMs = 30 * 60 * 1000,
  testPatterns = DEFAULT_TEST_PATTERNS,
  log = () => {},
  now = new Date(),
}) {
  const root = repoRoot(cwd);
  const { file, dir, spec, tasks } = loadTasks(tasksFile);
  const base = git(root, ['rev-parse', spec.base || 'HEAD']).trim();
  const agentTemplate = dryRun ? FAKE_AGENT : agent || spec.agent || DEFAULT_AGENT;
  const scratch = mkdtempSync(join(tmpdir(), 'intent-ab-'));
  const runs = [];

  let order = 0;
  for (let r = 1; r <= repeats; r++) {
    for (const task of tasks) {
      // Alternate arm order between consecutive runs to reduce ordering effects.
      const armOrder = order++ % 2 === 0 ? arms : [...arms].reverse();
      const intentText = task.intent ? readFileSync(resolve(dir, task.intent), 'utf8') : null;
      for (const armKey of armOrder) {
        const wt = join(scratch, `${task.id}-${armKey}-r${r}`);
        git(root, ['worktree', 'add', '--detach', '--quiet', wt, base]);
        const run = { task: task.id, arm: armKey, armName: ARMS[armKey].name, repeat: r };
        try {
          const setup = task.setup ?? spec.setup;
          if (setup) {
            const s = runCommand(withTaskDir(setup, dir), wt, timeoutMs);
            run.setup = { exitCode: s.exitCode, durationMs: s.durationMs };
            if (s.exitCode !== 0) throw new Error(`setup failed (exit ${s.exitCode}): ${s.tail}`);
          }
          const prompt = buildPrompt(task, armKey, intentText);
          const promptFile = join(scratch, `${task.id}-${armKey}-r${r}.prompt.md`);
          writeFileSync(promptFile, prompt);
          const cmd = fillTemplate(agentTemplate, { prompt, prompt_file: promptFile, arm: armKey, task: task.id });
          log(`[${task.id}] arm ${armKey} (${ARMS[armKey].name}) run ${r}: agent...`);
          const started = Date.now();
          const a = runAgent(cmd, wt, timeoutMs, { INTENT_AB_ARM: armKey, INTENT_AB_TASK: task.id, INTENT_AB_PROMPT_FILE: promptFile });
          run.wallMs = Date.now() - started;
          run.agentExitCode = a.exitCode;
          run.agentTimedOut = a.timedOut;
          run.tokens = parseTokens(a.stdout);
          const files = changedFiles(wt, base);
          run.changedFiles = files.map((f) => `${f.status} ${f.path}`);
          run.testFilesTouched = files.filter((f) => f.status !== 'D' && matchesAny(f.path, testPatterns)).map((f) => f.path);
          log(`[${task.id}] arm ${armKey}: verify...`);
          const v = runCommand(withTaskDir(task.verify, dir), wt, timeoutMs);
          run.verify = { pass: v.exitCode === 0, exitCode: v.exitCode, durationMs: v.durationMs, tail: v.tail };
        } catch (e) {
          run.error = e.message;
          run.verify = run.verify || { pass: false, exitCode: null };
        } finally {
          if (!keepWorktrees) {
            try { git(root, ['worktree', 'remove', '--force', wt]); } catch { /* ignore */ }
          } else {
            run.worktree = wt;
          }
        }
        log(`[${task.id}] arm ${armKey}: ${run.verify.pass ? 'PASS' : 'FAIL'}`);
        runs.push(run);
      }
    }
  }
  if (!keepWorktrees) {
    try { git(root, ['worktree', 'prune']); } catch { /* ignore */ }
    rmSync(scratch, { recursive: true, force: true });
  }

  const result = {
    tool: 'intent-ab',
    version: 1,
    dryRun,
    createdAt: now.toISOString(),
    repo: root,
    base,
    tasksFile: file,
    agent: dryRun ? 'fake-agent (dry run)' : agentTemplate,
    repeats,
    arms: Object.fromEntries(arms.map((k) => [k, ARMS[k]])),
    runs,
    summary: summarize(runs, arms),
    caveat: CAVEAT,
  };
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  const outAbs = resolve(root, outDir);
  mkdirSync(outAbs, { recursive: true });
  const jsonPath = join(outAbs, `${stamp}.json`);
  const mdPath = join(outAbs, `${stamp}.md`);
  writeFileSync(jsonPath, JSON.stringify(result, null, 2) + '\n');
  writeFileSync(mdPath, formatSummary(result));
  return { result, jsonPath, mdPath };
}

function runAgent(cmd, cwd, timeoutMs, env) {
  // spawnSync via runCommand only keeps the tail; we need full stdout for token parsing.
  return runCommandFull(cmd, cwd, timeoutMs, env);
}

function runCommandFull(command, cwd, timeoutMs, env) {
  const r = spawnSync(command, {
    cwd, shell: true, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 256 * 1024 * 1024,
    env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  return { exitCode: r.status, timedOut: r.error?.code === 'ETIMEDOUT', stdout: r.stdout || '', stderr: r.stderr || '' };
}

export const CAVEAT =
  'Directional signal only. A handful of tasks (e.g. 3-5) cannot show a statistically significant difference; ' +
  'agent runs are noisy, so repeat runs and more tasks before drawing conclusions. Token counts are only as good as the agent\'s own usage events.';

export function summarize(runs, arms) {
  const perArm = {};
  for (const k of arms) {
    const rs = runs.filter((r) => r.arm === k);
    const known = rs.filter((r) => r.tokens);
    const walls = rs.filter((r) => typeof r.wallMs === 'number').map((r) => r.wallMs);
    perArm[k] = {
      name: ARMS[k].name,
      runs: rs.length,
      verifyPassed: rs.filter((r) => r.verify?.pass).length,
      medianWallMs: median(walls),
      totalWallMs: walls.reduce((a, b) => a + b, 0),
      tokensKnownRuns: known.length,
      medianTokens: median(known.map((r) => r.tokens.total)),
      totalTokens: known.length ? known.reduce((a, r) => a + r.tokens.total, 0) : null,
      runsTouchingTests: rs.filter((r) => r.testFilesTouched?.length).length,
      testFilesTouched: rs.reduce((a, r) => a + (r.testFilesTouched?.length || 0), 0),
      errors: rs.filter((r) => r.error).length,
    };
  }
  // Paired outcomes per (task, repeat) when both A and B ran.
  const pairs = { bothPass: 0, bothFail: 0, onlyA: 0, onlyB: 0 };
  if (arms.includes('A') && arms.includes('B')) {
    const keys = new Set(runs.map((r) => `${r.task}\u0000${r.repeat}`));
    for (const key of keys) {
      const [task, rep] = key.split('\u0000');
      const a = runs.find((r) => r.task === task && String(r.repeat) === rep && r.arm === 'A');
      const b = runs.find((r) => r.task === task && String(r.repeat) === rep && r.arm === 'B');
      if (!a || !b) continue;
      const pa = !!a.verify?.pass;
      const pb = !!b.verify?.pass;
      if (pa && pb) pairs.bothPass++;
      else if (!pa && !pb) pairs.bothFail++;
      else if (pa) pairs.onlyA++;
      else pairs.onlyB++;
    }
  }
  return { perArm, pairs };
}

const fmtS = (ms) => (ms == null ? 'n/a' : `${(ms / 1000).toFixed(1)}s`);
const fmtT = (n) => (n == null ? 'unknown' : n.toLocaleString('en-US'));

export function formatSummary(result) {
  const { perArm, pairs } = result.summary;
  const L = [];
  L.push(`# intent-ab results: ${result.createdAt}`);
  L.push('');
  if (result.dryRun) {
    L.push('> **DRY RUN.** A fake agent produced these numbers. They only show that the harness works and say nothing about real agents.');
    L.push('');
  }
  L.push(`- Repo: \`${result.repo}\` @ \`${result.base.slice(0, 12)}\``);
  L.push(`- Tasks file: \`${result.tasksFile}\``);
  L.push(`- Agent: \`${result.agent}\``);
  L.push(`- Repeats: ${result.repeats}`);
  L.push('');
  L.push('## Per arm');
  L.push('');
  L.push('| Arm | Runs | Verify passed | Median wall time | Median tokens | Total tokens (known runs) | Runs that touched tests | Errors |');
  L.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const [k, a] of Object.entries(perArm)) {
    L.push(`| ${k} \`${a.name}\` | ${a.runs} | ${a.verifyPassed}/${a.runs} | ${fmtS(a.medianWallMs)} | ${fmtT(a.medianTokens)} | ${fmtT(a.totalTokens)} (${a.tokensKnownRuns}/${a.runs}) | ${a.runsTouchingTests} | ${a.errors} |`);
  }
  L.push('');
  if (perArm.A && perArm.B) {
    L.push('## Paired outcomes (same task, same repeat)');
    L.push('');
    L.push(`- Both passed: ${pairs.bothPass}`);
    L.push(`- Both failed: ${pairs.bothFail}`);
    L.push(`- Only A (tests-allowed) passed: ${pairs.onlyA}`);
    L.push(`- Only B (intent-first) passed: ${pairs.onlyB}`);
    L.push('');
  }
  L.push('## Runs');
  L.push('');
  L.push('| Task | Arm | Repeat | Verify | Wall time | Tokens | Test files touched | Note |');
  L.push('| --- | --- | ---: | --- | ---: | ---: | ---: | --- |');
  for (const r of result.runs) {
    const note = r.error ? `error: ${r.error.split('\n')[0].slice(0, 80)}` : r.agentTimedOut ? 'agent timed out' : r.agentExitCode ? `agent exit ${r.agentExitCode}` : '';
    L.push(`| ${r.task} | ${r.arm} | ${r.repeat} | ${r.verify?.pass ? 'pass' : 'fail'} | ${fmtS(r.wallMs)} | ${fmtT(r.tokens?.total)} | ${r.testFilesTouched?.length ?? 0} | ${note} |`);
  }
  L.push('');
  L.push(`> ${result.caveat}`);
  L.push('');
  return L.join('\n');
}
