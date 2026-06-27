# FreetCode v2 — Context & Glossary

A glossary of the domain language used in FreetCode v2. Terms here have precise,
agreed meanings — use them consistently in code, UI copy, and discussion. This
file holds *language*, not implementation.

## Core actions

- **Run** — *Unjudged* execution. A scratchpad: it executes the user's code and
  shows printed output. It renders **no** correctness verdict. Fast; for iterating.
- **Submit** — *Judged* execution. Produces a correctness **verdict**, a scaled
  **stress test**, and a **benchmark**, and (when the data layer is live) records
  one anonymous **stat**. Pass/fail messaging belongs to Submit only — never Run.

## Judging

- **Oracle** — The per-problem reference solution, treated as ground truth.
  Submit runs it to produce the expected answer for any input, including large
  random ones the user never sees.
- **Smart compare** — Comparing the user's **return value** to the oracle's with
  per-problem normalization (order-insensitive, set, multiset, float tolerance, or
  an input-aware validator), rather than matching printed text. Prevents a correct
  answer being marked wrong when a problem accepts multiple valid forms.
- **Test spec** — The per-problem judging contract: which method to call (**entry**),
  how to compare (**compare** mode), the **sample** inputs, and a **generator** for
  scaled inputs. A problem without a spec is judged by printed-output comparison and
  has no scaled tier.
- **Sample cases** — The small, visible inputs a Submit always checks.
- **Scaled / stress test** — Judging on a large generated input to expose solutions
  that are correct but inefficient.

## Performance

- **Slowdown ratio** — The user's runtime divided by the oracle's runtime **on the
  same device, same input**. Device-independent (device speed cancels out). The
  fair basis for all speed judgements. ~1.0 means as fast as optimal.
- **Too slow / TLE** — A stress run that exceeds the time cap (the worker is
  terminated). Read as "likely a worse complexity class," not an absolute time limit.
- **Timing method** — Each measurement is a warm-up run (untimed) followed by the
  **min of several timed runs** (min = the least-perturbed estimate of true compute).
- **Growth curve / Big-O estimate** — Times measured at several input sizes; the
  log-log slope estimates the complexity class, stated **relative to optimal**
  ("≈ O(n²) — grows faster than optimal's O(n)"). Hedged: few, noisy points.
- **Space ratio** — Peak auxiliary memory (the user's vs the oracle's, via
  `tracemalloc`, input excluded). Surfaced as a **tradeoff**, not a failure.
- **Composite score** — Geometric mean of the time and space ratios (lower = better).
  The single number that drives "Beats X%" and the arcade board.
- **Beats X%** — A percentile over the crowd's **composite-score** distribution.
  Until a problem has enough distinct solvers it is an **estimate** from the oracle.

## Data & identity

- **Stat** — One anonymous record of a Submit. No login, no PII.
- **Anon client** — A pseudonymous random identifier kept in the browser. Used to
  count **distinct solvers** and to keep only each solver's **best** result, so
  resubmitting can't skew the stats.
- **Unlock** — The point at which a problem has enough distinct solvers for the real
  (non-estimated) "Beats X%" to apply.
- **Arcade board** — A per-problem high-score table of 3-letter initials, ranked by
  best **composite score**, that churns freely as new scores arrive.

## Difficulty signals (spam-resistant, per-person)

- **Submissions** — Raw volume; counts every retry (a learner's grind is preserved).
- **Solve rate** — Distinct people who solved ÷ distinct people who tried.
- **First-try %** — Share of people whose *first-ever* submission passed (only the
  first counts → spam-proof).
- **Median tries-to-solve** — Median submissions-before-solving among solvers (median
  ignores a spammer's outlier).
