// SPDX-License-Identifier: AGPL-3.0-or-later
// FreetCode — Copyright (C) 2026 Galliard7. See LICENSE.

/* ══════════════════════════════════════════════════════════════════
   FreetCode — anonymous stats Worker (Cloudflare Workers + D1)
   Routes:
     POST /event       record a Submit; returns this problem's aggregate
     GET  /stats        per-problem aggregates (dashboard)
     GET  /recent       recent submission stream (dashboard feed; anonymous)
     GET  /leaderboard  arcade AAA board for a problem
     POST /score        submit an AAA score
     POST /hit         count a pageview (anonymous daily-unique visitor)
     GET  /traffic      public traffic counters (daily series + totals)
     POST /tutor-chat   opt-in shared tutor chat (ADR 0004; zero identifiers)
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

// maxAge > 0 adds Cache-Control so browsers reuse public read responses
// instead of re-running the queries on every load. (workers.dev has no CF
// edge cache — the browser cache is the lever until a custom domain, B4.)
function json(data, status = 200, maxAge = 0) {
  const headers = { 'Content-Type': 'application/json', ...CORS };
  if (maxAge > 0) headers['Cache-Control'] = `public, max-age=${maxAge}`;
  return new Response(JSON.stringify(data), { status, headers });
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

// 429 for scrape/abuse throttling (Workers native rate-limit binding).
function tooMany() {
  return new Response(JSON.stringify({ error: 'rate limited — slow down' }), {
    status: 429,
    headers: { 'Content-Type': 'application/json', 'Retry-After': '60', ...CORS },
  });
}

function normEnv(e) { return (e === 'v2' || e === 'dev') ? e : 'prod'; }

// C2: bounded body reads — reject oversized payloads before parsing (cap is in
// chars; a fair proxy for bytes at these sizes). Returns {body} or {err}.
async function readJson(req, maxChars) {
  let raw;
  try { raw = await req.text(); } catch (e) { return { err: json({ error: 'bad body' }, 400) }; }
  if (raw.length > maxChars) return { err: json({ error: 'payload too large' }, 413) };
  try { return { body: JSON.parse(raw || '{}') }; } catch (e) { return { err: json({ error: 'bad json' }, 400) }; }
}

// C1: Turnstile check on content writes. Deliberately a NO-OP until
// TURNSTILE_SECRET exists (set via `wrangler secret put TURNSTILE_SECRET`),
// so rollout stays decoupled: 1) deploy this Worker  2) ship the widget +
// ts_token client-side  3) set the secret — enforcement flips on last.
async function turnstileOk(envB, token, ip) {
  if (!envB.TURNSTILE_SECRET) return true;
  if (!token) return false;
  try {
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: envB.TURNSTILE_SECRET, response: token, remoteip: ip }),
    });
    return (await r.json()).success === true;
  } catch (e) { return false; }
}

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

// Self-declared crawlers (Googlebot etc.) are excluded from traffic counts so
// the public numbers approximate humans — the same definition CF Web Analytics
// uses. A bot that lies about its UA gets counted; accepted: dedup + the rate
// limit bound the damage, and a vanity counter has ~zero inflation incentive.
const BOT_UA = /bot|crawl|spider|slurp|headless|lighthouse|preview|scan|monitor|curl|wget|python|httpclient|facebookexternalhit|whatsapp|telegram/i;
function isDeclaredBot(req) {
  const ua = req.headers.get('User-Agent') || '';
  return !ua || BOT_UA.test(ua);
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

async function handleEvent(req, db, envB, ip) {
  const { body: b, err } = await readJson(req, 2048);
  if (err) return err;
  if (!(await turnstileOk(envB, b.ts_token, ip))) return json({ error: 'verification failed' }, 403);
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
    return json({ ok: true, problem: Number(problem), ...stat }, 200, 30);
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
  // 60s cache: the CTEs above are the most expensive queries in the Worker
  // and run per dashboard load — this header is the biggest capacity lever (D4).
  return json({ ok: true, env, totals, problems }, 200, 60);
}

// Recent submission stream for the dashboard feed. Anonymous by construction:
// returns only problem/verdict/ratio/ts — never client or ip_day.
async function handleRecent(url, db) {
  const env = normEnv(url.searchParams.get('env'));
  const lim = Math.min(50, Math.max(1, Number(url.searchParams.get('limit')) || 20));
  const rows = await db.prepare(
    'SELECT problem, verdict, ratio, ts FROM events WHERE env=? ORDER BY ts DESC LIMIT ?'
  ).bind(env, lim).all();
  return json({ ok: true, env, events: rows.results || [] }, 200, 30);
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
  return json({ ok: true, board: await board(db, env, problem) }, 200, 60);
}

async function handleScore(req, db, envB, ip) {
  const { body: b, err } = await readJson(req, 2048);
  if (err) return err;
  if (!(await turnstileOk(envB, b.ts_token, ip))) return json({ error: 'verification failed' }, 403);
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

// Traffic beacon (A4). One row per (env, day, visitor); reloads bump pv.
// visitor = ipDayHash → daily-unique by construction, no raw IP stored,
// unlinkable across days. Deliberately NOT behind Turnstile: a page-load
// beacon can't run a challenge without losing fast-bouncing humans.
async function handleHit(req, db) {
  const { body: b, err } = await readJson(req, 512);
  if (err) return err;
  const env = normEnv(b.env);
  if (isDeclaredBot(req)) return json({ ok: true, counted: false });
  const day = new Date().toISOString().slice(0, 10);
  const visitor = await ipDayHash(req);
  await db.prepare(
    `INSERT INTO visits (env, day, visitor, pv) VALUES (?,?,?,1)
     ON CONFLICT(env, day, visitor) DO UPDATE SET pv = pv + 1`
  ).bind(env, day, visitor).run();
  return json({ ok: true, counted: true });
}

// A1 (ADR 0004): opt-in shared tutor chats. ZERO identifiers stored — no
// client UUID, no ip_day, deliberately unlike every other write. Shape-
// validated and capped (C2); Turnstile like all content writes once the
// secret is set. rated = count of 👍/👎-carrying replies.
const TC_MAX_TURNS = 40, TC_MAX_TEXT = 8000, TC_MAX_CODE = 16000, TC_MAX_BODY = 96000;
async function handleTutorChat(req, db, envB, ip) {
  const { body: b, err } = await readJson(req, TC_MAX_BODY);
  if (err) return err;
  if (!(await turnstileOk(envB, b.ts_token, ip))) return json({ error: 'verification failed' }, 403);
  const env = normEnv(b.env);
  const problem = Number(b.problem);
  if (!Number.isInteger(problem)) return json({ error: 'bad request' }, 400);
  if (!Array.isArray(b.turns) || b.turns.length === 0 || b.turns.length > TC_MAX_TURNS)
    return json({ error: 'bad turns' }, 400);
  let rated = 0;
  const turns = [];
  for (const t of b.turns) {
    const role = t && (t.role === 'ai' || t.role === 'user') ? t.role : null;
    if (!role || typeof t.text !== 'string' || !t.text) return json({ error: 'bad turn shape' }, 400);
    const turn = { role, text: t.text.slice(0, TC_MAX_TEXT) };
    if (t.rating === 'up' || t.rating === 'down') { turn.rating = t.rating; rated++; }
    turns.push(turn);
  }
  const user_code = typeof b.user_code === 'string' ? b.user_code.slice(0, TC_MAX_CODE) : null;
  const verdict = typeof b.verdict === 'string' ? b.verdict.slice(0, 16) : null;
  const ratio = (typeof b.ratio === 'number' && isFinite(b.ratio) && b.ratio > 0) ? b.ratio : null;
  await db.prepare(
    'INSERT INTO tutor_chats (env,problem,user_code,verdict,ratio,turns,rated,ts) VALUES (?,?,?,?,?,?,?,?)'
  ).bind(env, problem, user_code, verdict, ratio, JSON.stringify(turns), rated, Date.now()).run();
  return json({ ok: true, rated });
}

// Public counters for the dashboard: daily series (visitors = distinct daily
// hashes, pageviews = SUM(pv)) + all-time totals. visitor_days is the honest
// name — unique visitors across days is unknowable since hashes rotate daily.
async function handleTraffic(url, db) {
  const env = normEnv(url.searchParams.get('env'));
  const days = Math.min(90, Math.max(1, Number(url.searchParams.get('days')) || 30));
  const rows = await db.prepare(
    `SELECT day, COUNT(*) AS visitors, SUM(pv) AS pageviews
     FROM visits WHERE env=? GROUP BY day ORDER BY day DESC LIMIT ?`
  ).bind(env, days).all();
  const series = (rows.results || []).reverse();   // chronological
  const tot = await db.prepare(
    'SELECT COUNT(*) AS visitor_days, COALESCE(SUM(pv),0) AS pageviews FROM visits WHERE env=?'
  ).bind(env).first();
  return json({
    ok: true, env, series,
    totals: { visitor_days: tot ? tot.visitor_days : 0, pageviews: tot ? tot.pageviews : 0 },
  }, 200, 60);
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const db = env.freetcode_stats;
    const url = new URL(request.url);
    const ip = request.headers.get('CF-Connecting-IP') || 'anon';
    try {
      if (url.pathname === '/' ) return json({ ok: true, service: 'freetcode-stats' });
      // ── Problem content (KV-backed; never the whole set in one call) ──
      // Rate-limited per IP to throttle bulk scraping of the curriculum.
      if (url.pathname === '/problems/index' && request.method === 'GET') {
        if (env.RL_CONTENT && !(await env.RL_CONTENT.limit({ key: ip })).success) return tooMany();
        return await kvDoc(env.PROBLEMS, 'index', 300);
      }
      if (url.pathname.startsWith('/problem/') && request.method === 'GET') {
        const num = decodeURIComponent(url.pathname.slice('/problem/'.length));
        if (!/^-?\d+$/.test(num)) return json({ error: 'bad problem id' }, 400);
        if (env.RL_CONTENT && !(await env.RL_CONTENT.limit({ key: ip })).success) return tooMany();
        return await kvDoc(env.PROBLEMS, 'problem:' + num, 3600);
      }
      if (url.pathname === '/event' && request.method === 'POST') {
        if (env.RL_WRITE && !(await env.RL_WRITE.limit({ key: ip })).success) return tooMany();
        return await handleEvent(request, db, env, ip);
      }
      if (url.pathname === '/stats' && request.method === 'GET') return await handleStats(url, db);
      if (url.pathname === '/recent' && request.method === 'GET') return await handleRecent(url, db);
      if (url.pathname === '/leaderboard' && request.method === 'GET') return await handleLeaderboard(url, db);
      if (url.pathname === '/score' && request.method === 'POST') {
        if (env.RL_WRITE && !(await env.RL_WRITE.limit({ key: ip })).success) return tooMany();
        return await handleScore(request, db, env, ip);
      }
      if (url.pathname === '/tutor-chat' && request.method === 'POST') {
        if (env.RL_WRITE && !(await env.RL_WRITE.limit({ key: ip })).success) return tooMany();
        return await handleTutorChat(request, db, env, ip);
      }
      if (url.pathname === '/hit' && request.method === 'POST') {
        if (env.RL_WRITE && !(await env.RL_WRITE.limit({ key: ip })).success) return tooMany();
        return await handleHit(request, db);
      }
      if (url.pathname === '/traffic' && request.method === 'GET') return await handleTraffic(url, db);
      return json({ error: 'not found' }, 404);
    } catch (e) {
      return json({ error: e.message || String(e) }, 500);
    }
  },
};
