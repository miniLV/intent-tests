#!/usr/bin/env node
// Deterministic stand-in for a coding agent, used by `intent-ab --dry-run` and the tests.
// Arm A writes an implementation file plus a test file; arm B writes only the implementation.
// Emits Codex-style JSONL usage events with made-up token counts.
import { writeFileSync, mkdirSync } from 'node:fs';

const arm = process.env.INTENT_AB_ARM || 'A';
const task = process.env.INTENT_AB_TASK || 'task';
mkdirSync('fake-agent', { recursive: true });
writeFileSync(`fake-agent/${task}.txt`, `implemented ${task} (arm ${arm})\n`);
if (arm === 'A') writeFileSync(`fake-agent/${task}.test.js`, `// test written by the fake agent\n`);

const usage = arm === 'A'
  ? { input_tokens: 1200, cached_input_tokens: 400, output_tokens: 300 }
  : { input_tokens: 900, cached_input_tokens: 400, output_tokens: 200 };
console.log(JSON.stringify({ type: 'thread.started', thread_id: 'fake' }));
console.log(JSON.stringify({ type: 'turn.started' }));
console.log(JSON.stringify({ type: 'turn.completed', usage }));
