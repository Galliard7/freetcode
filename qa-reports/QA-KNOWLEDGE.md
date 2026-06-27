---
app: FreetCode
target: https://galliard7.github.io/freetcode/
last_run: 2026-05-31T16:20:00-05:00
last_run_report: qa-reports/2026-05-31/qa-report-2026-05-31-1620.md
---

# QA Knowledge Base — FreetCode

Living memory for `/qa-swarm`. Seed future runs from here, validate selectors live, regression-diff against Last-Run Status.

## App Model
- **State-driven SPA**, single `index.html` + `style.css` + `themes.css`. No routes, no backend, no auth, no client router.
- Persistence: `localStorage` (per-browser). In-browser Python via **Pyodide**; code editor is **Monaco**.
- Served from **GitHub Pages** (`galliard7.github.io/freetcode/`); deployed = last pushed commit. Warn on unpushed working-tree drift.
- No `popstate`/`history`/`hashchange` handling — browser Back leaves the app to `about:blank` (by design).
- **Multi-theme** (4 skins) applied via `data-theme` on `<html>`, restored pre-paint to avoid flash.

## Feature Map
| Area | What it does | Key user actions |
|---|---|---|
| Sidebar / nav | 19 categories, **273 problems** (8 Algorithms w/ negative `data-num` + 265 num>0 NeetCode-style), search, progress | select problem, search-filter, Alt+Arrow nav, mobile hamburger |
| **Collection filter** (NEW) | 5 collection pills filter the problem list by `problem.lists` membership | click pill (all/blind75/neetcode150/grind75/top150); composes with search |
| Editor / exec | Monaco editor, Pyodide run, output, benchmark, reset, autosave | edit (autosaves 800ms), Run, Clear, Reset, Benchmark |
| Problem detail | title/difficulty/tags, description, hints, solution reveal+picker, complexity, mark-solved | toggle desc/hints, reveal solution, pick approach, mark solved |
| Visualizer | step-through algorithm animation (Algorithms problems only, 8 of them) | open viz, play/step/back/reset, speed, close |
| **Theme switcher** (NEW) | 4 themes; header quick-cycle + picker in Settings; syncs Monaco theme + `meta[theme-color]` | click `#theme-cycle` (cycles), pick a `.theme-swatch` in Settings |
| Settings / data | data-management modal (export/import/clear solutions), stats, + Appearance theme picker | export JSON, import file, clear-all (native confirm), pick theme |

## Verified Selectors (confirmed 2026-05-31, live)
- Core: `#app`, `#editor .monaco-editor` (Monaco), `#run-btn` (enabled when Pyodide ready), `#output`, `#clear-output`, `#reset-code`, `#benchmark-btn`, `#py-loading-banner`
- Sidebar: `#sidebar`, `#problem-list`, `.category-header` (19), `.problem-item[data-num="N"]` (273), `#problem-search`, `#sidebar-toggle`, `#sidebar-backdrop`, `#progress-count`, `#progress-fill`
- **Collection pills (NEW):** `#collection-filter`, `.collection-pill[data-coll="ID"]`, `.collection-pill.active`, `.collection-pill-count`. IDs: `all`, `blind75`, `neetcode150`, `grind75`, `top150`
- **Theme (NEW):** `#theme-cycle` (header quick-cycle btn), `#theme-cycle-label` (shows short name), `#theme-picker` (lives INSIDE `#settings-modal`), `.theme-swatch[data-theme="T"]` (4), `.theme-swatch.active`. Themes: `refined-dark`/`brutalist`/`glassy`/`warm`
- Detail: `#current-problem-title`, `#current-difficulty`, `#current-tags .tag`, `#desc-toggle/#desc-panel/#desc-content/#desc-close`, `#hints-toggle`, `#mark-solved`
- Solutions: `#solution-toggle`, **`#solution-picker-arrow`** (opens dropdown, not `#solution-picker`), `#solution-dropdown` (`.show`), `.solution-dropdown-item`, `#complexity-bar`, `#complexity-time/#complexity-space` (visible only while solution shown)
- Visualizer: `#viz-btn` (only on Algorithms/negative-`data-num` problems), `#viz-overlay/#viz-title/#viz-step-label/#viz-play/#viz-back/#viz-forward/#viz-reset/#viz-speed (range, max 2000)/#viz-close`
- Settings: `#settings-btn/#settings-modal (.show + display:flex)/#settings-close/#settings-stats`, `#export-solutions`, `#export-progress`, `#import-solutions/#import-file-input`, `#clear-all-solutions` (native `window.confirm`)
- localStorage keys: `freetcode_current`, `freetcode_solved` (JSON array), `freetcode_user_solutions` (JSON map), **`freetcode_theme`** (NEW, theme name string)

