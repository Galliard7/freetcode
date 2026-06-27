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
  // production stats. Real visitors (github.io / custom domains) write 'prod'.
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

  return { enabled, clientId, postEvent, getStats, getLeaderboard, postScore, ENV, base: () => STATS_BASE };
})();

window.Stats = Stats;
