import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseIntent, validateIntent } from '../src/intent.js';
import { globToRegExp, matchesAny } from '../src/glob.js';

test('parses the example intents', () => {
  const md = readFileSync(new URL('../examples/tasks/intents/month-unit.md', import.meta.url), 'utf8');
  const i = parseIntent(md);
  assert.equal(i.title, 'Intent: parse months');
  assert.match(i.goal, /2629800000/);
  assert.equal(i.acceptance.length, 4);
  assert.ok(i.acceptance[0].command.startsWith('node -e'));
  assert.equal(i.acceptance[0].checked, false);
  // Items that merely start with code are not commands.
  assert.equal(i.acceptance[1].command, null);
  assert.equal(i.acceptance[2].command, null);
  assert.deepEqual(i.scope, ['index.js', 'readme.md']);
  assert.equal(i.outOfScope.length, 2);
  assert.deepEqual(i.allowedTests, []);
  assert.match(i.examples, /5259600000/);
  assert.deepEqual(validateIntent(i), []);
  for (const name of ['compound-durations', 'strict-option']) {
    const other = parseIntent(readFileSync(new URL(`../examples/tasks/intents/${name}.md`, import.meta.url), 'utf8'));
    assert.deepEqual(validateIntent(other), [], name);
    assert.equal(other.acceptance.filter((a) => a.command).length, 1, name);
  }
});

test('command check detection', () => {
  const cmd = (line) => parseIntent(`## Acceptance checks\n- [ ] ${line}\n`).acceptance[0].command;
  assert.equal(cmd('`npm test` passes'), 'npm test');
  assert.equal(cmd('`make lint` exits 0'), 'make lint');
  assert.equal(cmd('`cargo test` succeeds.'), 'cargo test');
  assert.equal(cmd('`go vet ./...`'), 'go vet ./...');
  assert.equal(cmd('`m` still means minutes'), null);
  assert.equal(cmd('Returns `null` on empty input'), null);
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
