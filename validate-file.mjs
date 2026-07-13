// FreetCode — parameterized SQL validator.
// Usage:  node validate-file.mjs <path-to-json>
// The JSON must have the same shape as problems-sql.json: { datasets:{...}, problems:[...] }.
// Runs every oracle through real Postgres (PGlite) and checks: oracle executes,
// returns >=1 row (unless allowEmpty), self-compares as correct under its `ordered`
// flag, and any wrongExample is rejected. Exit 0 iff all pass.

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const SqlJudge = require('./sqljudge.js');

let PGlite;
try { ({ PGlite } = await import('@electric-sql/pglite')); }
catch { console.error('PGlite not installed. Run: npm i @electric-sql/pglite'); process.exit(2); }

const path = process.argv[2];
if (!path) { console.error('Usage: node validate-file.mjs <path-to-json>'); process.exit(2); }
const data = JSON.parse(readFileSync(path));
const db = await PGlite.create();

async function reset() { await db.exec('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; SET search_path TO public;'); }
async function runIsolated(sql) {
  await db.exec('BEGIN');
  try { const r = await db.query(sql); await db.exec('ROLLBACK');
        return { columns: (r.fields || []).map(f => f.name), rows: r.rows || [], rowCount: (r.rows || []).length }; }
  catch (e) { try { await db.exec('ROLLBACK'); } catch {} return { error: String(e.message || e) }; }
}

let passed = 0, failed = 0;
const seen = new Set();
for (const p of data.problems) {
  const errs = [];
  if (seen.has(p.id)) errs.push('duplicate id');
  seen.add(p.id);
  const ds = data.datasets[p.dataset];
  const setup = p.inlineSetup ? [].concat(p.inlineSetup).join('\n') : (ds ? ds.setup.join('\n') : null);
  if (!setup) errs.push('no setup for dataset ' + p.dataset);
  else {
    await reset();
    try { await db.exec(setup); } catch (e) { errs.push('setup failed: ' + e.message); }
  }
  const oracle = await runIsolated(p.oracle);
  if (oracle.error) errs.push('ORACLE errored: ' + oracle.error);
  else {
    if (oracle.rowCount < 1 && !p.allowEmpty) errs.push('oracle returned 0 rows');
    const ordered = (p.ordered !== undefined) ? p.ordered : SqlJudge.inferOrdered(p.oracle);
    const self = SqlJudge.compareResultSets(oracle, oracle, { ordered, strictColumns: p.strictColumns });
    if (!self.pass) errs.push('self-compare failed: ' + self.reason);
    if (p.wrongExample) {
      const wrong = await runIsolated(p.wrongExample);
      const v = SqlJudge.compareResultSets(wrong, oracle, { ordered, strictColumns: p.strictColumns });
      if (v.pass) errs.push('wrongExample NOT rejected');
    }
  }
  if (errs.length) { failed++; console.log(`BAD  #${p.num || '?'} ${p.id}\n     ${errs.join('\n     ')}`); }
  else { passed++; console.log(`ok   ${p.id} rows=${oracle.rowCount}`); }
}
console.log(`\n${passed}/${passed + failed} passed · ${failed} failed`);
process.exit(failed ? 1 : 0);
