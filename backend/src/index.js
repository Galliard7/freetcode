// SPDX-License-Identifier: AGPL-3.0-or-later
// FreetCode — Copyright (C) 2026 Galliard7. See LICENSE.

/* ══════════════════════════════════════════════════════════════════
   FreetCode — anonymous stats Worker (Cloudflare Workers + D1)
   Routes:
     POST /event       record a Submit; returns this problem's aggregate
     GET  /stats        per-problem aggregates (dashboard)
     GET  /leaderboard  arcade AAA board for a problem
     POST /score        submit an AAA score
     GET  /             health
   No login, no PII. Rows tagged by env ('v2' = testing, 'prod' = live).
   ══════════════════════════════════════════════════════════════════ */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};
const UNLOCK_AT = 100;    // distinct solvers before real percentile applies
const BOARD_SIZE = 20;    // shown
const BOARD_KEEP = 30;    // retained per problem before prune

// 3-letter combos we refuse on the arcade board.
const BLOCKLIST = new Set([
  'ASS','FUC','FUK','FCK','FUX','SEX','CUM','FAG','NIG','KKK','DIE','GAY',
  'TIT','POO','PEE','WTF','STD','JEW','NAZ','XXX','SUK','DIK','DIC','COC',
  'CNT','TWT','SHT','PIS','BUM','HOE','RAP','GUN','VAG','PEN','FAP','JIZ',
]);

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

