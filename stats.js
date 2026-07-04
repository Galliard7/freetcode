// SPDX-License-Identifier: AGPL-3.0-or-later
// FreetCode — Copyright (C) 2026 Galliard7. See LICENSE.

/* ══════════════════════════════════════════════════════════════════
   FreetCode — anonymous stats client (talks to the Cloudflare Worker)
   No login, no PII: a random client UUID in localStorage, nothing else.
   Degrades silently when STATS_BASE is unset or the backend is down —
   Submit still judges + benchmarks locally either way.
   ══════════════════════════════════════════════════════════════════ */

const Stats = (() => {
  // ↓↓↓ Set this to the deployed Worker URL (no trailing slash). Empty = disabled.
  const STATS_BASE = 'https://freetcode-stats.galliard7.workers.dev';
  // Local/dev hosts write to a separate 'dev' bucket so testing never pollutes
  // production stats. Real visitors (freetcode.com / any non-local host) write 'prod'.
  const ENV = (location.protocol === 'file:' ||
    /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])$/.test(location.hostname)) ? 'dev' : 'prod';

  function enabled() {
    return !!STATS_BASE && !STATS_BASE.includes('YOURNAME');
  }

  function clientId() {
    let id = localStorage.getItem('freetcode_client');
    if (!id) {
      id = (crypto.randomUUID && crypto.randomUUID()) ||
        ('c-' + Math.random().toString(36).slice(2) + Date.now().toString(36));
      localStorage.setItem('freetcode_client', id);
    }
    return id;
  }

  async function postEvent({ problem, verdict, ratio }) {
    if (!enabled()) return null;
    try {
      const r = await fetch(STATS_BASE + '/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ problem, verdict, ratio: ratio ?? null, client: clientId(), env: ENV }),
      });
      return r.ok ? await r.json() : null;
    } catch { return null; }
  }

  async function getStats(problem) {
    if (!enabled()) return null;
    try {
      const q = problem != null ? `?env=${ENV}&problem=${problem}` : `?env=${ENV}`;
      const r = await fetch(STATS_BASE + '/stats' + q);
      return r.ok ? await r.json() : null;
    } catch { return null; }
  }

  async function getLeaderboard(problem) {
    if (!enabled()) return null;
    try {
      const r = await fetch(STATS_BASE + `/leaderboard?env=${ENV}&problem=${problem}`);
      return r.ok ? (await r.json()).board : null;
    } catch { return null; }
  }

  async function postScore({ problem, initials, ratio, t_ratio, s_ratio }) {
    if (!enabled()) return null;
    try {
      const r = await fetch(STATS_BASE + '/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ problem, initials, ratio, t_ratio: t_ratio ?? null, s_ratio: s_ratio ?? null, client: clientId(), env: ENV }),
      });
      return r.ok ? (await r.json()).board : null;
    } catch { return null; }
  }

  // Opt-in shared tutor chat (ADR 0004). Deliberately NO clientId in this
  // payload — shared chats carry zero identifiers, unlike every other write.
  // ts_token rides along once Turnstile goes live (empty until then).
  async function postTutorChat({ problem, user_code, verdict, ratio, turns, ts_token }) {
    if (!enabled()) return null;
    try {
      // keepalive: lets a share fired on tab-close/pagehide complete (≤64KiB).
      const r = await fetch(STATS_BASE + '/tutor-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        keepalive: true,
        body: JSON.stringify({ problem, user_code, verdict, ratio, turns, ts_token, env: ENV }),
      });
      return r.ok ? await r.json() : null;
    } catch (e) { return null; }
  }

  // Fire-and-forget pageview beacon → POST /hit. Counting happens server-side:
  // one row per (env, day, salted-daily-IP-hash), no raw IP stored, bots that
  // self-identify are skipped by the Worker. Auto-fires once per page load
  // below, so every page that includes stats.js is counted.
  function hit() {
    if (!enabled()) return;
    try {
      // Deliberately NO Content-Type header: keeps this a "simple" CORS
      // request, so the browser skips the OPTIONS preflight — one Worker
      // request per pageview instead of two (quota matters at 100k/day).
      fetch(STATS_BASE + '/hit', {
        method: 'POST',
        body: JSON.stringify({ env: ENV }),
      }).catch(() => {});
    } catch (e) {}
  }
  hit(); // count this page load

  return { enabled, clientId, postEvent, getStats, getLeaderboard, postScore, postTutorChat, hit, ENV, base: () => STATS_BASE };
})();

window.Stats = Stats;
