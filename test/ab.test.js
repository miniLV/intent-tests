import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tempRepo, sh } from './helpers.js';
import { runAB, parseTokens, fillTemplate, buildPrompt, loadTasks } from '../src/ab.js';

const CLI = fileURLToPath(new URL('../bin/intent-ab.js', import.meta.url));

function tasksFile(tasks) {
  const dir = mkdtempSync(join(tmpdir(), 'intent-ab-tasks-'));
  const file = join(dir, 'tasks.json');
  writeFileSync(file, JSON.stringify({ tasks }));
  return file;
}

const exists = (p) => `node -e "process.exit(require('fs').existsSync('${p}') ? 0 : 1)"`;

test('dry run: both arms run in worktrees, results are written', () => {
  const root = tempRepo();
  const file = tasksFile([
    { id: 't1', prompt: 'do t1', verify: exists('fake-agent/t1.txt') },
    { id: 't2', prompt: 'do t2', verify: exists('fake-agent/never.txt') },
  ]);
  const { result, jsonPath, mdPath } = runAB({ tasksFile: file, cwd: root, dryRun: true, now: new Date('2026-10-09T12:00:00Z') });
  assert.equal(result.dryRun, true);
  assert.equal(result.runs.length, 4);
  // Arm order alternates per task.
  assert.deepEqual(result.runs.map((r) => `${r.task}${r.arm}`), ['t1A', 't1B', 't2B', 't2A']);
  const a = result.summary.perArm.A;
  const b = result.summary.perArm.B;
  assert.equal(a.verifyPassed, 1);
  assert.equal(b.verifyPassed, 1);
  assert.equal(a.runsTouchingTests, 2);
  assert.equal(b.runsTouchingTests, 0);
  assert.equal(a.medianTokens, 1500);
  assert.equal(b.medianTokens, 1100);
  assert.equal(a.tokensKnownRuns, 2);
  assert.deepEqual(result.summary.pairs, { bothPass: 1, bothFail: 1, onlyA: 0, onlyB: 0 });
  assert.ok(existsSync(jsonPath));
  assert.ok(jsonPath.endsWith('2026-10-09T12-00-00-000Z.json'));
  const md = readFileSync(mdPath, 'utf8');
  assert.match(md, /DRY RUN/);
  assert.match(md, /not.*statistically significant|cannot show a statistically significant/);
  // Worktrees cleaned up, main tree untouched.
  assert.equal(sh(root, 'worktree', 'list').trim().split('\n').length, 1);
  assert.ok(!existsSync(join(root, 'fake-agent')));
});

test('custom agent template, unknown tokens, agent failure, {taskdir} in verify', () => {
  const root = tempRepo();
  const file = tasksFile([{ id: 'x', prompt: "it's quoted", verify: 'node {taskdir}/check.mjs' }]);
  writeFileSync(join(file, '..', 'check.mjs'), "import fs from 'node:fs'; process.exit(fs.existsSync('out.txt') ? 0 : 1);\n");
  const agent = 'node -e "require(\'fs\').writeFileSync(\'out.txt\', process.argv[1])" {prompt}';
  const { result } = runAB({ tasksFile: file, cwd: root, agent, arms: ['B'], outDir: 'r' });
  assert.equal(result.runs.length, 1);
  const run = result.runs[0];
  assert.equal(run.verify.pass, true, JSON.stringify(run));
  assert.equal(run.tokens, null);
  assert.equal(result.summary.perArm.B.totalTokens, null);
  assert.ok(existsSync(join(root, 'r')));

  const failing = runAB({ tasksFile: file, cwd: root, agent: 'exit 7', arms: ['A'], outDir: 'r' }).result.runs[0];
  assert.equal(failing.agentExitCode, 7);
  assert.equal(failing.verify.pass, false);
});

