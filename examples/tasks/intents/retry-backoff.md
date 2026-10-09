# Intent: retry with exponential backoff

## Goal
`fetchWithRetry(url)` retries failed requests with exponential backoff instead of retrying immediately.

## Acceptance checks
- [ ] Waits 100ms, 200ms, 400ms between attempts (max 3 retries)
- [ ] Does not retry 4xx responses
- [ ] `npm test` passes

## Allowed tests
- none
