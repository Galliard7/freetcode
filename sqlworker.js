// SPDX-License-Identifier: AGPL-3.0-or-later
// FreetCode — Copyright (C) 2026 Galliard7. See LICENSE.

/* ══════════════════════════════════════════════════════════════════
   FreetCode — SQL Engine Host Worker (PGlite / real Postgres in WASM)

   The SQL-mode analog of worker.js. A MODULE worker (PGlite ships ESM),
   spawned by sqlengine.js with { type: 'module' }. Message protocol
   mirrors worker.js — posts 'ready' when the DB boots, answers each
   request by echoing its id.

     • prepare {id, setup} — reset to a clean schema and seed the
                             problem's tables (the committed baseline).
     • run     {id, sql}   — execute a query in an isolated transaction
                             (BEGIN … ROLLBACK) so a user query can never
                             corrupt the seeded baseline for the oracle.

   Per-problem isolation + result-set grading: ADR 0006/0007,
   docs/sql-practice-spec.md.
   ══════════════════════════════════════════════════════════════════ */

// TODO(build): pin an exact version before production.
const PGLITE_URL = 'https://cdn.jsdelivr.net/npm/@electric-sql/pglite/dist/index.js';

let db = null;

async function init() {
  try {
    const { PGlite } = await import(PGLITE_URL);
    db = await PGlite.create();          // in-memory, ephemeral
    postMessage({ type: 'ready' });
  } catch (e) {
    postMessage({ type: 'init-error', text: String((e && e.message) || e) });
  }
}
init();

// Wipe everything and start from an empty public schema.
async function resetSchema() {
  await db.exec('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; SET search_path TO public;');
}

self.onmessage = async (e) => {
  const m = e.data;
  if (m.type === 'prepare') {
    try {
      await resetSchema();
      if (m.setup) await db.exec(m.setup);
      postMessage({ type: 'prepared', id: m.id });
    } catch (err) {
      postMessage({ type: 'prepare-error', id: m.id, text: String((err && err.message) || err) });
    }
    return;
  }
  if (m.type === 'run') {
    let began = false;
    try {
      await db.exec('BEGIN'); began = true;
      const t0 = performance.now();
      const res = await db.query(m.sql);
      const ms = performance.now() - t0;
      await db.exec('ROLLBACK'); began = false;
      const columns = (res.fields || []).map((f) => f.name);
      const rows = res.rows || [];
      postMessage({ type: 'result', id: m.id, columns, rows, rowCount: rows.length, ms });
    } catch (err) {
      if (began) { try { await db.exec('ROLLBACK'); } catch (_) { /* ignore */ } }
      postMessage({ type: 'run-error', id: m.id, text: String((err && err.message) || err) });
    }
  }
};
