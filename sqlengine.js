// SPDX-License-Identifier: AGPL-3.0-or-later
// FreetCode — Copyright (C) 2026 Galliard7. See LICENSE.

/* ══════════════════════════════════════════════════════════════════
   FreetCode — SQL Engine (main-thread client for sqlworker.js)

   The SQL-mode analog of pyengine.js. Owns the PGlite (Postgres/WASM)
   module worker and resolves each request by seq id, with a hard timeout
   that terminates + respawns the worker — same discipline as PyEngine.

   API:
     whenReady()        → resolves when Postgres has booted
     prepare(setupSql)  → reset + seed the current problem's tables
     run(sql)           → isolated execution → { columns, rows, rowCount, ms } | { error }
   ══════════════════════════════════════════════════════════════════ */

class SqlEngine {
  constructor() {
    this.worker = null;
    this.ready = false;
    this.seq = 0;
    this.pending = new Map();
    this.readyWaiters = [];
    this.onReady = null;      // () => void
    this.onInitError = null;  // (msg) => void
    this.spawn();
  }

  spawn() {
    this.ready = false;
    // PGlite is ESM → the worker must be a module worker.
    this.worker = new Worker('sqlworker.js?v=2', { type: 'module' });
    this.worker.onmessage = (e) => this._handle(e.data);
    this.worker.onerror = (e) => {
      if (this.onInitError) this.onInitError(e.message || 'worker error');
    };
  }

  _handle(m) {
    switch (m.type) {
      case 'ready':
        this.ready = true;
        this.readyWaiters.forEach((r) => r());
        this.readyWaiters = [];
        if (this.onReady) this.onReady();
        break;
      case 'init-error':
        if (this.onInitError) this.onInitError(m.text);
        break;
      case 'prepared': {
        const p = this.pending.get(m.id);
        if (p) { this.pending.delete(m.id); p.resolve({ ok: true }); }
        break;
      }
      case 'prepare-error': {
        const p = this.pending.get(m.id);
        if (p) { this.pending.delete(m.id); p.resolve({ ok: false, error: m.text }); }
        break;
      }
      case 'result': {
        const p = this.pending.get(m.id);
        if (p) {
          this.pending.delete(m.id);
          p.resolve({ columns: m.columns, rows: m.rows, rowCount: m.rowCount, ms: m.ms });
        }
        break;
      }
      case 'run-error': {
        const p = this.pending.get(m.id);
        if (p) { this.pending.delete(m.id); p.resolve({ error: m.text }); }
        break;
      }
    }
  }

  whenReady() {
    return this.ready ? Promise.resolve() : new Promise((r) => this.readyWaiters.push(r));
  }

  // Hard-kill the worker (kills a hung query) and bring a fresh one up.
  reset(reason) {
    if (this.worker) this.worker.terminate();
    this.pending.forEach((p) => p.reject(new Error(reason || 'terminated')));
    this.pending.clear();
    this.spawn();
  }

  _request(msg, timeoutMs) {
    const id = ++this.seq;
    msg.id = id;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        this.reset('timeout');
        const err = new Error('timeout');
        err.timeout = true;
        reject(err);
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (v) => { clearTimeout(timer); resolve(v); },
        reject: (e) => { clearTimeout(timer); reject(e); },
      });
      this.worker.postMessage(msg);
    });
  }

  // Reset to a clean schema and seed the problem's tables. Resolves { ok, error? }.
  prepare(setupSql, timeoutMs = 15000) {
    return this._request({ type: 'prepare', setup: setupSql }, timeoutMs);
  }

  // Run a query in isolation. Resolves { columns, rows, rowCount, ms } or { error }.
  run(sql, timeoutMs = 10000) {
    return this._request({ type: 'run', sql }, timeoutMs);
  }
}

window.SqlEngine = SqlEngine;
