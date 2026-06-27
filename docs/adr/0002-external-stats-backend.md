# 0002 — External anonymous stats backend (Cloudflare Workers + D1)

Status: Accepted · v2

## Context

We want lightweight, anonymous stats on Submits — pass rates, popularity, and a real
"Beats X%" runtime distribution — plus a public dashboard and an arcade leaderboard.
The app is hosted on GitHub Pages, which serves **static files only** and cannot store
or aggregate data. Any collection therefore requires an external service.

A core property of v1 was being **100% static and fork-and-run** — clone it, open it,
done, no backend. Adding a data layer ends that property for the hosted instance.

## Decision

Stand up a small **Cloudflare Worker + D1 (SQLite)** service, separate from Pages:

- `POST /event` — record one anonymous Submit (problem, verdict, slowdown ratio,
  anon client id, env). Rate-limited per IP.
- `GET /stats`, `GET /percentile`, `GET /leaderboard`, `POST /score` — reads for the
  dashboard / board, plus arcade score submission.

Identity is a random UUID in `localStorage` (pseudonymous, no login, no PII). Each
client contributes **one best result per problem** (`best_ratio` table, unique on
problem+client+env), so resubmitting can't inflate counts or skew the distribution.
The real percentile is withheld until a problem has ≥50 distinct clients; below that,
an estimate is shown. Rows are tagged with an **env** (`v2` while testing) so dev data
never pollutes production aggregates.

## Consequences

- The hosted app now depends on an external service the maintainer owns and deploys.
  Forks still run fully (the app degrades gracefully when the endpoint is absent —
  Submit still judges and benchmarks locally; only stats/board go quiet).
- Free tier covers our scale; CORS and per-IP rate-limiting are first-class on Workers.
- Anti-spoofing is best-effort: clearing localStorage / incognito can mint new ids. A
  hashed-IP-per-day signal blunts it; we accept the residual hole (a free learning app
  has ~zero cheating incentive).

## Alternatives rejected

- **Supabase / Postgres** — more power than needed; heavier setup; anon writes need
  careful row-level security.
- **Google Apps Script + Sheet** — zero infra but slow, rate-limited, fragile, poor for
  a public dashboard.
- **Stay fully static** — keeps fork-and-run but makes the requested stats impossible.
