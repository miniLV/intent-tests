## Tests and intent

- Before changing code, read `INTENT.md` if it exists. It is the human's statement of the goal, acceptance checks, scope and which tests (if any) you may write.
- Do not add or modify test files unless `INTENT.md` lists them under `## Allowed tests`.
- If `## Examples` lists input → expected behaviour and `## Allowed tests` names a test file, translate those examples into that file, verbatim. Do not invent extra cases.
- You may run existing tests.
- When done, run `npx --yes -p github:miniLV/intent-tests intent-check --base <base>` (or `node <path>/bin/intent-check.js`) and finish with a report: one line per acceptance check with status and evidence.
