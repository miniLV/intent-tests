# Intent: slugify() handles accents and repeated separators

## Goal
`slugify(title)` in `src/slugify.js` turns any article title into a URL slug.
Today it keeps accented letters and produces `--` for repeated spaces or punctuation.

## Acceptance checks
- [ ] `npm test` passes
- [ ] `node -e "import('./src/slugify.js').then(m=>process.exit(m.slugify('Crème  Brûlée!')==='creme-brulee'?0:1))"` exits 0
- [ ] Leading and trailing separators are removed (`"  Hello "` → `hello`)
- [ ] Public API is unchanged: still a single named export `slugify`

## Scope
- `src/slugify.js`
- `CHANGELOG.md`

## Out of scope
- Transliterating non-Latin scripts (CJK, Cyrillic)
- Changing callers of `slugify`

## Allowed tests
- none

## Examples
- `"Hello, World"` → `hello-world`
- `"Crème  Brûlée!"` → `creme-brulee`
- `"--a--b--"` → `a-b`
