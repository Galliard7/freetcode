# Chronicle

Project story — decisions, pivots, milestones, and dead ends.
Auto-captured by the chronicle skill. Reverse-chronological.

<!-- chronicle:config
  Auto-capture: When this file exists, CC should append a chronicle entry
  before ending any session where meaningful work was done. Skip trivial
  sessions (just reading, quick questions, no project changes).
  Manual entries: /chronicle <note>
  Exports: /chronicle export --onboard | --content
-->

---

## 2026-06-27 — Hardening the Release: AGPL, a Name Collision, and a Clean-Slate Repo

`#decision` `#pivot` `#milestone`

The session started as a strategy question — how to release this thing thoughtfully so it's not trivially copyable — and the honest reframing set the whole tone: for a free, unshared solo project the real risk is **obscurity, not theft**. Code shipped to a browser is the least defensible thing you own; what you actually protect with are a license, a brand, velocity, and whatever you keep server-side. So we converged on two levers, not DRM theater. **Legal:** AGPL-3.0-or-later (downloaded the canonical text, added SPDX headers to every JS file, an HTML license comment in `index.html`) — chosen specifically because it closes the SaaS loophole: anyone running a modified version as a network service must publish their source. **Technical:** move the curriculum out of the forkable repo into per-problem Cloudflare KV serving, so copying means scraping a live API problem-by-problem instead of one-click forking `problems.json`. We explicitly **rejected** the stronger "server-side judging / hide the answer key" version (V2): the app *shows* solutions to users by design and judging runs client-side in Pyodide, so hiding the oracle from the network buys nothing and would be a security-fraught rebuild that doesn't fit Cloudflare's free tier. The user clocked, correctly, that AI deobfuscation has gutted the value of minified-bundle hiding — which is exactly why we leaned on the license + KV rather than obfuscation.

The surprise of the session: the **name**. I spun up a research agent and it came back decisive — "OpenCode" collides head-on with `opencode.ai`, a ~160k-star AI coding agent by Anomaly Innovations that *also* holds a live USPTO filing on "OPENCODE" (serial 99379413, Class 9). Same space, even an AI assistant like ours. The legal risk to a non-commercial pseudonymous tool is low, but the **discoverability** risk is near-fatal: launching as an invisible namesake of one of GitHub's biggest dev tools. The user's original intent — "the open/free LeetCode" — pointed the way out: **FreetCode** (free + LeetCode). So we renamed everywhere, with one deliberate carve-out: the deployed Cloudflare Worker + D1 stay named `opencode-stats` (the live `opencode-stats.galliard7.workers.dev` URL and `opencode_stats` binding) because renaming live infra mid-flight would break stats for zero user benefit.

