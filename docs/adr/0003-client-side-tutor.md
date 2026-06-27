# 0003 — Client-side AI tutor (WebLLM + WebGPU, opt-in)

Status: Accepted · shipped 2026-06-15

## Context

v1 shipped an **AI tutor** as a chat panel backed by Google Gemini, requiring each user
to paste **their own API key** (`aistudio.google.com`). It was removed on 2026-05-24
(commit `c178e76`), folded silently into another commit — the rationale was never
recorded. The near-certain reason: a **free, no-login** platform that then demands an
API key is a contradiction; the friction meant ~no one used it.

We want the tutor back — hints, explanations, complexity reasoning grounded in the
problem and the user's own code — without reintroducing that friction, and without
taking on per-call cost, abuse surface, or key custody. The app is on GitHub Pages
(static only; see [[0002]] for the one external service we run).

## Decision

Run a **small model entirely in the user's browser** via **WebLLM** (the MLC in-browser
inference engine) on **WebGPU** (the browser→GPU API). No server, no API key, no cost,
nothing leaves the device.

- **Model:** `Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC` (~1 GB). `model_id` is a one-line
  swap; we A/B against `Qwen3.5-2B` once the harness exists. (See [[0001]] — Pyodide
  already runs in a Web Worker; the tutor's inference will too, to avoid blocking the UI
  and the judge.)
- **Strictly opt-in.** The whole app works with **zero download**. Nothing about the
  model loads until the user clicks *Enable Tutor* and accepts a consent dialog
  disclosing the ~1 GB one-time download, on-device/private execution, the WebGPU
  requirement, and that it's removable anytime.
- **Persisted across visits.** After download we call `navigator.storage.persist()` so
  the browser won't auto-evict the ~1 GB. Return visits **reuse** the cached model (no
  re-download). It only disappears if the user deliberately clears site data.
- **Removable.** A Settings control deletes the cached model and frees the disk. Consent
  on the way in, one-click removal on the way out.
- **Quality via grounding + system prompt first; no fine-tuning to start.** We inject the
  problem, the user's code, the judge's verdict (slowdown ratio, Big-O estimate), and the
  **reference (oracle) solution** so the model reasons from the real answer, plus a tutor
  system prompt. A small eval set (~10–15 real failed-submit scenarios) makes the
  fine-tune decision data-driven rather than pre-emptive.

### Guardrails

- **Socratic by instruction, not by withholding** *(revised after Stage-0 testing):* the
  model **is** given the reference solution so its hints are accurate and targeted; the
  system prompt keeps it Socratic — nudge, minimal examples, don't dump the solution.
  Answer-leakage is explicitly **deprioritized**: a free learning tool has ~zero cheating
  incentive (cf. [[0002]]), and a tutor that knows the answer gives better hints.
- **Ground in real data, not guesses** — feed the actual computed verdict/complexity so
  it parrots true facts instead of hallucinating numbers.
- **Sanitize model output** before rendering (no raw `innerHTML`).
- **Caps:** low temperature, bounded `max_tokens`, stop sequences → short, steady, fast.
- **Resource guard:** don't run tutor inference while a Submit/judge is executing
  (two-worker contention).
- BYOK (user-supplied key for a smarter model + visualizations) is **deferred**, not
  rejected — see "Deferred" below.

## Consequences

- Zero marginal cost, zero key custody, zero abuse surface (compute is the user's). The
  feature fits the no-login ethos that v1's tutor violated.
- Cost moves to the **user's device**: a one-time ~1 GB download and a **WebGPU
  requirement**. Users without WebGPU (older/low-end, some mobile) get a graceful "tutor
  unavailable" fallback and the full app otherwise.
- Quality is capped by a ~1.5–2 B model. Acceptable for grounded hints/explanations;
  unproven until the Stage-0 POC. Not a general reasoning tutor.
- Two GPU/CPU consumers now exist (judge + tutor); contention must be managed.

## Build path

Stage 0 **POC** (`tutor-poc.html`, standalone — doesn't touch the live app): consent
gate, WebLLM load, `persist()`, Remove, bare grounded chat. → Stage 1 grounding + eval →
Stage 2 salvage + re-skin the old chat panel into `index.html` behind a flag → Stage 3
guardrails/fallbacks → Stage 4 ship dark, then enable. Stage 5 fine-tune only if the eval
demands it.

## Alternatives rejected / deferred

- **Off-the-shelf API (Haiku/Gemini/GPT) via our Worker** — best quality, but per-call
  cost, abuse surface on an anonymous endpoint, and free tiers exhaust at ~40–60 DAU.
- **Train a model from scratch (nanoGPT)** — a worthwhile learning exercise but a dead
  end as a product: GPT-2-class output can't tutor, and the gap to a usable assistant is
  orders of magnitude of compute + instruction tuning.
- **BYOK (deferred, not rejected)** — optional user key to unlock a smarter model and
  visualizations (tool-calling into the existing `visualizers/`). Cheap to add later
  (the old Gemini fetch is salvageable), but turns a no-secrets page into one holding a
  secret → needs output sanitization, SRI-pinned deps, non-exfiltrating tool allowlist,
  and a meta CSP. Revisit after the free default ships.
