<h1 align="center">intent-tests</h1>

<p align="center">
  <strong>Stop coding agents from writing tests that just echo their own code.</strong>
</p>

<p align="center">
  You state intent, the agent implements, and a paired A/B on your own repo tells you whether self-written tests were worth the tokens.
</p>

<p align="center">
  <a href="./skills/intent-first/SKILL.md">Skill</a> ·
  <a href="./examples/tasks">Examples</a> ·
  <a href="./README.md">简体中文</a> · <strong>English</strong>
</p>

<p align="center">
  <code>npx -y -p github:miniLV/intent-tests intent-check --base main</code>
</p>

<p align="center">
  Codex · Claude Code · Node.js 20+ · zero dependencies · MIT
</p>

## Status

**Early prototype (v0.1).** The tools work and are tested, but there are no benchmark results yet. Nothing here claims time or token savings. Run the A/B on your own repo and decide from your own numbers.

## Quick start

```sh
git clone https://github.com/miniLV/intent-tests && cd intent-tests
npm test                                       # 20 tests, no network
node bin/intent-ab.js examples/tasks/tasks.json  # real A/B with Codex on vercel/ms (6 agent runs)
```

The last command clones [`vercel/ms`](https://github.com/vercel/ms) at a pinned commit and spends real Codex quota. To see the harness without an agent, run `node bin/intent-ab.js examples/dry-run/tasks.json --dry-run`.

## What it is

| Piece | What it does |
| --- | --- |
| `skills/intent-first` | Agent skill for Codex and Claude Code. The human writes `INTENT.md`; the agent implements without adding test files that weren't asked for, then reports PASS / FAIL / NOT VERIFIED against each acceptance check. |
| `intent-check` | CLI that reads `INTENT.md` and `git diff` against a base ref. Flags new or modified test files that `INTENT.md` doesn't allow and files changed outside `## Scope`, and runs command acceptance checks. Human report or `--json`; exit 1 on violations. Works in pre-commit or CI, no IDE hooks needed. |
| `intent-ab` | Paired A/B harness. Runs each task twice in separate git worktrees (arm **A** `tests-allowed`, arm **B** `intent-first`), then runs your held-out verify command. Records pass/fail, wall time, tokens (from Codex / Claude Code JSON output) and which test files each arm touched. |

## What it isn't

- Not a claim that tests are useless. Tests you ask for (`## Allowed tests`) and your existing suites stay in place.
- Not a test generator, and not a replacement for code review.
- Not a benchmark. A few tasks give a directional signal for *your* repo, not a statistically significant result.

## Example: three tasks on vercel/ms

[`examples/tasks/`](examples/tasks) targets [`vercel/ms`](https://github.com/vercel/ms) (MIT), the tiny millisecond-conversion library, pinned at tag `2.1.3` (`1c6264b795492e8fdecbc82cb8802fcfbfc08d26`). It is a single `index.js` with no runtime dependencies, so every verify script runs with plain Node and no network.

| Task | Feature | Held-out verify |
| --- | --- | --- |
| `month-unit` | Parse months: `ms('1mo') === 2629800000`, `m` stays minutes | [`verify/month-unit.cjs`](examples/tasks/verify/month-unit.cjs) |
| `compound-durations` | Parse `"1h 30m"`, `"1h30m"`, `"2 days 3 hours"`; any invalid part → `undefined` | [`verify/compound-durations.cjs`](examples/tasks/verify/compound-durations.cjs) |
| `strict-option` | `ms('soon', { strict: true })` throws an `Error` naming the input; default stays `undefined` | [`verify/strict-option.cjs`](examples/tasks/verify/strict-option.cjs) |

Each task has an [intent file](examples/tasks/intents) that both arms see. The verify scripts live outside the cloned repo, so neither arm can see or edit them. Every verify script also re-checks existing `ms@2.1.3` behaviour. All three fail on the pinned commit and pass with a correct implementation; that was checked against reference implementations before publishing.

## INTENT.md

```markdown
# Intent: parse months

## Goal
`ms()` should understand months when parsing strings. One month is one twelfth
of the library's year (`365.25 / 12` days, i.e. `2629800000` ms).

## Acceptance checks
- [ ] `node -e "process.exit(require('./index.js')('1mo') === 2629800000 ? 0 : 1)"` exits 0
- [ ] `mo`, `month` and `months` are accepted, case-insensitive, with or without a space
- [ ] `m` still means minutes (`ms('1m') === 60000`) and every existing unit parses as before

## Scope
- `index.js`
- `readme.md`

## Out of scope
- Formatting numbers as months

## Allowed tests
- none

## Examples
- `ms('2 months')` → `5259600000`
```

Rules the parser follows:

- `## Acceptance checks`: list items. `` `cmd` passes ``, `` `cmd` exits 0 ``, `` `cmd` succeeds `` or a bare `` `cmd` `` is a command check, and `intent-check` runs it (exit 0 = pass). Everything else is a manual check the agent must report evidence for.
- `## Scope` (optional): globs (`src/**`, `*.md`). If present, any changed file outside it is a violation. `INTENT.md` itself is always allowed.
- `## Allowed tests`: globs of test files the agent may add or modify, or `none` (the default).
- Test files are detected with `**/*.test.*`, `**/*.spec.*`, `**/*_test.*`, `**/test_*.py`, `**/test/**`, `**/tests/**`, `**/__tests__/**`, `**/spec/**`. Override with `--test-pattern`.

## Install the skill

**Codex:** copy the skill into the repo (or into `~/.agents/skills/` for all repos):

```sh
mkdir -p .agents/skills && cp -r /path/to/intent-tests/skills/intent-first .agents/skills/
```

Optionally paste [`examples/AGENTS.snippet.md`](examples/AGENTS.snippet.md) into your `AGENTS.md` so the rule applies even when the skill isn't triggered.

**Claude Code:** copy it into the project (or into `~/.claude/skills/`):

```sh
mkdir -p .claude/skills && cp -r /path/to/intent-tests/skills/intent-first .claude/skills/
```

## intent-check

```sh
# in your repo, after the agent finished
npx -y -p github:miniLV/intent-tests intent-check --base main
# or from a clone
node /path/to/intent-tests/bin/intent-check.js --base main --json
```

| Option | Default | |
| --- | --- | --- |
| `--base <ref>` | `HEAD` | Diff the working tree (plus untracked files) against this ref |
| `--intent <path>` | `INTENT.md` | Intent file, relative to repo root |
| `--no-run` | | Don't run command checks |
| `--test-pattern <glob>` | built-in list | Repeatable; replaces the defaults |
| `--json` | | Machine-readable output |

Exit codes: `0` ok, `1` violations or a failing command check, `2` setup error (e.g. no `INTENT.md`).

## intent-ab

Task file (JSON), as in [`examples/tasks/tasks.json`](examples/tasks/tasks.json):

```json
{
  "repo": { "url": "https://github.com/vercel/ms.git", "commit": "1c6264b795492e8fdecbc82cb8802fcfbfc08d26" },
  "tasks": [
    {
      "id": "month-unit",
      "prompt": "In this repo (the `ms` package, index.js), add a month unit to the string parser.",
      "intent": "intents/month-unit.md",
      "verify": "node {taskdir}/verify/month-unit.cjs"
    }
  ]
}
```

- `repo` (optional): clone this URL at this commit and run every arm from it. Without `repo`, the git repo you run `intent-ab` from is the target and `base` (default `HEAD`) is the starting point.
- `verify`: your held-out check. `{taskdir}` expands to the task file's directory, so verify scripts can live outside the target repo.
- `intent` (optional): an INTENT-style file whose text is added to the prompt of both arms.
- `setup` (optional, top level or per task): runs in each fresh worktree before the agent, e.g. `npm ci`; not timed.

```sh
intent-ab tasks.json                                   # Codex (default)
intent-ab tasks.json --agent 'claude -p {prompt} --output-format json --permission-mode acceptEdits'
intent-ab tasks.json --repeats 2 --keep-worktrees
```

- Default agent: `codex exec --json --sandbox workspace-write {prompt}`. Placeholders: `{prompt}` (shell-quoted), `{prompt_file}`, `{arm}`, `{task}`. Env vars `INTENT_AB_ARM`, `INTENT_AB_TASK` and `INTENT_AB_PROMPT_FILE` are also set.
- Both arms get the same prompt, acceptance checks and intent. Arm B additionally gets the constraint "don't add or modify test files, report against the checks".
- Arm order alternates between tasks.
- Tokens are summed from Codex `turn.completed` events or Claude Code `result` objects. If the output has neither, tokens are recorded as `unknown`.
- Output: `results/<timestamp>.json` and `results/<timestamp>.md`. Add `results/` to your `.gitignore`.
- With 3–5 tasks the result is a **directional signal, not a statistically significant one.** Use `--repeats` and more tasks before drawing conclusions. Real runs spend real agent quota, so start small.

## Development

```sh
npm test   # node --test; temporary git repos and a fake agent, no network
```

Plain Node.js ESM, zero dependencies. Tested with Linux and macOS shells; Windows isn't supported yet.

## Credit

Inspired by [Kun Chen's post](https://x.com/kunchenguid/status/2108030810691629403) on agent-written tests.

## License

MIT © 2026 miniLV
