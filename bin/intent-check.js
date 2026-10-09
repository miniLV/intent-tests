#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { check, formatReport } from '../src/check.js';

const HELP = `Usage: intent-check [options]

Compare the working tree against a base ref and INTENT.md.

Options:
  --base <ref>           Git ref to diff against (default: HEAD)
  --intent <path>        Intent file relative to repo root (default: INTENT.md)
  --no-run               Do not run command acceptance checks
  --test-pattern <glob>  Treat matching files as tests (repeatable; replaces defaults)
  --timeout <seconds>    Per-command timeout (default: 600)
  --json                 Print machine-readable JSON
  -h, --help             Show help

Exit codes: 0 ok, 1 violations, 2 usage/setup error.`;

let args;
try {
  args = parseArgs({
    options: {
      base: { type: 'string', default: 'HEAD' },
      intent: { type: 'string', default: 'INTENT.md' },
      'no-run': { type: 'boolean', default: false },
      'test-pattern': { type: 'string', multiple: true },
      timeout: { type: 'string', default: '600' },
      json: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  }).values;
} catch (e) {
  console.error(e.message + '\n\n' + HELP);
  process.exit(2);
}
if (args.help) { console.log(HELP); process.exit(0); }

try {
  const report = check({
    base: args.base,
    intentFile: args.intent,
    run: !args['no-run'],
    testPatterns: args['test-pattern'],
    timeoutMs: Number(args.timeout) * 1000,
  });
  console.log(args.json ? JSON.stringify(report, null, 2) : formatReport(report));
  process.exit(report.ok ? 0 : 1);
} catch (e) {
  if (args.json) console.log(JSON.stringify({ ok: false, error: e.message }));
  else console.error(`intent-check: ${e.message}`);
  process.exit(2);
}
