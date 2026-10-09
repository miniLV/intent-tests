import { execFileSync } from 'node:child_process';

export function git(cwd, args, opts = {}) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts });
}

export function repoRoot(cwd) {
  return git(cwd, ['rev-parse', '--show-toplevel']).trim();
}

// Files changed between `base` and the working tree, plus untracked files.
// Returns [{ status: 'A'|'M'|'D'|'R', path }].
export function changedFiles(cwd, base = 'HEAD') {
  const out = git(cwd, ['diff', '--name-status', '-z', '--find-renames', base, '--']);
  const parts = out.split('\0').filter((p) => p.length);
  const files = [];
  for (let i = 0; i < parts.length; ) {
    const status = parts[i++];
    if (status.startsWith('R') || status.startsWith('C')) {
      i++; // old path
      files.push({ status: 'R', path: parts[i++] });
    } else {
      files.push({ status: status[0], path: parts[i++] });
    }
  }
  const untracked = git(cwd, ['ls-files', '--others', '--exclude-standard', '-z'])
    .split('\0').filter(Boolean);
  for (const p of untracked) if (!files.some((f) => f.path === p)) files.push({ status: 'A', path: p });
  return files.sort((a, b) => a.path.localeCompare(b.path));
}
