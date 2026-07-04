-- FreetCode stats — D1 schema. Anonymous, env-tagged (v2 = test, prod = live).

-- Raw record of every Submit. ip_day is a salted hash (no raw IP / PII).
CREATE TABLE IF NOT EXISTS events (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  problem INTEGER NOT NULL,
  verdict TEXT    NOT NULL,          -- accepted | wrong | too_slow | error
  ratio   REAL,                      -- slowdown vs optimal (accepted only)
  client  TEXT    NOT NULL,          -- anon UUID
  ip_day  TEXT,                      -- hashed IP+day, soft anti-spoof signal
  env     TEXT    NOT NULL DEFAULT 'prod',
  ts      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_env_problem ON events(env, problem);
-- Recent-activity feed: WHERE env=? ORDER BY ts DESC.
CREATE INDEX IF NOT EXISTS idx_events_env_ts ON events(env, ts);
-- First-try + median-tries stats: correlated lookups on (env, problem, client, ts).
CREATE INDEX IF NOT EXISTS idx_events_env_problem_client_ts ON events(env, problem, client, ts);

-- One row per (client, problem): their BEST slowdown ratio. This is the
-- distribution behind "Beats X%" and the distinct-solver / unlock count.
CREATE TABLE IF NOT EXISTS best_ratio (
  env     TEXT    NOT NULL DEFAULT 'prod',
  problem INTEGER NOT NULL,
  client  TEXT    NOT NULL,
  ratio   REAL    NOT NULL,
  ts      INTEGER NOT NULL,
  PRIMARY KEY (env, problem, client)
);
CREATE INDEX IF NOT EXISTS idx_best_env_problem_ratio ON best_ratio(env, problem, ratio);

-- Arcade AAA high-score table. Churns: pruned to top N per (env, problem).
-- ratio = composite (time+space) score; t_ratio/s_ratio kept for display.
CREATE TABLE IF NOT EXISTS leaderboard (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  env      TEXT    NOT NULL DEFAULT 'prod',
  problem  INTEGER NOT NULL,
  initials TEXT    NOT NULL,
  ratio    REAL    NOT NULL,
  t_ratio  REAL,
  s_ratio  REAL,
  client   TEXT,
  ts       INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_lb_env_problem_ratio ON leaderboard(env, problem, ratio);

-- Opt-in shared tutor chats (ADR 0004): ZERO identifiers by design — no client
-- UUID, no ip_day, nothing linkable across rows. One row per shared exchange
-- snapshot. turns = JSON [{role:'user'|'ai', text, rating?}]; rated counts
-- 👍/👎-carrying replies (cheap corpus filter for eval/fine-tune use).
CREATE TABLE IF NOT EXISTS tutor_chats (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  env       TEXT    NOT NULL DEFAULT 'prod',
  problem   INTEGER NOT NULL,
  user_code TEXT,                        -- the user's code at share time (capped)
  verdict   TEXT,                        -- latest judge verdict at share time
  ratio     REAL,                        -- composite score, if accepted
  turns     TEXT    NOT NULL,            -- JSON array of chat turns (capped)
  rated     INTEGER NOT NULL DEFAULT 0,  -- count of rated replies in turns
  ts        INTEGER NOT NULL
);
-- Corpus reads: WHERE env=? [AND rated>0] ORDER BY ts. (D3)
CREATE INDEX IF NOT EXISTS idx_tutor_env_ts ON tutor_chats(env, ts);

-- Public traffic counters (A4): one row per (env, day, visitor). visitor =
-- the salted daily IP hash (ipDayHash) → true daily uniques, no raw IP,
-- bounded growth (≤ visitors/day rows, never one row per pageview). pv counts
-- that visitor's pageviews that day. The PK doubles as the /traffic covering
-- index (env, day prefix). WITHOUT ROWID: small PK-keyed rows, no autoinc.
CREATE TABLE IF NOT EXISTS visits (
  env     TEXT    NOT NULL DEFAULT 'prod',
  day     TEXT    NOT NULL,              -- YYYY-MM-DD (UTC)
  visitor TEXT    NOT NULL,              -- salted SHA-256(ip+day), 16 hex chars
  pv      INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (env, day, visitor)
) WITHOUT ROWID;
