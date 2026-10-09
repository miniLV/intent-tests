// Shared helpers for the held-out verify scripts. Run with cwd = the agent's worktree.
const path = require('node:path');

function load() {
  return require(path.resolve('index.js'));
}

function runner() {
  let failed = 0;
  return {
    eq(label, got, want) {
      if (!Object.is(got, want)) { failed++; console.error(`FAIL ${label}: got ${String(got)}, want ${String(want)}`); }
    },
    ok(label, cond) {
      if (!cond) { failed++; console.error(`FAIL ${label}`); }
    },
    done() {
      if (failed) { console.error(`${failed} check(s) failed`); process.exit(1); }
      console.log('all checks passed');
    },
  };
}

// Behaviour of ms@2.1.3 that every task must keep.
function regression(ms, t) {
  t.eq("ms('100')", ms('100'), 100);
  t.eq("ms('1m')", ms('1m'), 60000);
  t.eq("ms('1h')", ms('1h'), 3600000);
  t.eq("ms('2d')", ms('2d'), 172800000);
  t.eq("ms('3w')", ms('3w'), 1814400000);
  t.eq("ms('1y')", ms('1y'), 31557600000);
  t.eq("ms('1.5h')", ms('1.5h'), 5400000);
  t.eq("ms('-100ms')", ms('-100ms'), -100);
  t.eq("ms('53 milliseconds')", ms('53 milliseconds'), 53);
  t.eq("ms('1 HOUR')", ms('1 HOUR'), 3600000);
  t.eq("ms('foo')", ms('foo'), undefined);
  t.eq("ms('☃')", ms('☃'), undefined);
  t.eq("ms(60000)", ms(60000), '1m');
  t.eq("ms(2 * 86400000)", ms(2 * 86400000), '2d');
  t.eq("ms(3600000, {long:true})", ms(3600000, { long: true }), '1 hour');
  t.eq("ms(1000 * 60 * 60 * 24 * 10, {long:true})", ms(864000000, { long: true }), '10 days');
  let threw = false;
  try { ms(''); } catch { threw = true; }
  t.ok("ms('') throws", threw);
}

module.exports = { load, runner, regression };
