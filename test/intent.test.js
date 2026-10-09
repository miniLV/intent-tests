import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseIntent, validateIntent } from '../src/intent.js';
import { globToRegExp, matchesAny } from '../src/glob.js';

test('parses the example INTENT.md', () => {
  const md = readFileSync(new URL('../examples/INTENT.md', import.meta.url), 'utf8');
  const i = parseIntent(md);
  assert.equal(i.title, 'Intent: slugify() handles accents and repeated separators');
  assert.match(i.goal, /URL slug/);
  assert.equal(i.acceptance.length, 4);
  assert.equal(i.acceptance[0].command, 'npm test');
  assert.equal(i.acceptance[0].checked, false);
  assert.ok(i.acceptance[1].command.startsWith('node -e'));
  assert.equal(i.acceptance[2].command, null);
  assert.deepEqual(i.scope, ['src/slugify.js', 'CHANGELOG.md']);
  assert.equal(i.outOfScope.length, 2);
  assert.deepEqual(i.allowedTests, []);
  assert.match(i.examples, /creme-brulee/);
  assert.deepEqual(validateIntent(i), []);
});

test('missing scope means no scope check; allowed tests are globs', () => {
  const i = parseIntent(`# x\n## Goal\ng\n## Acceptance\n- [x] \`make check\` passes\n## Allowed tests\n- \`tests/test_parser.py\`\n- tests/fixtures/**\n`);
  assert.equal(i.scope, null);
  assert.equal(i.acceptance[0].checked, true);
  assert.equal(i.acceptance[0].command, 'make check');
  assert.deepEqual(i.allowedTests, ['tests/test_parser.py', 'tests/fixtures/**']);
});

test('headings inside code fences are ignored; unknown sections are skipped', () => {
  const i = parseIntent('## Goal\nreal goal\n```md\n## Scope\n- nope\n```\n## Notes\n- ignored\n## Acceptance checks\n- works\n');
  assert.equal(i.scope, null);
  assert.equal(i.acceptance.length, 1);
  assert.equal(i.acceptance[0].text, 'works');
});

test('validateIntent reports missing goal and checks', () => {
  assert.equal(validateIntent(parseIntent('# empty\n')).length, 2);
});

test('glob matching', () => {
  assert.ok(globToRegExp('**/*.test.*').test('a/b/c.test.js'));
  assert.ok(globToRegExp('**/*.test.*').test('c.test.ts'));
  assert.ok(globToRegExp('src/**').test('src/a/b.js'));
  assert.ok(globToRegExp('src/').test('src/a.js'));
  assert.ok(!globToRegExp('src/*.js').test('src/a/b.js'));
  assert.ok(globToRegExp('**/tests/**').test('tests/x.py'));
  assert.ok(matchesAny('pkg/foo_test.go', ['**/*_test.*']));
  assert.ok(!matchesAny('src/index.js', ['**/*.test.*', '**/tests/**']));
});
