# intent-tests

**Stop coding agents from writing tests that just echo their own code.** You state intent, the agent implements, and a paired A/B on your own repo tells you whether self-written tests were worth the tokens.

[中文说明](README.zh-CN.md)

> **Status: early prototype (v0.1).** The tools work and are tested, but there are no benchmark results yet. Nothing here claims time or token savings. Run the A/B on your own repo and decide from your own numbers.

## Quick start

```sh
git clone https://github.com/miniLV/intent-tests && cd intent-tests
npm test                                                     # 17 tests, Node 20+, no dependencies
node bin/intent-ab.js examples/dry-run/tasks.json --dry-run  # A/B harness with a fake agent
```

## What it is

Three small pieces that work on their own or together:

| Piece | What it does |
| --- | --- |
| `skills/intent-first` | Agent skill for Codex and Claude Code. The human writes `INTENT.md`; the agent implements without adding test files that weren't asked for, then reports PASS / FAIL / NOT VERIFIED against each acceptance check. |
| `intent-check` | CLI that reads `INTENT.md` and `git diff` against a base ref. Flags new or modified test files that `INTENT.md` doesn't allow, flags files changed outside `## Scope`, runs command acceptance checks. Human report or `--json`; exit 1 on violations. Works in pre-commit or CI, no IDE hooks needed. |
| `intent-ab` | Paired A/B harness. Runs each task twice in separate git worktrees (arm **A** `tests-allowed`, arm **B** `intent-first`), then runs your verify command. Records pass/fail, wall time, tokens (from Codex / Claude Code JSON output) and which test files each arm touched. |

## What it isn't

- Not a claim that tests are useless. Tests you ask for (`## Allowed tests`) and your existing suites stay in place.
- Not a test generator, and not a replacement for code review.
- Not a benchmark. A few tasks give a directional signal for *your* repo, not a statistically significant result.

## INTENT.md

```markdown
# Intent: slugify() handles accents and repeated separators

## Goal
`slugify(title)` in `src/slugify.js` turns any article title into a URL slug.

## Acceptance checks
- [ ] `npm test` passes
- [ ] Leading and trailing separators are removed (`"  Hello "` → `hello`)
- [ ] Public API is unchanged: still a single named export `slugify`

## Scope
- `src/slugify.js`

## Out of scope
- Transliterating non-Latin scripts

## Allowed tests
- none

## Examples
- `"Crème  Brûlée!"` → `creme-brulee`
```

Rules the parser follows:

- `## Acceptance checks`: list items. An item that **starts with an inline code span** is a command check and `intent-check` runs it (exit 0 = pass). Everything else is a manual check the agent must report evidence for.
- `## Scope` (optional): globs (`src/**`, `*.md`). If present, any changed file outside it is a violation. `INTENT.md` itself is always allowed.
- `## Allowed tests`: globs of test files the agent may add or modify, or `none` (the default).
- Test files are detected with `**/*.test.*`, `**/*.spec.*`, `**/*_test.*`, `**/test_*.py`, `**/test/**`, `**/tests/**`, `**/__tests__/**`, `**/spec/**`. Override with `--test-pattern`.

Full example: [`examples/INTENT.md`](examples/INTENT.md).

## Install the skill

**Codex:** copy the skill into the repo (or `~/.agents/skills/` for all repos):

```sh
mkdir -p .agents/skills && cp -r /path/to/intent-tests/skills/intent-first .agents/skills/
```

Optionally paste [`examples/AGENTS.snippet.md`](examples/AGENTS.snippet.md) into your `AGENTS.md` so the rule applies even when the skill isn't triggered.

**Claude Code:** copy it into the project (or `~/.claude/skills/`):

```sh
mkdir -p .claude/skills && cp -r /path/to/intent-tests/skills/intent-first .claude/skills/
```

## intent-check

```sh
# in your repo, after the agent finished
npx --yes -p github:miniLV/intent-tests intent-check --base main
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

Exit codes: `0` ok, `1` violations or failing command check, `2` setup error (e.g. no `INTENT.md`).

## intent-ab

Write a task file (JSON):

```json
{
  "setup": "npm ci",
  "tasks": [
    {
      "id": "slugify-accents",
      "prompt": "Make slugify() in src/slugify.js strip accents and collapse repeated separators.",
      "acceptance": ["slugify('Crème  Brûlée!') returns 'creme-brulee'"],
      "verify": "node {taskdir}/verify/slugify-accents.mjs"
    }
  ]
}
```

- `verify` is your held-out check. `{taskdir}` expands to the task file's directory, so verify scripts can live outside the repo where neither arm can see or edit them.
- `intent` (optional): path to an INTENT-style file whose text is added to the prompt of both arms.
- `setup` (optional, top level or per task): runs in each fresh worktree before the agent; not timed.

Run it from the repo you want to test:

```sh
intent-ab tasks.json                                   # Codex (default)
intent-ab tasks.json --agent 'claude -p {prompt} --output-format json --permission-mode acceptEdits'
intent-ab tasks.json --repeats 2 --keep-worktrees
```

- Default agent: `codex exec --json --sandbox workspace-write {prompt}`. Placeholders: `{prompt}` (shell-quoted), `{prompt_file}`, `{arm}`, `{task}`. Env vars `INTENT_AB_ARM`, `INTENT_AB_TASK`, `INTENT_AB_PROMPT_FILE` are also set.
- Both arms get the same prompt, acceptance checks and intent. Arm B additionally gets the "don't add or modify test files, report against the checks" constraint.
- Arm order alternates between tasks.
- Tokens are summed from Codex `turn.completed` events or Claude Code `result` objects. If the agent output has neither, tokens are recorded as `unknown`.
- Output: `results/<timestamp>.json` and `results/<timestamp>.md` (add `results/` to your `.gitignore`).
- With 3–5 tasks the result is a **directional signal, not a statistically significant one.** Use `--repeats` and more tasks before drawing conclusions. Real runs spend real agent quota: start small.

## Development

```sh
npm test   # node --test; uses temporary git repos and the fake agent, no network
```

Plain Node.js ESM, zero dependencies. Tested on Linux and macOS shells; Windows isn't supported yet.

## Credit

Inspired by [Kun Chen's post](https://x.com/kunchenguid/status/2108030810691629403) on agent-written tests.

## License

MIT © 2026 miniLV
