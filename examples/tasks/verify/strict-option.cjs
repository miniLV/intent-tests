const { load, runner, regression } = require('./_lib.cjs');
const ms = load();
const t = runner();
let err = null;
try { ms('soon', { strict: true }); } catch (e) { err = e; }
t.ok("ms('soon', {strict:true}) throws", err !== null);
t.ok('thrown value is an Error', err instanceof Error);
t.ok('message mentions the input', !!err && String(err.message).includes('soon'));
t.eq("ms('2h', {strict:true})", ms('2h', { strict: true }), 7200000);
t.eq("ms('1.5 days', {strict:true})", ms('1.5 days', { strict: true }), 129600000);
t.eq("ms('soon')", ms('soon'), undefined);
t.eq("ms(60000, {strict:true})", ms(60000, { strict: true }), '1m');
regression(ms, t);
t.done();
