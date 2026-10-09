// Held-out check. It lives next to the task file, outside the repo under test,
// so neither arm sees it or edits it. Run with cwd = the agent's worktree.
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const { slugify } = await import(pathToFileURL(resolve('src/slugify.js')).href);
const cases = [
  ['Hello, World', 'hello-world'],
  ['Crème  Brûlée!', 'creme-brulee'],
  ['--a--b--', 'a-b'],
];
let failed = 0;
for (const [input, want] of cases) {
  const got = slugify(input);
  if (got !== want) { failed++; console.error(`slugify(${JSON.stringify(input)}) = ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); }
}
process.exit(failed ? 1 : 0);