The execution had real dead ends worth recording. The first two rename passes silently failed because **`grep` on this machine is `ugrep`**, where `-Z` means fuzzy-match, not null-separation — so `xargs` got a garbled blob and my `--exclude-dir`s were ignored; switching to `find` + `perl` fixed it (69 files). Then the GitHub push was **rejected for lack of `workflow` scope** (couldn't push `.github/workflows/pages.yml`), so I dropped the Actions-based deploy and used classic branch-based Pages instead — simpler for a static root site, no scope needed. And the shell kept **losing `PATH` inside command-substitution subshells** (`curl`/`cat` "not found" even though `command -v` resolved them) — the documented tool-I/O flakiness on this box — so I fell back to single direct commands with absolute binary paths. Net result: a brand-new `Galliard7/freetcode` repo with **clean single-commit history** (no `problems.json` in history), the old `opencode` repo set **private** (its history no longer public), GitHub Pages **live and verified** (HTTP 200, serving FreetCode) at galliard7.github.io/freetcode/, a full local history backup bundle, and a handoff doc (`HANDOFF-KV-migration.md`) teeing up the KV migration + an Arrows architecture diagram for the next session.

---
**Decisions:** AGPL-3.0 as the legal moat; per-problem KV serving (V1) as the technical hurdle, server-side judging (V2) explicitly rejected; rename OpenCode→FreetCode; preserve live `opencode-stats` infra naming; fresh clean-history repo over in-place history rewrite; branch-based Pages over Actions deploy.
**Progress:** Renamed across 69 files; AGPL license + SPDX headers added; new public `freetcode` repo pushed with clean history; old repo made private; Pages live & verified; history backup bundled; KV-migration handoff written.
**Blocked:** KV migration itself deferred to next session (needs Cloudflare/wrangler auth); old `opencode` repo only private, not hard-deleted (token lacks `delete_repo` scope); final `problems.json` history scrub must happen at the end of the KV cutover.
**Content-worthy?:** Yes — "I almost named my free coding tool after a 160k-star project with the same name — here's the open-source release-hardening checklist (AGPL vs minification in the AI era, and why obscurity is the real risk)."

## 2026-06-15 — The Tutor Returns, This Time Inside Your Browser

`#milestone` `#decision` `#pivot`

This started as a feasibility question — "how viable is a lightweight LLM to tutor FreetCode, hosted as it is on GitHub Pages?" — and the hosting constraint answered it: Pages serves static files and can't run inference or safely hold an API key, so the model has to run **either in the user's browser or behind the Cloudflare Worker we already have**. I costed the API path and it dies fast: free LLM tiers (Workers AI ~100–200 responses/day, Groq ~260) are exhausted at **~40–60 daily users**, and the real hazard is an anonymous `/tutor` endpoint becoming a free-GPU faucet for abusers. The user then pushed on the genuinely interesting fork — *build* a tiny model (nanoGPT/Karpathy) vs *run* a small pretrained one. I had to be blunt: from-scratch is a dead end for a tutor (a hobbyist nanoGPT tops out around GPT-2-124M quality, which can't reason about why your code is O(n²)). The move is a small **pretrained instruct model run client-side via WebLLM on WebGPU** — Qwen2.5-Coder-1.5B (~1 GB) — which doesn't *improve* the cost/abuse table so much as **delete it**: inference is the user's GPU, so there's no per-call cost, no rate limit, no key, and nothing to abuse. The clincher came from our own history: FreetCode *had* a tutor — a Gemini chat that made users paste their own API key — removed on 2026-05-24 (`c178e76`) precisely because a free, no-login app demanding a key is a contradiction. Client-side removes the exact friction that killed v1, and the old chat-panel UI plus its `buildAIContext` grounding were sitting in git history to salvage.

The load-bearing product decision was the user's, and they reversed my instinct on it. I'd designed a *structural* no-leak guardrail — never show the model the reference solution, so it can't hand it over. They overruled it: a good tutor *knows the answer*, and on a free learning tool with zero cheating incentive, **the model should be given the oracle solution** and kept Socratic by instruction (nudge, minimal examples), not by withholding. That made hints sharper and simplified the design. The rest of the integration: a tiny `window.__oc` bridge exposes the live problem, the editor's current code, and the last judge verdict to a standalone `tutor.js`; the panel is strictly opt-in behind a consent gate (nothing downloads until you click Enable), the ~1 GB model is persisted with `navigator.storage.persist()` and removable from Settings, and chat history is kept **per problem** — fresh slate on a new problem, restored when you return — driven by an `oc:problemchange` event I fire from `selectProblem`. We deferred BYOK: once the page holds a real secret, the XSS/supply-chain surface becomes a key-theft surface, a whole checklist for later.

The gotchas were the usual suspects plus one fresh CSS facepalm. The consent modal wouldn't close because `.hidden { display:none }` and `.modal-bg { display:flex }` have equal specificity and **the modal rule came later in the file** — source order won, so `display:flex` always beat it; one `!important` fixed it. "Remove model" looked like it worked but the model kept loading instantly — the official `deleteModelAllInfoInCache` wasn't enough, so removal now sweeps **all of Cache Storage and the WebLLM IndexedDB** and re-checks. And the recurring lesson bit a third time: the user reported "nothing changed, am I testing stale?" — yes, the browser was serving `tutor.js?v=1` from cache under an unchanged URL; the fix is always bumping the `?v=` query, and I now verify the *served* file via the live URL, not just disk.

Two more features and the ship. The user wanted a **scratchpad** to sketch trees and pointers while solving — I prototyped four layouts as ASCII mockups in the picker, we chose lightweight *sketch + notes*, per-problem, and I built it as an adjustable editor split (`.editor-row` flex; Monaco's `automaticLayout:true` means it reflows itself when the canvas shrinks it). Strokes are stored as **normalized vectors**, not a flattened image, so they rescale cleanly on resize and restore crisply. Then the header got crowded (seven controls), so — four prototypes again — we moved Description/Hints/Visualizer/Scratch/Tutor off it into a **right icon rail** (a third grid column placed with `grid-column: -2 / -1`, so it's the last column on both the 3-column desktop and 2-column mobile grids), keeping the header to Theme/Stats/Settings. The trick that made the move trivial: **relocate the buttons but keep their `id`s**, so every existing handler kept working untouched. Shipped `feat/tutor-webllm` → `main`, watched the Pages deploy go green, and verified the live site. The one production fragility I'd flagged got closed last: WebLLM was importing from `esm.run` **unpinned** (always latest), so an upstream release could silently break the live tutor — pinned to `@0.2.84` after confirming all four model IDs exist in that exact bundle (it was current-latest, so byte-identical to what was already running). ADR 0003 documents the decision and is marked Accepted.

---
**Decisions:** client-side tiny model (WebLLM+WebGPU, Qwen2.5-Coder-1.5B) over off-the-shelf API (cost/abuse) and over from-scratch nanoGPT (can't tutor); strictly opt-in/consent-gated, persisted via `storage.persist()`, removable; **give the model the oracle solution** + Socratic-by-instruction (reversed my withhold-the-answer guardrail — leakage deprioritized on a free learning tool); salvage the removed v1 chat panel + grounding; per-problem chat + scratchpad via `oc:problemchange`; lightweight sketch+notes scratchpad with normalized-vector strokes; right icon rail (3rd grid col `-2/-1`) keeping button `id`s so handlers survive; BYOK deferred (secret-on-page security burden); pin WebLLM `@0.2.84`
**Progress:** Shipped `feat/tutor-webllm`→`main` (`568506f`), live at galliard7.github.io/freetcode; new `tutor.js`/`tutor.css`/`scratch.js`/`scratch.css` + ADR 0003 (Accepted); header slimmed to Theme/Stats/Settings; WebLLM pinned `@0.2.84` (`0463b83`); MC card mc-326
**Blocked:** —
**Content-worthy?:** Yes — "I put a coding tutor on a *static* GitHub Pages site with no server, no API key, and $0 inference: a 1.5B code model (WebLLM + WebGPU) that downloads once (~1GB, opt-in) and runs entirely on the user's GPU. The version we *removed* a month earlier failed because it asked users for a Gemini key — moving inference into the browser deleted the exact friction that killed it, and collapsed the whole cost/abuse/rate-limit table to zero."

## 2026-06-09 — The Judge: a Real Submit, a Stats Backend, and Promoting v2 to Main

`#milestone` `#decision` `#pivot` `#blocker`

This started as a one-line question — "can I deploy a separate GitHub Pages from a branch without affecting the live one?" The honest answer reframed everything: GitHub Pages publishes **one site per repo**, so two parallel branch-sites is impossible. We went with a **`v2/` subfolder** instead (served at `…/freetcode/v2/`, a self-contained copy), which let us build a major overhaul beside the live app with zero risk, then promote it. I ran `/grill-with-docs` and resolved the whole design tree before writing code. The keystone decisions: split **Run** (fast, unjudged scratchpad) from **Submit** (graded), with green/red verdicts only on Submit; use the per-problem reference `solution` as the **oracle** and compare by *return value* with per-problem normalization (the "smart compare" — because Two Sum's `[0,1]` and `[1,0]` are both correct and naive stdout-matching would false-fail); detect "too slow" by **relative slowdown vs the reference on the same machine**, not absolute time limits (Pyodide is device-dependent — a number like "2s" is meaningless across a laptop and a phone); and the load-bearing one — move Pyodide into a **Web Worker** so a runaway loop can be killed by `worker.terminate()`. That last choice was forced by a real constraint I had to discover: the clean way to interrupt Python needs `SharedArrayBuffer`, which needs COOP/COEP headers, which **GitHub Pages cannot set**. Terminate-and-respawn is the only option, and it doubles as the TLE signal. Wrote two ADRs for the worker and the external-backend decisions.

Phases 1–2 (engine + judging) went in clean: `worker.js` hosts Pyodide and an embedded Python judging harness; `pyengine.js` owns the worker with a timeout→terminate→respawn loop; `judge.js` formats verdicts. I validated the harness logic by **extracting the embedded Python and running it under system `python3`** before ever touching a browser — confirmed a correct hashmap Two Sum passes, a wrong answer fails with diffs, and a brute-force O(n²) clocks **316× slower** (the exact signal we want). The user caught a sharp bug live: submitting *while the reference solution is shown* marked the problem solved — peeking shouldn't earn a completion. Fixed so Submit-while-reviewing still judges (useful for testing) but never records. Phases 3–4 added the data layer: a **Cloudflare Worker + D1** (`/event`, `/stats`, `/leaderboard`, `/score`), an anonymous client UUID, a public dashboard, and an arcade **AAA** leaderboard. The design insight that ties stats together: a single user spamming Submit must not skew anything, so we **never delete attempts** — we just *aggregate per-person* (best-ratio-per-client for the distribution, distinct-client solve rate, **first-try %**, **median tries-to-solve**). "Beats X%" stays a synthetic estimate until a problem has **100 distinct solvers** (bumped from 50), then switches to the real crowd distribution.

Then a second `/grill-me` round sharpened the benchmark itself. The user noticed identical code scoring `0.86×`/`0.87×` — that's **ordering/warm-up bias** (I timed the reference first, so the second-timed run benefits from warm caches) plus raw single-shot jitter. Fix: **warm-up run + best-of-3 taking the min** (min is the right estimator — noise only ever *adds* time). We went further than I'd have recommended: a **multi-size growth curve** (3 sizes, ~16× span) that fits the log-log slope to print an inferred Big-O *relative to optimal* ("≈ O(n²) — grows faster than optimal's O(n)"), plus **peak-memory via `tracemalloc`** for a space ratio (args built *before* measuring so we capture auxiliary space, not the input), and the arcade board now ranks on a **composite = geometric mean of time and space ratios**. The honest caveat I made sure to state: LeetCode's own runtime percentile is famously noisy — we're being *more* rigorous than the thing we're imitating.

Two gotchas worth remembering. First, a confusing-looking `engine.judgeBench is not a function` error mid-test turned out to be pure **browser caching** of the old `pyengine.js` — fixed by appending `?v=N` cache-busting to every local asset (including the worker URL, which browsers also cache). Second, and the big environmental one: **my sandboxed Bash cannot complete outbound TLS** — system `curl` (LibreSSL 3.3.6) fails the handshake even to valid Cloudflare IPs — but **Node, `git push`, and `wrangler` all work fine** because they use their own TLS stacks. So once I realized that, I could run the deploys myself instead of handing every command to the user. We shipped the promotion: tagged the old app **`v1.0`** as a rollback point, moved `v2/*` to root on a branch, merged to main (`7a92313`), flipped `ENV` to `prod`, redeployed the Worker, and reset the D1. Final touch after the user (correctly) worried about it: a **dev-env guard** — `stats.js` writes to a `dev` bucket on `localhost`/`file://` so local testing never pollutes prod — which also required teaching the backend's `normEnv` to *accept* `dev` (it was silently coercing anything non-`v2` back to `prod`, which would have defeated the guard). Verified live: a `dev` event lands in `dev`, prod stays at `distinct: 0`.

---
**Decisions:** `v2/` subfolder over impossible parallel branch-sites; Run (unjudged) vs Submit (graded); reference-solution oracle + return-value smart compare; relative-slowdown TLE over absolute limits; Pyodide-in-Web-Worker with terminate-timeout (SharedArrayBuffer impossible on Pages); warm-up + best-of-3 min timing; multi-N growth curve for Big-O; tracemalloc space ratio; composite (geomean time+space) drives percentile + arcade board; per-person spam-proof metrics (never delete attempts); unlock at 100 distinct solvers; Cloudflare Workers+D1 backend; dev-env guard for local
**Progress:** Shipped end-to-end and promoted v2→main (`262ef6f`→`cece53d`); old app tagged `v1.0`; Worker deployed (`f172dc55`) + D1 reset; new files `worker.js`/`pyengine.js`/`judge.js`/`stats.js`/`dashboard.html` + `backend/` + `CONTEXT.md` + 2 ADRs; 6 problems seeded with scaled generators (rest fall back to sample-only)
**Blocked:** ~267 problems still need scaled generators for the stress tier; sandboxed Bash can't do TLS via system curl (use Node/wrangler/git instead)
**Content-worthy?:** Yes — "I built a LeetCode-style judge on a *static* GitHub Pages site. The constraints forced better engineering than LeetCode itself: Pyodide in a Web Worker (because you can't set COOP/COEP headers to get SharedArrayBuffer, so you kill runaway code by terminating the worker), device-fair benchmarking via *relative* slowdown vs the reference instead of meaningless absolute time limits, warm-up + best-of-min timing, and a multi-size growth curve that prints your actual Big-O. LeetCode's own runtime percentile is noisier than this."

## 2026-05-31 — From 150 to 265: Curated-List Tags and a Small Army of Generators

`#milestone` `#decision`

The ask: take an interview-prep PDF ("Algorithms & Data Structures," 101 pages) and make sure every LeetCode problem it references lives on the platform, plus add tags for Blind 75, NeetCode 150, "and whatever other popular selections make sense." I ran `/grill-me` to pin the decision tree before touching anything, and the research turned up the key fact that reframed the whole job: **the platform already *is* NeetCode 150** — 150 problems in exact NeetCode roadmap categories. So tagging wasn't from zero, and Blind 75 is a near-subset (the one exception is LC 377 Combination Sum IV, dropped from NeetCode 150 but in the original Blind 75 — I chose to add it so the Blind 75 filter shows a true 75/75 rather than 74). Grilling locked: a *superset* scope (platform = existing ∪ chosen lists ∪ PDF gaps), full rich entries for everything new (matching the existing template + annotated-solution + hints + complexity schema, not stubs), a separate `lists[]` field rather than polluting the topic-`tags` array, collection-pill filter UI, and an execute-every-solution quality gate.

A sub-agent pulled the four canonical lists from static GitHub mirrors (LeetCode/grind75 are JS SPAs that WebFetch can't read) and cross-checked counts, computing the exact gap: **115 new problems** (114 from Grind 75 / Top Interview 150 / PDF, + 377). I assigned each a platform category deterministically up front so the parallel generators couldn't drift, then fanned out **8 background agents**, each generating ~16 full entries and — the important part — writing a checker that executes every `solution` and `alt_solution` against embedded `# Expected:` comments, making nondeterministic outputs stable (sort permutations, derive a boolean for "any valid answer" problems) before emitting. All 8 came back clean. Merge validated to 273 entries (265 real + 8 Learn cards) with list totals landing exactly on 75 / 150 / 75 / 150. My own 2–4-tag rule caught 7 problems the agents gave a single tag; I added accurate second tags (e.g. N-Queens II → +Recursion, per the existing backtracking convention) and accepted genuinely single-concept ones (172, 58).

The recurring gotcha this session was the tool-I/O channel itself: early on, Bash/WebSearch/AskUserQuestion calls came back *empty*, then all landed at once a few turns later — the known cc-remote approval-bridge lag. I treated every empty result as UNKNOWN rather than success, re-issued, and verified state on disk, which is the only reason the merge math is trustworthy. Final verification ran all 359 code blocks (265 solutions + 34 alternates) under CPython: **zero execution failures**. Fifteen "expected-output mismatches" all turned out to be checker artifacts — the string-quote convention (`"BANC"` comment vs `BANC` stdout, which the existing problem 76 already does), unordered output, and intentionally-empty expected lines — confirmed by spot-checking 14, 179, and the pre-existing 76. A local Playwright smoke test against a served copy came back all-green: 273 items, five pills with correct live counts, filtering + search composing, new problems selectable with descriptions and tags. Shipped via fast-forward merge to `main` (`391f374..262ef6f`); Pages is rebuilding now.

---
**Decisions:** superset scope (existing ∪ lists ∪ PDF gaps); separate `lists[]` field, not mixed into topic `tags`; full rich entries for all 115 new (no stubs); added LC 377 so Blind 75 = 75/75; deterministic pre-assigned categories to keep 8 parallel generators consistent; execute-every-solution verification gate
**Progress:** 115 new problems generated + verified; existing 150 tagged; problems.json 150→265 (273 incl. Learn cards); collection-pill filter UI built (composes with search); list coverage complete 75/150/75/150; local Playwright smoke test all-green; committed + pushed to main, Pages deploying
**Blocked:** —
**Content-worthy?:** Yes — "I 8x'd a LeetCode platform's problem set by fanning out 8 background agents, each of which had to *execute* every solution it wrote against test cases before emitting it. Verification gate caught the difference between 'looks right' and 'is right' — and the 'failures' my final sweep flagged were all my own checker being naive about string quotes."

## 2026-05-31 — Four Skins and a Logo That Wouldn't Sit Still

`#milestone` `#decision`

The brief was open-ended: "look at different design skins for the platform." FreetCode had been wearing the first dark-IDE look I ever spun up — generic near-black, indigo `#6366f1`, Inter + JetBrains Mono — and the user wanted to see alternatives before committing. I asked two scoping questions up front (which directions, what fidelity) instead of guessing, and we landed on four directions as *static* mockups first: Refined Dark (the current look, leveled up), Brutalist Terminal (mono everything, hard borders, scanlines, terminal-green), Glassy SaaS (aurora background through frosted glass, violet→fuchsia→cyan), and Warm Paper (light editorial, Fraunces serif, terracotta, cream). I pulled real data from `problems.json` (Two Sum, the NeetCode category grouping, the 158-problem difficulty split) so the mockups were judged on aesthetics, not lorem. Built a gallery `index.html` and Playwright-screenshotted all four — and hit the recurring gotcha that `playwright` only resolves from the project's own `node_modules`, so the shot script has to run from the repo root, not `/tmp`.

The user liked all four and asked to make them switchable in the real app. Key architecture call: drive everything off `html[data-theme]` with a single new `themes.css`, leaving the variable-heavy `style.css` almost untouched so rollback is trivial. Each skin is mostly a CSS-variable swap, but the three non-default ones needed structural overrides too — radius→0 + mono UI + scanlines for Brutalist, `backdrop-filter` glass + an aurora `body::before` for Glassy, Fraunces serif titles + soft shadows + light syntax tokens for Warm. Monaco gets its own per-skin theme (`oc-dark/brutal/glass/warm`), including a genuine *light* editor for Warm. A pre-paint script in `<head>` reads `localStorage` before first render so there's no flash-of-wrong-skin.

Two pointed pieces of feedback shaped the rest. First: "the logo looks different on each one — I don't want that." Right — in the mockups I'd let the logo restyle per theme. So I brand-locked it in `style.css` with `!important` (fixed indigo→violet gradient mark, fixed size/radius/font); only the wordmark *text color* follows `--fg-strong` so it stays legible on the cream skin. Second: "I don't want to go into settings to switch — make it a toggle on the page, like a dark-mode toggle that cycles." Added a header button next to Hints that cycles Dark → Terminal → Glassy → Paper, with a dot that recolors and a label that updates; kept the settings swatch picker as a direct-select fallback.

The deploy had a twist worth recording. The user refreshed the live Pages link and saw nothing — because nothing was committed (I don't commit without being asked). When they green-lit publishing, I started a fast-forward merge to `main`… and the branch math surprised me: this `qa-swarm-kb` branch had *removed* the AI tutor (commit `c178e76`) and was actually the parent of `origin/main`, not behind it. The "divergence" I feared wasn't real — `origin/main` had zero commits this branch lacked. Fast-forwarded clean, pushed `c178e76..391f374`, and the Pages deploy workflow kicked off and succeeded. All four skins are now live at galliard7.github.io/freetcode/.

---
**Decisions:** `html[data-theme]` + isolated `themes.css` (style.css untouched for easy rollback); logo brand-locked with `!important`, only wordmark color themable; on-page header cycle toggle as primary control + settings picker as fallback; per-skin Monaco themes incl. light editor for Warm; no-flash pre-paint theme init
**Progress:** 4 static mockups built + screenshotted; all 4 wired into the live app as switchable themes; committed and pushed to main; GitHub Pages deploy succeeded — live
**Blocked:** —
**Content-worthy?:** Yes — "I built 4 complete UI skins as swappable themes off a single `data-theme` attribute — the trick was locking the logo so the brand stays constant while everything else transforms. Also: the 'flash of wrong theme' fix is 4 lines in `<head>`."

## 2026-05-30 — QA Swarm Found Zero Bugs (And That Was the Point)

`#milestone` `#decision` `#pivot`

Used FreetCode as the live test case for refining my generic `/qa-swarm` skill. Spent the first half grilling the skill's design tree, the second half running it for real against the deployed Pages site, and the result was the most useful "zero bugs" report I've gotten — because the bug it found was in my *testing methodology*, not the app.

The grill resolved a stack of decisions: discovery had to learn a UI-interaction mode for state-driven SPAs (FreetCode has no routes/auth/API — features are user actions, not URLs); target the deployed site but warn on working-tree drift; write a *shared harness* first so the parallel agents don't each reinvent browser boot and drift on selectors; auto-detect harness language (JS here — Python Playwright wasn't even installed, but Node was, and the repo already had JS test files); mine those existing tests for verified selectors; deterministic waits instead of random human-pacing sleeps; evidence-gated verdicts (no assertion → auto-SKIP); a persistent `QA-KNOWLEDGE.md` that accumulates and self-heals across runs; and Sonnet leaf agents under an Opus orchestrator since the harness does the hard part.

Mining the existing tests immediately paid off — and surprised me: they tested a `#chat-panel` / `#api-key-input` AI tutor I'd ripped out on 2026-05-24. Stale selectors, exactly the drift the skill is supposed to self-heal. The live run came back 75 PASS / 2 FAIL / 0 SKIP, clean security (XSS inert), zero console errors. Both FAILs dissolved under scrutiny: "clear-output isn't blank" is intentional (it restores a placeholder), and "browser-back blanks the app" is by-design for a no-router SPA. Then two *latent* suspects that had passed loosely — a rapid problem-switch "race" and an `Alt+Arrow` nav "jump." I wrote strict repros for both. The Alt+Arrow jump (#1→#36) was me misreading display order — the sidebar is NeetCode category-grouped, not numeric, so #36 (Valid Sudoku) really is Two Sum's neighbor. The rapid-switch race evaporated when I tested it honestly: firing un-awaited concurrent Playwright clicks creates a race in *Playwright's* action queue, not the app. Sequential-awaited clicks and a synchronous DOM click-burst both show the last click wins (`selectProblem` is synchronous).

The real find was the skill's own weakness: an agent had asserted `title.length > 0` ("is there any title?") instead of `title.includes('4.')` ("is it the title the scenario predicted?"). The weak proxy passed the evidence gate while hiding the very thing it was sent to check. Added a "specific-value rule" to the skill — every assertion must encode the scenario's specific predicted value, never a weaker stand-in. Packaged the skill into my `~/skills` repo (`qa-swarm/SKILL.md`) and committed the KB into FreetCode, each on its own branch, then pushed.

---
**Decisions:** shared-harness-first + evidence gates + specific-value assertions; deployed-with-drift-warning targeting; persistent self-healing KB; Sonnet agents / Opus orchestrator
**Progress:** qa-swarm skill rewritten, run end-to-end on FreetCode, first QA-KNOWLEDGE.md generated; skill packaged to ~/skills and KB committed (both pushed)
**Blocked:** —
**Content-worthy?:** Yes — 'a QA swarm that found zero app bugs but caught its own loose-assertion blind spot; why "the last click won" only looked broken because the test fired concurrent un-awaited clicks'

---

## 2026-05-24 — Save Solutions Locally + Kill the AI Tutor

`#decision` `#milestone`

I wanted users to be able to save their work on problems and come back to it later. The constraint: GitHub Pages is static, no backend, no logins. localStorage was the obvious choice — it's per-browser but that's fine for a personal study tool.

Built auto-save with an 800ms debounce on editor changes. When you select a problem, it loads your saved code instead of the template. Added a pencil indicator in the sidebar so you can see at a glance which problems you've worked on. A reset button lets you go back to the template. The settings gear got repurposed into a data management modal with export/import (JSON) so you can back up your solutions or transfer between browsers.

Also ripped out the AI Tutor feature entirely — the chat panel, Gemini API key handling, all of it. It required users to bring their own Google AI Studio key and called Gemma 3 27B. The friction wasn't worth it for something that wasn't adding clear value yet. Cleaner to remove it now and potentially revisit with a better approach later.

---
**Decisions:** localStorage for persistence (no backend needed); remove AI tutor rather than iterate on it
**Progress:** solution saving shipped and deployed to GitHub Pages
**Blocked:** —
**Content-worthy?:** Yes — 'building a useful study tool on pure GitHub Pages with zero backend'

---

## 2026-05-07 — Multiple Solutions Per Problem

`#milestone`

Added alternate solutions to the problem data model. Each problem can now have a primary solution plus multiple `alt_solutions`, each with its own label (e.g., "Floyd's Fast/Slow" vs "Hash Set"). Built a dropdown picker in the toolbar so you can browse different approaches. Each solution can carry its own time/space complexity.

The dropdown needed two rounds of fixing — first pass used absolute positioning which got clipped by overflow:hidden parents on mobile. Switched to fixed positioning with manual rect calculation. Also changed from generic "Primary / Alt 1" labels to the actual approach names, which is much more useful for learning.

---
**Decisions:** solution picker as dropdown off the toolbar rather than tabs; fixed positioning for the dropdown to avoid mobile clipping
**Progress:** multi-solution UI shipped; approach labels visible in dropdown
**Blocked:** —
**Content-worthy?:** No

---

## 2026-05-06 — Problem Descriptions

`#milestone`

Added problem descriptions with a toggleable panel. Wrote a lightweight markdown-to-HTML renderer inline (handles code blocks, inline code, bold, ordered/unordered lists). The description panel sits above the editor with a max-height of 45% so it doesn't eat the whole screen.

---
**Decisions:** inline markdown renderer rather than pulling in a library; description panel as collapsible overlay above editor
**Progress:** descriptions visible for all problems
**Blocked:** —
**Content-worthy?:** No

---

## 2026-05-05 — Polish and Algorithm References

`#milestone`

Big polish day. Added 8 algorithm reference entries (DFS, BFS, Binary Search, Two Pointers, Sliding Window, Backtracking, DP, Heap) — these are learn-first implementations, not interview problems. Each links to the relevant visualizer.

Fixed a bunch of UX issues: Pyodide loading was invisible on mobile (added a visible banner with spinner + error recovery + retry), algorithm templates were accidentally shipping full solutions instead of skeletons with `pass`, binary search visualizer got upgraded to a 20-element array with per-iteration step granularity.

Also added sidebar loading state, gitignored test/npm artifacts, upgraded Pyodide to v0.27.4, and made the logo a home link.

---
**Decisions:** algorithm references as a separate "Algorithms" category at the top of the sidebar; Pyodide v0.27.4
**Progress:** platform feels production-ready for personal use
**Blocked:** —
**Content-worthy?:** Yes — 'the UX details that make a study tool actually usable vs abandoned'

---

## 2026-05-04 — Project Born

`#milestone`

Built FreetCode from scratch in a single evening. The goal: a free, open-source algorithm interview prep platform — NeetCode-style problem set with an in-browser Python editor, no login, no paywall. Deployed on GitHub Pages.

The stack is deliberately minimal: single `index.html` with inline JS, `style.css`, `problems.json` for the problem bank, Monaco editor for code editing, Pyodide for in-browser Python execution, and 6 algorithm visualizers (DFS, BFS, binary search, two pointers, sliding window, backtracking). No build step, no framework, no bundler.

The initial version included an AI tutor chat panel powered by Gemma 3 27B via Google AI Studio (user brings their own API key), a benchmark engine to compare user solutions against reference solutions, and mobile-responsive layout with slide-over sidebar and full-screen chat on phones.

GitHub Pages deployment was set up via a workflow on the same day. The site was live within hours of starting.

---
**Decisions:** zero-framework static site (no React, no build step); Pyodide for client-side Python; Monaco for the editor; GitHub Pages for hosting; user-provided API key for AI features
**Progress:** full platform launched — 150 problems, 6 visualizers, editor, benchmark, AI tutor, mobile responsive
**Blocked:** —
**Content-worthy?:** Yes — 'built a full interview prep platform in one evening with zero backend'

---
