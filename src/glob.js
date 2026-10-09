// Minimal glob -> RegExp. Supports `**`, `*`, `?`. Paths use forward slashes.
export function globToRegExp(glob) {
  let g = glob.trim().replace(/^\.\//, '');
  if (g.endsWith('/')) g += '**';
  let re = '';
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === '*') {
      if (g[i + 1] === '*') {
        if (g[i + 2] === '/') { re += '(?:.*/)?'; i += 2; } else { re += '.*'; i += 1; }
      } else {
        re += '[^/]*';
      }
    } else if (c === '?') {
      re += '[^/]';
    } else {
      re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${re}$`);
}

export function matchesAny(path, globs) {
  return globs.some((g) => globToRegExp(g).test(path));
}

// Default patterns for "this file is a test". Override with --test-pattern.
export const DEFAULT_TEST_PATTERNS = [
  '**/*.test.*',
  '**/*.spec.*',
  '**/*_test.*',
  '**/test_*.py',
  '**/test/**',
  '**/tests/**',
  '**/__tests__/**',
  '**/spec/**',
];
