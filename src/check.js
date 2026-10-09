import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseIntent, validateIntent } from './intent.js';
import { changedFiles, repoRoot } from './git.js';
import { matchesAny, DEFAULT_TEST_PATTERNS } from './glob.js';

const ALWAYS_IN_SCOPE = ['INTENT.md'];

// Pure analysis: no side effects, no commands run.
export function analyze({ intent, files, testPatterns = DEFAULT_TEST_PATTERNS, intentPath = 'INTENT.md' }) {
  const violations = [];
  const testFiles = files.filter((f) => f.status !== 'D' && matchesAny(f.path, testPatterns));
  for (const f of testFiles) {
    if (!matchesAny(f.path, intent.allowedTests)) {
      violations.push({
        rule: 'no-unrequested-tests',
        path: f.path,
        message: `${f.status === 'A' ? 'New' : 'Modified'} test file not allowed by "## Allowed tests" in ${intentPath}`,
      });
    }
  }
  if (intent.scope) {
    for (const f of files) {
      if (f.path === intentPath || ALWAYS_IN_SCOPE.includes(f.path)) continue;
      if (matchesAny(f.path, intent.allowedTests)) continue;
      if (!matchesAny(f.path, intent.scope)) {
        violations.push({ rule: 'out-of-scope', path: f.path, message: 'Changed file is outside "## Scope"' });
      }
    }
  }
  return { violations, testFiles: testFiles.map((f) => f.path) };
}

export function runCommand(command, cwd, timeoutMs) {
  const started = Date.now();
  const r = spawnSync(command, { cwd, shell: true, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024 });
  const output = `${r.stdout || ''}${r.stderr || ''}`;
  return {
    exitCode: r.status,
    timedOut: r.error?.code === 'ETIMEDOUT',
    durationMs: Date.now() - started,
    tail: output.split('\n').slice(-20).join('\n').trim(),
  };
}

export function check({ cwd = process.cwd(), intentFile = 'INTENT.md', base = 'HEAD', run = true, testPatterns, timeoutMs = 10 * 60 * 1000 } = {}) {
  const root = repoRoot(cwd);
  const intentAbs = join(root, intentFile);
  if (!existsSync(intentAbs)) {
    const err = new Error(`No ${intentFile} found at ${root}. Write one first (see examples/tasks/intents/).`);
    err.code = 'NO_INTENT';
    throw err;
  }
  const intent = parseIntent(readFileSync(intentAbs, 'utf8'));
  const files = changedFiles(root, base);
  const { violations, testFiles } = analyze({ intent, files, testPatterns, intentPath: intentFile });
  for (const p of validateIntent(intent)) violations.push({ rule: 'intent-incomplete', path: intentFile, message: p });

  const checks = intent.acceptance.map((a) => {
    if (!a.command) return { ...a, status: 'manual' };
    if (!run) return { ...a, status: 'skipped' };
    const res = runCommand(a.command, root, timeoutMs);
    return { ...a, status: res.exitCode === 0 ? 'pass' : 'fail', result: res };
  });
  for (const c of checks) {
    if (c.status === 'fail') violations.push({ rule: 'command-check-failed', path: intentFile, message: `Acceptance check #${c.id} failed: ${c.command}` });
  }
  return {
    ok: violations.length === 0,
    base,
    root,
    intent: { title: intent.title, goal: intent.goal, scope: intent.scope, allowedTests: intent.allowedTests, outOfScope: intent.outOfScope },
    changedFiles: files,
    testFiles,
    checks,
    violations,
  };
}

const ICON = { pass: 'PASS', fail: 'FAIL', manual: 'TODO', skipped: 'SKIP' };

export function formatReport(r) {
  const out = [];
  out.push(`intent-check: ${r.intent.title || 'INTENT.md'}  (diff vs ${r.base})`);
  out.push('');
  out.push(`Changed files: ${r.changedFiles.length}`);
  for (const f of r.changedFiles) out.push(`  ${f.status} ${f.path}`);
  out.push('');
  out.push('Acceptance checks:');
  for (const c of r.checks) {
    out.push(`  [${ICON[c.status]}] #${c.id} ${c.text}`);
    if (c.status === 'fail' && c.result?.tail) out.push(c.result.tail.split('\n').map((l) => `         | ${l}`).join('\n'));
  }
  const manual = r.checks.filter((c) => c.status === 'manual').length;
  if (manual) out.push(`  (${manual} manual check(s): the agent should report evidence for each one)`);
  out.push('');
  if (r.violations.length) {
    out.push(`Violations: ${r.violations.length}`);
    for (const v of r.violations) out.push(`  - [${v.rule}] ${v.path}: ${v.message}`);
    out.push('');
    out.push('Result: FAIL');
  } else {
    out.push('Result: OK');
  }
  return out.join('\n');
}
