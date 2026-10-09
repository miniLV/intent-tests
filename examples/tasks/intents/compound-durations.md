# Intent: compound durations

## Goal
`ms()` should parse strings made of several duration parts and return their sum, e.g. `"1h 30m"` → `5400000`.

## Acceptance checks
- [ ] `node -e "process.exit(require('./index.js')('1h 30m') === 5400000 ? 0 : 1)"` exits 0
- [ ] Parts may be separated by spaces or written back to back (`"1h30m"`, `"1d 2h 3m 4s"`)
- [ ] Each part uses the existing units; a single part parses exactly as before
- [ ] If any part is invalid the whole string is invalid and `ms()` returns `undefined` (`"1h foo"`)
- [ ] Strings longer than 100 characters still return `undefined`

## Scope
- `index.js`
- `readme.md`

## Out of scope
- Mixed signs inside one string (`"1h -30m"`)
- New units

## Allowed tests
- none

## Examples
- `ms('1h 30m')` → `5400000`
- `ms('1h30m')` → `5400000`
- `ms('2 days 3 hours')` → `183600000`
- `ms('1h foo')` → `undefined`
