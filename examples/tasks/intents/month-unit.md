# Intent: parse months

## Goal
`ms()` should understand months when parsing strings. One month is one twelfth of the library's year (`365.25 / 12` days, i.e. `2629800000` ms).

## Acceptance checks
- [ ] `node -e "process.exit(require('./index.js')('1mo') === 2629800000 ? 0 : 1)"` exits 0
- [ ] `mo`, `month` and `months` are accepted, case-insensitive, with or without a space (`"2 months"`, `"1.5mo"`, `"-1mo"`)
- [ ] `m` still means minutes (`ms('1m') === 60000`) and every existing unit parses as before
- [ ] Formatting numbers (`ms(60000)`, `{ long: true }`) is unchanged

## Scope
- `index.js`
- `readme.md`

## Out of scope
- Formatting numbers as months
- Calendar-aware months (28–31 days)

## Allowed tests
- none

## Examples
- `ms('1mo')` → `2629800000`
- `ms('2 months')` → `5259600000`
- `ms('1m')` → `60000`
