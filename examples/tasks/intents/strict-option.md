# Intent: strict parsing option

## Goal
Callers that pass user input want an error instead of a silent `undefined` when a string can't be parsed. Add an opt-in `strict` option.

## Acceptance checks
- [ ] `node -e "try { require('./index.js')('soon', { strict: true }); process.exit(1) } catch (e) { process.exit(0) }"` exits 0
- [ ] The thrown value is an `Error` whose message contains the offending input (`soon`)
- [ ] Valid strings return the same number with or without `{ strict: true }`
- [ ] Without the option, invalid strings still return `undefined` (no breaking change)
- [ ] `strict` has no effect when formatting numbers

## Scope
- `index.js`
- `readme.md`

## Out of scope
- Making strict the default
- Changing the existing error for non-string, non-number input

## Allowed tests
- none

## Examples
- `ms('2h', { strict: true })` → `7200000`
- `ms('soon', { strict: true })` → throws `Error` mentioning `soon`
- `ms('soon')` → `undefined`
