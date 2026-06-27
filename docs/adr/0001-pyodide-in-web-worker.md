# 0001 — Run Pyodide in a Web Worker, time out by terminate + respawn

Status: Accepted · v2

## Context

User code (arbitrary Python via Pyodide/WASM) can loop forever or run a correct-but-
quadratic algorithm that, at the input sizes the scaled stress test uses, is
indistinguishable from a hang. In v1 Pyodide ran on the **main thread** with no
timeout, so such code froze the browser tab with no way to recover.

The clean way to interrupt a running Python computation is Pyodide's interrupt
buffer, which requires a `SharedArrayBuffer`. That in turn requires the COOP/COEP
response headers (`Cross-Origin-Opener-Policy` / `Cross-Origin-Embedder-Policy`).
**GitHub Pages does not let you set custom response headers**, so that path is closed
for our hosting.

## Decision

Run a single Pyodide instance inside a **Web Worker**. The main thread enforces a
hard timeout with `setTimeout`; on expiry it calls `worker.terminate()` (which kills
any hung Python immediately) and spawns a fresh worker. Output is streamed back via
`postMessage` instead of touching the DOM directly.

## Consequences

- A runaway loop can no longer freeze the tab — for Run *and* Submit.
- The scaled stress test's time cap is "the worker got terminated" — which is exactly
  the Time-Limit-Exceeded signal we want, with no per-statement instrumentation.
- Cost: a terminate forces a Pyodide reload (~2–4s) before the next execution. This
  only happens on a genuine hang, so it's acceptable.
- Correctness is judged in a **separate request** from scaled timing, so a stress-test
  timeout never discards an already-computed correctness verdict.
- We cannot interrupt *cooperatively* (no partial results from a killed run). Accepted.

## Alternatives rejected

- **Main thread + cooperative interrupt** — impossible without SharedArrayBuffer,
  which needs headers GitHub Pages can't set.
- **Two Pyodide instances (main for Run, worker for Submit)** — double memory and load
  time, and leaves Run unsafe against infinite loops.
