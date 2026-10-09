---
name: intent-first
description: Use when implementing a change in a repo that has an INTENT.md, or when the user asks you not to write your own tests. The human states intent and acceptance checks; you implement without adding tests that just restate your code, then report evidence against each check.
---

# Intent-first implementation

The human states what "done" means in `INTENT.md`. You implement against it, skip writing tests the human did not ask for, and report evidence for each acceptance check.

## Workflow

1. **Find the intent.** Read `INTENT.md` at the repo root (or the path the user gives).
   - If it does not exist, stop and ask the human to write one. Offer a draft with these sections, filled in from the request, and wait for confirmation:
     `## Goal`, `## Acceptance checks`, `## Scope` (optional), `## Out of scope`, `## Allowed tests`, `## Examples` (optional).
   - Do not start implementing from your own draft until the human confirms it.
2. **Restate the plan in 3–6 lines**: which files you will touch (must fit `## Scope` if present), and how you will satisfy each acceptance check.
3. **Implement.**
   - Do **not** create or modify test files (`*.test.*`, `*.spec.*`, `test/`, `tests/`, `__tests__/`, `test_*.py`, `*_test.go`, ...) unless the path matches `## Allowed tests`.
   - If `## Allowed tests` names a file and `## Examples` lists input → expected cases, translate exactly those examples into that file. Do not add cases of your own.
   - Do not write throwaway test scripts to "check your work". Run the commands the human listed instead.
   - Running existing tests is fine.
   - Stay inside `## Scope`. If you must go outside it, stop and say why.
4. **Check.** Run `intent-check` (see below). It flags unrequested test files and out-of-scope changes and runs every acceptance check written as a command (an item that starts with `` `cmd` ``).
5. **Report.** Finish with one line per acceptance check:
   `#<n> <PASS|FAIL|NOT VERIFIED> <check>: <evidence: command output, file:line, or why it can't be verified here>`.
   Never claim PASS for a manual check without concrete evidence. Say NOT VERIFIED instead.

## Running the checker

```sh
npx --yes -p github:miniLV/intent-tests intent-check --base main   # or
node /path/to/intent-tests/bin/intent-check.js --base main
```

Exit code 0 means no violations, 1 means violations or a failing command check.

## What this skill is not

- It is not a rule against tests. Tests the human asks for and existing suites stay in place; use `## Allowed tests` to request them.
- It does not replace review. A PASS from `intent-check` only means the declared checks passed.
