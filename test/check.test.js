import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tempRepo, write, sh } from './helpers.js';
import { check, analyze } from '../src/check.js';
import { changedFiles } from '../src/git.js';

const CLI = fileURLToPath(new URL('../bin/intent-check.js', import.meta.url));

const INTENT = `# Intent: add greet
## Goal
Add greet().
## Acceptance checks
- [ ] \`node -e "process.exit(0)"\` passes
- [ ] greet says hi
## Scope
- src/**
## Allowed tests
- none
`;

test('clean change inside scope passes', () => {
  const root = tempRepo({ 'src/a.js': 'export const a = 1;\n', 'INTENT.md': INTENT });
  write(root, 'src/a.js', 'export const a = 2;\n');
  write(root, 'src/greet.js', 'export const greet = () => "hi";\n');
  const r = check({ cwd: root });
  assert.equal(r.ok, true, JSON.stringify(r.violations));
  assert.deepEqual(r.changedFiles.map((f) => `${f.status} ${f.path}`), ['M src/a.js', 'A src/greet.js']);
  assert.equal(r.checks[0].status, 'pass');
  assert.equal(r.checks[1].status, 'manual');
});

test('flags new and modified test files and out-of-scope changes', () => {
  const root = tempRepo({ 'src/a.js': 'x\n', 'test/old.test.js': 'old\n', 'INTENT.md': INTENT });
  write(root, 'src/a.test.js', 'new test\n');
  write(root, 'test/old.test.js', 'changed\n');
  write(root, 'docs/notes.md', 'notes\n');
  const r = check({ cwd: root, run: false });
  assert.equal(r.ok, false);
  const got = r.violations.map((v) => `${v.rule}:${v.path}`).sort();
  assert.deepEqual(got, [
    'no-unrequested-tests:src/a.test.js',
    'no-unrequested-tests:test/old.test.js',
    'out-of-scope:docs/notes.md',
    'out-of-scope:test/old.test.js',
  ]);
  assert.equal(r.checks[0].status, 'skipped');
});

test('allowed tests are not violations and count as in scope', () => {
  const intent = INTENT.replace('- none', '- `test/greet.test.js`');
  const root = tempRepo({ 'INTENT.md': intent });
  write(root, 'test/greet.test.js', 't\n');
  const r = check({ cwd: root, run: false });
  assert.equal(r.ok, true, JSON.stringify(r.violations));
  assert.deepEqual(r.testFiles, ['test/greet.test.js']);
});

test('deleted test files are not flagged; diff against an older base ref', () => {
  const root = tempRepo({ 'test/x.test.js': 'x\n', 'src/a.js': 'a\n', 'INTENT.md': INTENT });
  const base = sh(root, 'rev-parse', 'HEAD').trim();
  sh(root, 'rm', '-q', 'test/x.test.js');
  write(root, 'src/a.js', 'b\n');
  sh(root, 'commit', '-qam', 'change');
  const files = changedFiles(root, base);
  assert.deepEqual(files.map((f) => `${f.status} ${f.path}`), ['M src/a.js', 'D test/x.test.js']);
  const { violations } = analyze({ intent: { scope: null, allowedTests: [] }, files });
  assert.deepEqual(violations, []);
  assert.equal(check({ cwd: root, base, run: false }).changedFiles.length, 2);
});

test('failing command check is a violation', () => {
  const intent = INTENT.replace('process.exit(0)', 'process.exit(3)');
  const root = tempRepo({ 'INTENT.md': intent });
  const r = check({ cwd: root });
  assert.equal(r.checks[0].status, 'fail');
  assert.ok(r.violations.some((v) => v.rule === 'command-check-failed'));
});

test('CLI: --json output and exit codes', () => {
  const root = tempRepo({ 'INTENT.md': INTENT });
  const ok = execFileSync('node', [CLI, '--json'], { cwd: root, encoding: 'utf8' });
  assert.equal(JSON.parse(ok).ok, true);

  write(root, 'src/x.spec.ts', 's\n');
  const bad = spawnSync('node', [CLI, '--no-run'], { cwd: root, encoding: 'utf8' });
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /no-unrequested-tests/);
  assert.match(bad.stdout, /Result: FAIL/);

  const noIntent = tempRepo();
  const missing = spawnSync('node', [CLI], { cwd: noIntent, encoding: 'utf8' });
  assert.equal(missing.status, 2);
  assert.match(missing.stderr, /No INTENT.md/);
});
