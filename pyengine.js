// SPDX-License-Identifier: AGPL-3.0-or-later
// FreetCode — Copyright (C) 2026 Galliard7. See LICENSE.

/* ══════════════════════════════════════════════════════════════════
   FreetCode — Python Engine (main-thread client for worker.js)
   Owns the Pyodide worker, streams output, and enforces a hard timeout
   by terminating + respawning the worker (the only way to kill a hung
   Python loop without SharedArrayBuffer, which GitHub Pages can't enable).
   ══════════════════════════════════════════════════════════════════ */

class PyEngine {
  constructor() {
    this.worker = null;
    this.ready = false;
    this.seq = 0;
    this.pending = new Map();
    this.readyWaiters = [];
    this.onOutput = null;   // (text, stream) => void
    this.onReady = null;    // () => void
    this.onInitError = null;// (msg) => void
    this.spawn();
  }

  spawn() {
    this.ready = false;
    this.worker = new Worker('worker.js?v=2');
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
      case 'stdout':
      case 'stderr':
        if (this.onOutput) this.onOutput(m.text, m.type);
        break;
      case 'done': {
        const p = this.pending.get(m.id);
        if (p) { this.pending.delete(m.id); p.resolve({ error: !!m.error }); }
        break;
      }
      case 'verdict': {
        const p = this.pending.get(m.id);
        if (p) { this.pending.delete(m.id); p.resolve(m.result); }
        break;
      }
    }
  }

  whenReady() {
    return this.ready ? Promise.resolve() : new Promise((r) => this.readyWaiters.push(r));
  }

  // Hard-kill the worker (terminates any hung Python) and bring a fresh one up.
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

  // Unjudged execution; output streams via onOutput. Generous cap catches infinite loops.
  run(code, timeoutMs = 10000) {
    return this._request({ type: 'run', code }, timeoutMs);
  }

  // Graded sample correctness (spec-driven smart compare).
  judgeSamples(userCode, solution, spec, timeoutMs = 10000) {
    return this._request({ type: 'judge', kind: 'samples', userCode, solution, spec }, timeoutMs);
  }

  // Benchmark at size n (warm-up + best-of-reps min, both sides). A timeout
  // here IS the TLE signal for that size.
  judgeBench(userCode, solution, spec, n, reps = 3, timeoutMs = 6000) {
    return this._request({ type: 'judge', kind: 'bench', userCode, solution, spec, n, reps }, timeoutMs);
  }

  // Peak-memory (auxiliary space) at size n.
  judgeSpace(userCode, solution, spec, n, timeoutMs = 6000) {
    return this._request({ type: 'judge', kind: 'space', userCode, solution, spec, n }, timeoutMs);
  }

  // Fallback judging (printed-output compare) for spec-less problems.
  judgeStdout(userCode, solution, timeoutMs = 10000) {
    return this._request({ type: 'judge', kind: 'stdout', userCode, solution }, timeoutMs);
  }
}

window.PyEngine = PyEngine;
