import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';

const env = {
  ...process.env,
  GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.com',
  GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.com',
};

export function sh(cwd, ...args) {
  return execFileSync('git', args, { cwd, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

export function write(root, rel, content) {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), content);
}

// Create a temp repo with an initial commit containing `files`.
export function tempRepo(files = { 'README.md': '# demo\n' }) {
  const root = mkdtempSync(join(tmpdir(), 'intent-tests-'));
  sh(root, 'init', '-q', '-b', main());
  for (const [rel, content] of Object.entries(files)) write(root, rel, content);
  sh(root, 'add', '-A');
  sh(root, 'commit', '-q', '-m', 'init');
  return root;
}

function main() { return 'main'; }
