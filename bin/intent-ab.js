#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { runAB, formatSummary, DEFAULT_AGENT } from '../src/ab.js';

const HELP = `Usage: intent-ab <tasks.json> [options]

Run each task twice in separate git worktrees:
  arm A  tests-allowed  the agent works normally and may write tests
  arm B  intent-first   the agent may not add or modify test files
Then run each task's verify command and record pass/fail, wall time and tokens.

Options:
  --agent <template>   Agent command. Placeholders: {prompt} {prompt_file} {arm} {task}
                       (default: ${DEFAULT_AGENT})
  --dry-run            Use a built-in fake agent (no Codex/Claude needed, numbers are fake)
  --repeats <n>        Run every task n times per arm (default: 1)
  --arms <list>        Comma-separated arms to run (default: A,B)
  --out <dir>          Output directory, relative to repo root (default: results)
  --timeout <seconds>  Per-command timeout (default: 1800)
  --keep-worktrees     Keep the worktrees for inspection
  --json               Print the result JSON instead of the Markdown summary
  -h, --help           Show help

Results: <out>/<timestamp>.json and <out>/<timestamp>.md
A few tasks give a directional signal, not a statistically significant result.`;

let parsed;
try {
  parsed = parseArgs({
    allowPositionals: true,
    options: {
      agent: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      repeats: { type: 'string', default: '1' },
      arms: { type: 'string', default: 'A,B' },
      out: { type: 'string', default: 'results' },
      timeout: { type: 'string', default: '1800' },
      'keep-worktrees': { type: 'boolean', default: false },
      json: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
} catch (e) {
  console.error(e.message + '\n\n' + HELP);
  process.exit(2);
}
const { values: o, positionals } = parsed;
if (o.help) { console.log(HELP); process.exit(0); }
if (positionals.length !== 1) { console.error(HELP); process.exit(2); }
const arms = o.arms.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
if (!arms.length || arms.some((a) => !['A', 'B'].includes(a))) { console.error('--arms must be A, B or A,B'); process.exit(2); }
const repeats = Number.parseInt(o.repeats, 10);
if (!(repeats >= 1)) { console.error('--repeats must be >= 1'); process.exit(2); }

try {
  const { result, jsonPath, mdPath } = runAB({
    tasksFile: positionals[0],
    agent: o.agent,
    dryRun: o['dry-run'],
    repeats,
    arms,
    outDir: o.out,
    keepWorktrees: o['keep-worktrees'],
    timeoutMs: Number(o.timeout) * 1000,
    log: (m) => process.stderr.write(m + '\n'),
  });
  console.log(o.json ? JSON.stringify(result, null, 2) : formatSummary(result));
  process.stderr.write(`\nWrote ${jsonPath}\nWrote ${mdPath}\n`);
} catch (e) {
  console.error(`intent-ab: ${e.message}`);
  process.exit(2);
}