## Behavior Notes (gotchas for test authors)
- Autosave debounce = **800ms** — wait it out before asserting `freetcode_user_solutions`.
- `clearOutput()` restores the placeholder *"Press ▶ Run or ⌘+Enter…"* — output is never truly empty after Clear. Assert the placeholder, NOT emptiness.
- Hints render **into `#output`** (💡 Hints + `<details>`), not a dedicated panel.
- Complexity bar only renders while a solution is revealed. Two Sum = O(n) time / O(n) space.
- `#viz-btn` is gated to Algorithms-category problems (negative `data-num`); the 265 num>0 problems have no visualizer. `#viz-speed` is a range input max=2000.
- Clear-all = native browser `window.confirm()` → use `page.on('dialog')`. `#confirm-modal` is for the solution-replace flow, not clear-all.
- Range inputs (`#viz-speed`): Playwright `fill()` fails — set `.value` + dispatch `input`/`change` via `evaluate()`.
- Mobile: sidebar (z-50) overlays backdrop (z-49); sidebar closes via `translateX` off-screen (NOT `display:none`) — assert transform, not visibility-by-display.
- **Theme:** `#theme-cycle` advances to next theme each click (wraps 4→1); label `#theme-cycle-label` shows Dark/Terminal/Glassy/Paper. Theme persists to `freetcode_theme`, restored pre-paint on reload. `meta[name=theme-color]` bar colors: refined-dark=`#0b0d12`, brutalist=`#000000`, glassy=`#08060f`, warm=`#f6f1e7`. Picker swatches are inside the Settings modal — open Settings first.
- **Collection counts:** pill BADGE for `all` shows **265** (`num>0`), but selecting `all` RENDERS **273** `.problem-item` (includes 8 negative-`num` algos). Per-collection render counts: blind75=75, neetcode150=150, grind75=75, top150=150. Badge-vs-render mismatch on 'all' is by-design (source: `renderCollectionPills` counts num>0; `renderProblemList` doesn't filter num for 'all').
- Export filenames are exact: `freetcode-solutions.json` (solutions), `freetcode-all-data.json` (solutions+solved).
- **REMOVED feature (keep verifying gone):** AI tutor — `#chat-panel`, `#chat-toggle`, `#api-key-input` no longer exist (re-confirmed absent 2026-05-31).

## Known-Flaky / Suspect Areas
| Area | Symptom | Status |
|---|---|---|
| Rapid problem-switch | Title appeared not to land on last click | **RESOLVED — not a bug.** `selectProblem` is synchronous; last awaited click wins. Re-confirmed 2026-05-31. Click sequentially with `await`, never fire-and-forget. |
| `Alt+Arrow` nav | #1 → #36 "jump" looked non-sequential | **RESOLVED — not a bug.** Navigates by *display order* (sidebar render = NeetCode category grouping), not numeric. Re-confirmed (#1→#36 Valid Sudoku). Don't assert numeric adjacency. |

_No confirmed app bugs as of 2026-05-31. Clean run: 93/93 PASS, 0 console/page errors. Only observation: 'all' pill badge (265) vs rendered count (273) — by-design but potentially confusing; see report._

## Last-Run Status (2026-05-31) — for regression diffing
| Scenario | Agent | Priority | Status | Since |
|---|---|---|---|---|
| monaco-loads (+template) | editor-exec | P1 | PASS | stable |
| run-produces-output (Pyodide) | editor-exec | P1 | PASS | stable |
| autosave write+restore | editor-exec | P1 | PASS | stable |
| reset-code | editor-exec | P2 | PASS | stable |
| clear-output (asserts placeholder) | editor-exec | P3 | PASS | **fixed (was test-FAIL 05-30)** |
| benchmark | editor-exec | P3 | PASS | stable |
| categories render (19) | sidebar-nav | P1 | PASS | stable |
| problems render (273) | sidebar-nav | P1 | PASS | **count 158→273** |
| search filter | sidebar-nav | P1 | PASS | stable |
| problem select updates title+storage | sidebar-nav | P1 | PASS | stable |
| Alt+Arrow nav (display order) | sidebar-nav | P2 | PASS | stable |
| progress counter (0/273) | sidebar-nav | P2 | PASS | stable |
| mobile hamburger/open/close | sidebar-nav | P2 | PASS | stable |
| metadata/desc/hints | problem-detail | P2 | PASS | stable |
| solution reveal + picker (2 approaches) | problem-detail | P2 | PASS | stable |
| complexity bar (O(n)) | problem-detail | P2 | PASS | stable |
| mark-solved persist + sidebar ✓ | problem-detail | P2 | PASS | stable |
| algo problems exist (8) | visualizer | P1 | PASS | stable |
| viz-btn present on algo / absent on neetcode | visualizer | P1 | PASS | stable |
| viz open/step/back/reset/speed/close | visualizer | P2 | PASS | stable |
| settings open/stats/close | settings-data | P2 | PASS | stable |
| export solutions/progress (exact filenames) | settings-data | P2 | PASS | stable |
| import file → localStorage | settings-data | P2 | PASS | stable |
| clear-all confirm cancel/ok | settings-data | P2 | PASS | stable |
| AI-tutor-removed regression | settings-data | P2 | PASS | stable |
| theme default (refined-dark/Dark) | theme-collection | P1 | PASS | **NEW** |
| theme cycle advances + wraps (4) | theme-collection | P1 | PASS | **NEW** |
| theme persists to storage | theme-collection | P1 | PASS | **NEW** |
| theme survives reload | theme-collection | P1 | PASS | **NEW** |
| theme-color meta syncs (warm #f6f1e7) | theme-collection | P2 | PASS | **NEW** |
| theme picker in settings (4 swatches, active) | theme-collection | P2 | PASS | **NEW** |
| collection pills render (5, exact badges) | theme-collection | P1 | PASS | **NEW** |
| filter blind75 (75 items) | theme-collection | P1 | PASS | **NEW** |
| filter neetcode150 (150 items) | theme-collection | P1 | PASS | **NEW** |
| filter all (273 items) | theme-collection | P2 | PASS | **NEW** |
| filter + search compose | theme-collection | P2 | PASS | **NEW** |
| XSS search + editor (inert) | edge-case | P1 | PASS | stable |
| unicode/emoji persist | edge-case | P1 | PASS | stable |
| rapid double-Run | edge-case | P2 | PASS | stable |
| rapid problem-switch (last wins) | edge-case | P2 | PASS | stable |
| refresh mid-edit recovery | edge-case | P1 | PASS | stable |
| browser back (by-design, no router) | edge-case | P2 | PASS | **fixed (was FAIL 05-30)** |
| empty editor run | edge-case | P3 | PASS | stable |
| rapid collection-switch (settles 273) | edge-case | P2 | PASS | **NEW** |
| rapid theme-cycle (5→brutalist) | edge-case | P2 | PASS | **NEW** |
| console/page error sweep (0 errors) | edge-case | P1 | PASS | stable |

## Coverage Gaps / TODO
- Resizer (`#resizer`) panel drag not tested.
- Per-visualizer correctness — only the first Algorithms problem (DFS) stepped; other 7 (BFS/two-pointers/sliding-window/binary-search/backtracking/…) untested for step correctness.
- Benchmark correctness path — only the "mismatch"/stub path exercised, not a real timing comparison.
- `grind75` / `top150` collection rendered-count not directly asserted (badges + blind75/neetcode150 render counts were).
- Theme × Monaco `editor.background` per theme not directly asserted (only `meta[theme-color]`).
- Import malformed/oversized JSON not tested (happy-path only).
