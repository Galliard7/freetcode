// SPDX-License-Identifier: AGPL-3.0-or-later
// FreetCode — Copyright (C) 2026 Galliard7. See LICENSE.

/* ══════════════════════════════════════════════════════════════════
   FreetCode — Verdict formatting + slowdown bands (main thread)
   Turns engine results into the Submit output card. Correctness verdict
   (green/red) + benchmark folded in (slowdown vs optimal + percentile).
   ══════════════════════════════════════════════════════════════════ */

const Judge = (() => {
  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ratio = user_ms / ref_ms (1.0 ≈ as fast as optimal; higher = slower)
  function band(ratio) {
    if (ratio <= 3) return { label: 'Efficient', klass: 'b-good', emoji: '⚡' };
    if (ratio <= 10) return { label: 'Suboptimal', klass: 'b-mid', emoji: '👍' };
    return { label: 'Too slow — likely a worse complexity class', klass: 'b-bad', emoji: '🐌' };
  }

  // Device-normalized synthetic estimate until real crowd data exists.
  function syntheticPercentile(ratio) {
    const inv = 1 / Math.max(ratio, 0.05);
    return Math.min(99, Math.max(5, Math.round(inv * 85 + 10)));
  }

  // Correctness card: green pass / red fail + per-case breakdown.
  function formatCorrectness(result) {
    if (result.error) {
      return `<div class="verdict-card v-fail">
        <div class="verdict-head">✗ Error</div>
        <pre class="verdict-err">${escapeHtml(result.error)}</pre>
      </div>`;
    }
    if (result.correct === null) {
      // Could not judge (no spec + reference unavailable) — ran without verdict.
      return `<div class="verdict-card v-neutral">
        <div class="verdict-head">▷ Ran (no automatic verdict available)</div>
      </div>`;
    }
    const cases = result.cases || [];
    const passed = cases.filter((c) => c.ok).length;
    const head = result.correct
      ? `<div class="verdict-head v-pass-text">✓ Accepted — ${passed}/${cases.length} cases passed</div>`
      : `<div class="verdict-head v-fail-text">✗ Wrong Answer — ${passed}/${cases.length} cases passed</div>`;
    let rows = '';
    for (const c of cases) {
      if (c.ok && result.correct) continue; // only spell out cases when something's worth showing
      rows += `<div class="case-row ${c.ok ? 'case-ok' : 'case-bad'}">
        <span class="case-mark">${c.ok ? '✓' : '✗'}</span>
        <span class="case-body"><span class="case-in">${escapeHtml(c.input)}</span>` +
        (c.ok ? '' : `<span class="case-diff">got <b>${escapeHtml(c.got)}</b> · expected <b>${escapeHtml(c.expected)}</b></span>`) +
        `</span></div>`;
    }
    return `<div class="verdict-card ${result.correct ? 'v-pass' : 'v-fail'}">${head}${rows}</div>`;
  }

  // Benchmark line(s): slowdown band + percentile. `scaled` flags a real
  // large-N stress run vs the sample-timing fallback.
  function formatBenchmark(b) {
    if (b.tle) {
      return `<div class="bench-card b-bad">
        <div class="bench-band">🐌 Too slow — timed out at n=${b.n.toLocaleString()} while optimal finished. Likely a worse complexity class (e.g. O(n²) where O(n) is expected).</div>
      </div>`;
    }
    if (b.unavailable) {
      return `<div class="bench-card b-info">
        <div class="bench-note">Scaled stress test not yet available for this problem — correctness only.</div>
      </div>`;
    }
    const tr = b.timeRatio;
    const bd = band(tr);
    const slow = tr < 1.15 ? 'matches optimal' : `${tr.toFixed(1)}× vs optimal`;
    let html = `<div class="bench-card ${bd.klass}">`;
    html += `<div class="bench-band">${bd.emoji} ${bd.label}</div>`;
    html += `<div class="bench-stat">⏱ Time: ${slow}` +
            (b.user_ms != null ? ` · you ${b.user_ms.toFixed(1)}ms / opt ${b.ref_ms.toFixed(1)}ms` : '') +
            (b.n ? ` · n=${b.n.toLocaleString()}` : '') + `</div>`;
    if (b.points) html += growthLine(b.points);
    if (b.space) {
      const sr = b.space.ratio;
      const sslow = sr < 1.2 ? 'matches optimal' : `${sr.toFixed(1)}× vs optimal`;
      const sbad = sr > 3 ? 'b-bad' : (sr > 1.5 ? 'b-mid' : 'b-good');
      const tradeoff = (sr > 1.5 && tr < 1.2) ? ' <span class="bench-est">(faster but more memory — a time/space tradeoff, not a penalty)</span>' : '';
      html += `<div class="bench-space ${sbad}">🧠 Memory: ${sslow} · peak you ${fmtBytes(b.space.user_peak)} / opt ${fmtBytes(b.space.ref_peak)}${tradeoff}</div>`;
    }
    // "Beats X%" uses the COMPOSITE (time+space). When stats are live the rank
    // card shows it instead (real or synthetic), so this line is suppressed.
    if (b.showPercentile !== false) {
      const comp = b.composite != null ? b.composite : tr;
      const pct = b.percentile != null ? b.percentile : syntheticPercentile(comp);
      html += `<div class="bench-pct">${pct >= 80 ? '⚡' : pct >= 50 ? '👍' : '🔧'} Beats ~${pct}% of solutions` +
              `${b.estimated ? ' <span class="bench-est">(estimated)</span>' : ''}</div>`;
    }
    html += `</div>`;
    return html;
  }

  function fmtBytes(b) {
    if (b == null) return '—';
    return b >= 1048576 ? (b / 1048576).toFixed(1) + 'MB' : Math.max(1, Math.round(b / 1024)) + 'KB';
  }

  // Composite score: geometric mean of time + space ratios (lower = better).
  // Symmetric, scale-fair; falls back to time-only when space is unmeasured.
  function composite(timeRatio, spaceRatio) {
    if (spaceRatio == null || !isFinite(spaceRatio) || spaceRatio <= 0) return timeRatio;
    return Math.sqrt(timeRatio * spaceRatio);
  }

  // Estimate the growth exponent p (time ≈ n^p) from log-log slope of points.
  function exponent(points, key) {
    const pts = (points || []).filter((p) => p[key] > 0.05); // drop sub-noise timings
    if (pts.length < 2) return null;
    let sum = 0, c = 0;
    for (let i = 1; i < pts.length; i++) {
      const dn = Math.log(pts[i].n / pts[i - 1].n);
      const dt = Math.log(pts[i][key] / pts[i - 1][key]);
      if (dn > 0) { sum += dt / dn; c++; }
    }
    return c ? sum / c : null;
  }

  function classLabel(p) {
    if (p == null) return null;
    if (p < 0.3) return 'O(1)';
    if (p < 0.85) return 'O(log n)';
    if (p < 1.3) return 'O(n)';
    if (p < 1.7) return 'O(n log n)';
    if (p < 2.4) return 'O(n²)';
    if (p < 3.4) return 'O(n³)';
    return 'O(nᵏ)+';
  }

  function growthLine(points) {
    const up = exponent(points, 'user'), rp = exponent(points, 'ref');
    if (up == null) return '<div class="bench-note">📈 Growth: input too small/slow to profile.</div>';
    let verdict = '', cls = 'b-good';
    if (rp != null) {
      const d = up - rp;
      if (d > 0.4) { verdict = ' — grows faster than optimal'; cls = 'b-bad'; }
      else if (d < -0.4) { verdict = ' — grows slower than the reference 👀'; }
      else verdict = ' — matches optimal’s growth';
    }
    return `<div class="bench-growth ${cls}">📈 Growth ≈ <b>${classLabel(up)}</b>${rp != null ? ` (optimal ≈ ${classLabel(rp)})` : ''}${verdict}</div>`;
  }

  // Rank + unlock meter + crowd percentile, from a /event response.
  function formatRank(stat, ratio) {
    const need = Math.max(0, (stat.unlock_at || 100) - (stat.distinct || 0));
    const pctReal = stat.unlocked && stat.percentile != null;
    const pct = pctReal ? stat.percentile : syntheticPercentile(ratio);
    let html = '<div class="rank-card">';
    if (stat.rank != null) {
      html += `<div class="rank-line">🏅 You're <b>#${stat.rank}</b> of ${stat.total} on this problem</div>`;
    }
    html += `<div class="bench-pct">${pct >= 80 ? '⚡' : pct >= 50 ? '👍' : '🔧'} Beats ~${pct}% of solutions` +
            `${pctReal ? ' <span class="bench-live">(live)</span>' : ' <span class="bench-est">(estimated)</span>'}</div>`;
    if (stat.unlocked) {
      html += `<div class="unlock-note">🔓 Live ranking active — ${stat.distinct} solvers</div>`;
    } else {
      const frac = Math.min(100, Math.round((stat.distinct || 0) / (stat.unlock_at || 100) * 100));
      html += `<div class="unlock-meter"><div class="unlock-fill" style="width:${frac}%"></div></div>`;
      html += `<div class="unlock-note">${stat.distinct}/${stat.unlock_at} solvers — live ranking unlocks in <b>${need}</b> more</div>`;
    }
    html += '</div>';
    return html;
  }

  // Arcade AAA board.
  function formatBoard(board, highlightInitials) {
    if (!board || !board.length) {
      return '<div class="board"><div class="board-title">🕹 Arcade Board</div><div class="board-empty">No scores yet — be the first.</div></div>';
    }
    let rows = '';
    board.forEach((e, i) => {
      const hot = highlightInitials && e.initials === highlightInitials;
      const bd = (e.t_ratio != null && e.s_ratio != null)
        ? ` <span class="board-bd">⏱${Number(e.t_ratio).toFixed(1)} ·🧠${Number(e.s_ratio).toFixed(1)}</span>` : '';
      rows += `<div class="board-row${hot ? ' hot' : ''}"><span class="board-rank">${i + 1}</span>` +
              `<span class="board-ini">${escapeHtml(e.initials)}</span>` +
              `<span class="board-ratio">${Number(e.ratio).toFixed(2)}×${bd}</span></div>`;
    });
    return `<div class="board"><div class="board-title">🕹 Arcade Board — best combined time+space vs optimal</div>${rows}</div>`;
  }

  return { escapeHtml, band, syntheticPercentile, composite, exponent, classLabel, formatCorrectness, formatBenchmark, formatRank, formatBoard };
})();

window.Judge = Judge;