// Serve a raw JSON document straight from KV (no re-parse), with edge caching.
async function kvDoc(ns, key, maxAge) {
  if (!ns) return json({ error: 'content store unavailable' }, 503);
  const body = await ns.get(key);
  if (body === null) return json({ error: 'not found' }, 404);
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${maxAge}`, ...CORS },
  });
}

function normEnv(e) { return (e === 'v2' || e === 'dev') ? e : 'prod'; }

function cleanInitials(s) {
  const v = String(s || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
  if (v.length !== 3 || BLOCKLIST.has(v)) return null;
  return v;
}

async function ipDayHash(req) {
  const ip = req.headers.get('CF-Connecting-IP') || '0.0.0.0';
  const day = new Date().toISOString().slice(0, 10);
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('oc|' + ip + '|' + day));
  return [...new Uint8Array(buf)].slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Aggregate for one problem (+ this client's standing if a ratio is given).
async function problemStats(db, env, problem, ratio) {
  const totalRow = await db.prepare(
    'SELECT COUNT(*) AS n FROM best_ratio WHERE env=? AND problem=?'
  ).bind(env, problem).first();
  const distinct = totalRow ? totalRow.n : 0;
  let rank = null, beats = null;
  if (ratio != null && distinct > 0) {
    const better = await db.prepare(
      'SELECT COUNT(*) AS n FROM best_ratio WHERE env=? AND problem=? AND ratio < ?'
    ).bind(env, problem, ratio).first();
    const worse = await db.prepare(
      'SELECT COUNT(*) AS n FROM best_ratio WHERE env=? AND problem=? AND ratio > ?'
    ).bind(env, problem, ratio).first();
    rank = (better ? better.n : 0) + 1;
    beats = Math.round((worse ? worse.n : 0) / distinct * 100);
  }
  const unlocked = distinct >= UNLOCK_AT;
  return {
    distinct,
    unlock_at: UNLOCK_AT,
    unlocked,
    rank,
    total: distinct,
    percentile: unlocked ? beats : null,  // real only once unlocked
  };
}

async function handleEvent(req, db) {
  let b;
  try { b = await req.json(); } catch { return json({ error: 'bad json' }, 400); }
  const env = normEnv(b.env);
  const problem = Number(b.problem);
  const client = String(b.client || '').slice(0, 64);
  const verdict = String(b.verdict || '').slice(0, 16);
  const ratio = (typeof b.ratio === 'number' && isFinite(b.ratio) && b.ratio > 0) ? b.ratio : null;
  if (!client || !Number.isInteger(problem)) return json({ error: 'bad request' }, 400);

  const ts = Date.now();
  const ipd = await ipDayHash(req);
  await db.prepare(
    'INSERT INTO events (problem,verdict,ratio,client,ip_day,env,ts) VALUES (?,?,?,?,?,?,?)'
  ).bind(problem, verdict, ratio, client, ipd, env, ts).run();

  if (verdict === 'accepted' && ratio != null) {
    await db.prepare(
      `INSERT INTO best_ratio (env,problem,client,ratio,ts) VALUES (?,?,?,?,?)
       ON CONFLICT(env,problem,client) DO UPDATE SET ratio=min(ratio,excluded.ratio), ts=excluded.ts`
    ).bind(env, problem, client, ratio, ts).run();
  }
  const stat = await problemStats(db, env, problem, ratio);
  return json({ ok: true, ...stat });
}

async function handleStats(url, db) {
  const env = normEnv(url.searchParams.get('env'));
  const problem = url.searchParams.get('problem');
  if (problem != null) {
    const stat = await problemStats(db, env, Number(problem), null);
    return json({ ok: true, problem: Number(problem), ...stat });
  }
  // Raw volume AND distinct-client counts. Solve rate is computed per-person so
  // one user spamming Submit can't move it (attempters/accepters are DISTINCT).
  const ev = await db.prepare(
    `SELECT problem,
            COUNT(*) AS attempts,
            COUNT(DISTINCT client) AS attempters,
            COUNT(DISTINCT CASE WHEN verdict='accepted' THEN client END) AS accepters,
            SUM(CASE WHEN verdict='accepted' THEN 1 ELSE 0 END) AS accepted
     FROM events WHERE env=? GROUP BY problem`
  ).bind(env).all();
  const sv = await db.prepare(
    'SELECT problem, COUNT(*) AS solvers FROM best_ratio WHERE env=? GROUP BY problem'
  ).bind(env).all();
  const solvers = {};
  for (const r of (sv.results || [])) solvers[r.problem] = r.solvers;

  // First-try success: was each person's FIRST-ever submission accepted? (spam-proof)
  const ft = await db.prepare(
    `WITH firsts AS (
       SELECT e.problem AS problem, e.verdict AS verdict
       FROM events e
       JOIN (SELECT problem, client, MIN(ts) AS mts FROM events WHERE env=? GROUP BY problem, client) m
         ON e.problem=m.problem AND e.client=m.client AND e.ts=m.mts
       WHERE e.env=?
     )
     SELECT problem, COUNT(*) AS people,
            SUM(CASE WHEN verdict='accepted' THEN 1 ELSE 0 END) AS first_ac
     FROM firsts GROUP BY problem`
  ).bind(env, env).all();
  const firstTry = {};
  for (const r of (ft.results || [])) firstTry[r.problem] = r.people ? Math.round(r.first_ac / r.people * 100) : 0;

  // Median submissions-before-AC among solvers (median ignores spammer outliers).
  const md = await db.prepare(
    `WITH solved AS (
       SELECT problem, client, MIN(ts) AS ac_ts
       FROM events WHERE env=? AND verdict='accepted' GROUP BY problem, client
     ),
     tries AS (
       SELECT s.problem AS problem,
         (SELECT COUNT(*) FROM events e WHERE e.env=? AND e.problem=s.problem AND e.client=s.client AND e.ts<=s.ac_ts) AS n
       FROM solved s
     ),
     ranked AS (
       SELECT problem, n,
         ROW_NUMBER() OVER (PARTITION BY problem ORDER BY n) AS rn,
         COUNT(*) OVER (PARTITION BY problem) AS cnt
       FROM tries
     )
     SELECT problem, AVG(n) AS median FROM ranked
     WHERE rn IN ((cnt + 1) / 2, (cnt + 2) / 2) GROUP BY problem`
  ).bind(env, env).all();
  const medianTries = {};
  for (const r of (md.results || [])) medianTries[r.problem] = r.median;

  const problems = (ev.results || []).map((r) => ({
    problem: r.problem,
    attempts: r.attempts,        // raw submissions (volume)
    attempters: r.attempters,    // distinct people who tried
    accepters: r.accepters,      // distinct people who solved
    accepted: r.accepted,        // raw accepted submissions
    solvers: solvers[r.problem] || 0,                          // distinct ratio-solvers → unlock
    solve_rate: r.attempters ? Math.round(r.accepters / r.attempters * 100) : 0,
    first_try_pct: firstTry[r.problem] != null ? firstTry[r.problem] : null,
    median_tries: medianTries[r.problem] != null ? Math.round(medianTries[r.problem] * 10) / 10 : null,
  })).sort((a, b) => b.attempts - a.attempts);
  const totals = {
    attempts: problems.reduce((s, p) => s + p.attempts, 0),
    accepted: problems.reduce((s, p) => s + p.accepted, 0),
    attempters: problems.reduce((s, p) => s + p.attempters, 0),
    problems_attempted: problems.length,
    unlock_at: UNLOCK_AT,
  };
  return json({ ok: true, env, totals, problems });
}

async function board(db, env, problem) {
  const rows = await db.prepare(
    'SELECT initials, ratio, t_ratio, s_ratio, ts FROM leaderboard WHERE env=? AND problem=? ORDER BY ratio ASC LIMIT ?'
  ).bind(env, problem, BOARD_SIZE).all();
  return rows.results || [];
}

async function handleLeaderboard(url, db) {
  const env = normEnv(url.searchParams.get('env'));
  const problem = Number(url.searchParams.get('problem'));
  if (!Number.isInteger(problem)) return json({ error: 'bad request' }, 400);
  return json({ ok: true, board: await board(db, env, problem) });
}

async function handleScore(req, db) {
  let b;
  try { b = await req.json(); } catch { return json({ error: 'bad json' }, 400); }
  const env = normEnv(b.env);
  const problem = Number(b.problem);
  const initials = cleanInitials(b.initials);
  const ratio = (typeof b.ratio === 'number' && isFinite(b.ratio) && b.ratio > 0) ? b.ratio : null;
  const t_ratio = (typeof b.t_ratio === 'number' && isFinite(b.t_ratio) && b.t_ratio > 0) ? b.t_ratio : null;
  const s_ratio = (typeof b.s_ratio === 'number' && isFinite(b.s_ratio) && b.s_ratio > 0) ? b.s_ratio : null;
  const client = String(b.client || '').slice(0, 64) || null;
  if (!initials) return json({ error: 'initials must be 3 letters (and not blocked)' }, 400);
  if (!Number.isInteger(problem) || ratio == null) return json({ error: 'bad request' }, 400);

  await db.prepare(
    'INSERT INTO leaderboard (env,problem,initials,ratio,t_ratio,s_ratio,client,ts) VALUES (?,?,?,?,?,?,?,?)'
  ).bind(env, problem, initials, ratio, t_ratio, s_ratio, client, Date.now()).run();
  // Churn: keep only the best BOARD_KEEP per (env, problem).
  await db.prepare(
    `DELETE FROM leaderboard WHERE env=? AND problem=? AND id NOT IN (
       SELECT id FROM leaderboard WHERE env=? AND problem=? ORDER BY ratio ASC LIMIT ?)`
  ).bind(env, problem, env, problem, BOARD_KEEP).run();
  return json({ ok: true, board: await board(db, env, problem) });
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const db = env.opencode_stats;
    const url = new URL(request.url);
    try {
      if (url.pathname === '/' ) return json({ ok: true, service: 'freetcode-stats' });
      // ── Problem content (KV-backed; never the whole set in one call) ──
      if (url.pathname === '/problems/index' && request.method === 'GET') return await kvDoc(env.PROBLEMS, 'index', 300);
      if (url.pathname.startsWith('/problem/') && request.method === 'GET') {
        const num = decodeURIComponent(url.pathname.slice('/problem/'.length));
        if (!/^-?\d+$/.test(num)) return json({ error: 'bad problem id' }, 400);
        return await kvDoc(env.PROBLEMS, 'problem:' + num, 3600);
      }
      if (url.pathname === '/event' && request.method === 'POST') return await handleEvent(request, db);
      if (url.pathname === '/stats' && request.method === 'GET') return await handleStats(url, db);
      if (url.pathname === '/leaderboard' && request.method === 'GET') return await handleLeaderboard(url, db);
      if (url.pathname === '/score' && request.method === 'POST') return await handleScore(request, db);
      return json({ error: 'not found' }, 404);
    } catch (e) {
      return json({ error: e.message || String(e) }, 500);
    }
  },
};