test('parseTokens: codex JSONL, claude result, garbage', () => {
  const codex = [
    '{"type":"thread.started"}',
    '{"type":"turn.completed","usage":{"input_tokens":100,"cached_input_tokens":40,"output_tokens":10}}',
    'not json',
    '{"type":"turn.completed","usage":{"input_tokens":50,"output_tokens":5}}',
  ].join('\n');
  assert.deepEqual(parseTokens(codex), { input: 150, cachedInput: 40, output: 15, total: 165 });
  const claude = JSON.stringify({ type: 'result', usage: { input_tokens: 10, cache_read_input_tokens: 90, cache_creation_input_tokens: 5, output_tokens: 20 } });
  assert.deepEqual(parseTokens(claude), { input: 105, cachedInput: 90, output: 20, total: 125 });
  assert.equal(parseTokens('hello\n{"usage":{"input_tokens":1}}'), null);
});

test('prompt building and template quoting', () => {
  const t = { prompt: 'Fix bug', acceptance: ['works'] };
  assert.doesNotMatch(buildPrompt(t, 'A'), /Do NOT create/);
  assert.match(buildPrompt(t, 'B', '## Goal\ng'), /Do NOT create or modify any test files[\s\S]*/);
  assert.match(buildPrompt(t, 'B', '## Goal\ng'), /Intent \(written by the human\)/);
  assert.equal(fillTemplate('run {prompt} --arm {arm}', { prompt: "a'b", arm: 'B' }), "run 'a'\\''b' --arm 'B'");
});

test('loadTasks validation', () => {
  assert.throws(() => loadTasks(tasksFile([])), /non-empty/);
  assert.throws(() => loadTasks(tasksFile([{ id: 'a', prompt: 'p' }])), /verify/);
  assert.throws(() => loadTasks(tasksFile([{ id: 'a', prompt: 'p', verify: 'v' }, { id: 'a', prompt: 'p', verify: 'v' }])), /duplicate/);
});

test('CLI dry run on the bundled example', () => {
  const root = tempRepo();
  const example = fileURLToPath(new URL('../examples/dry-run/tasks.json', import.meta.url));
  const r = spawnSync('node', [CLI, example, '--dry-run'], { cwd: root, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /\| A `tests-allowed` \| 2 \| 2\/2/);
  assert.match(r.stdout, /\| B `intent-first` \| 2 \| 2\/2/);
  assert.match(r.stderr, /Wrote .*results/);
});

test('task file with a pinned "repo" is cloned and used as the target', () => {
  const upstream = tempRepo({ 'index.js': 'module.exports = 1;\n' });
  const pinned = sh(upstream, 'rev-parse', 'HEAD').trim();
  writeFileSync(join(upstream, 'index.js'), 'module.exports = 2;\n');
  sh(upstream, 'commit', '-qam', 'later');
  const dir = mkdtempSync(join(tmpdir(), 'intent-ab-repo-'));
  const file = join(dir, 'tasks.json');
  writeFileSync(file, JSON.stringify({
    repo: { url: upstream, commit: pinned },
    tasks: [{ id: 'bump', prompt: 'p', verify: `node -e "process.exit(require('./index.js') === 3 ? 0 : 1)"` }],
  }));
  const cwd = mkdtempSync(join(tmpdir(), 'intent-ab-cwd-'));
  const agent = `node -e "require('fs').writeFileSync('index.js', 'module.exports = ' + (require('./index.js') + 2) + ';')"`;
  const { result, jsonPath } = runAB({ tasksFile: file, cwd, agent, arms: ['A'] });
  assert.equal(result.base, pinned);
  assert.equal(result.runs[0].verify.pass, true, JSON.stringify(result.runs[0]));
  assert.ok(jsonPath.startsWith(join(cwd, 'results')));
});

test('bundled vercel/ms example is well-formed', () => {
  const t = loadTasks(fileURLToPath(new URL('../examples/tasks/tasks.json', import.meta.url)));
  assert.equal(t.spec.repo.url, 'https://github.com/vercel/ms.git');
  assert.match(t.spec.repo.commit, /^[0-9a-f]{40}$/);
  assert.deepEqual(t.tasks.map((x) => x.id), ['month-unit', 'compound-durations', 'strict-option']);
  for (const task of t.tasks) {
    assert.ok(existsSync(join(t.dir, task.intent)), task.intent);
    const script = task.verify.match(/\{taskdir\}\/(\S+)/)[1];
    assert.ok(existsSync(join(t.dir, script)), script);
  }
});
