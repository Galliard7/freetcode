/* ══════════════════════════════════════════════════════════════
   FreetCode — DP-TABLE engine + Unique Paths adapter
   ---------------------------------------------------------------
   Reusable engine for tabular dynamic programming: fills a grid
   cell-by-cell, highlighting each cell's dependencies and the
   recurrence. 1-D DP is just a 1-row grid. Ship another DP problem
   by writing an adapter (base cases, fill order, recurrence),
   not another engine. Unique Paths (#62) is the first adapter.
   ══════════════════════════════════════════════════════════════ */

(() => {
  const T = {
    bg: '#0b1017', panel: '#111823', border: '#243040', text: '#dbe3ec', muted: '#7c8b9c',
    accent: '#5ec6e8', accentSoft: 'rgba(94,198,232,0.14)',
    ok: '#22c55e', okSoft: 'rgba(34,197,94,0.14)',      // dependency cells (inputs)
    fill: 'rgba(94,198,232,0.05)', edge: '#33465a',
    gold: '#f2c94c',
  };

  // ═══════════════ ENGINE: tabular DP ═══════════════
  // adapter A: { id, num, title, icon, gridTitle, examples:[{label,blurb,...}],
  //   shape(d)->{rows,cols}, base(table,d), order(d)->[[i,j]...],
  //   step(i,j,table,d)->{value,deps:[[i,j]...],expr}, answer(d)->[i,j],
  //   recurrence, code:[...], lineFor(phase), narrate(step,d), answerText(v,d),
  //   decorate(geom,d,T)?, cellFmt(v)? }
  function makeDpTableViz(A) {
    let exIdx, steps, stepIdx, playing, speed, timer, container;

    function generateSteps(d) {
      const { rows, cols } = A.shape(d);
      const t = Array.from({ length: rows }, () => Array(cols).fill(null));
      A.base(t, d);
      const out = [];
      const snap = (x) => out.push(Object.assign(
        { table: t.map(r => r.slice()), rows, cols, cur: null, deps: [], expr: '', value: null, phase: 'base', line: A.lineFor('base'), verdict: null }, x));
      snap({ phase: 'base' });
      for (const [i, j] of A.order(d)) {
        const r = A.step(i, j, t, d);
        t[i][j] = r.value;
        snap({ cur: [i, j], deps: r.deps, expr: r.expr, value: r.value, phase: 'fill', line: A.lineFor('fill') });
      }
      const [ai, aj] = A.answer(d);
      snap({ cur: [ai, aj], deps: [], phase: 'answer', line: A.lineFor('answer'), value: t[ai][aj], verdict: t[ai][aj] });
      return out;
    }

    function loadExample(i) { exIdx = i; steps = generateSteps(A.examples[i]); stepIdx = 0; render(); updateStepLabel(); }
    function init(el) {
      container = el; speed = 850; playing = false;
      container.onclick = (e) => { const tab = e.target.closest('[data-ex]'); if (tab) { stop(); loadExample(+tab.dataset.ex); } };
      loadExample(0);
    }

    const fmt = (v) => v === null ? '' : (A.cellFmt ? A.cellFmt(v) : String(v));

    function gridSvg(d, cur) {
      const { rows, cols, table } = cur;
      const W = 380, H = 300, rh = 26, ch = 24, x0 = rh + 6, y0 = ch + 4;
      const cellW = Math.min(64, (W - x0 - 6) / cols), cellH = Math.min(54, (H - y0 - 6) / rows);
      const gx = (j) => x0 + j * cellW, gy = (i) => y0 + i * cellH;
      const curSet = cur.cur ? cur.cur[0] + ',' + cur.cur[1] : '';
      const depSet = new Set((cur.deps || []).map(([a, b]) => a + ',' + b));
      const isAns = cur.phase === 'answer';
      let s = '';
      // column headers
      for (let j = 0; j < cols; j++) s += `<text x="${gx(j) + cellW / 2}" y="${y0 - 8}" text-anchor="middle" fill="${T.muted}" style="font:600 10px 'JetBrains Mono',monospace">${A.colHeader ? A.colHeader(j, d) : j}</text>`;
      for (let i = 0; i < rows; i++) s += `<text x="${x0 - 9}" y="${gy(i) + cellH / 2}" text-anchor="middle" dominant-baseline="central" fill="${T.muted}" style="font:600 10px 'JetBrains Mono',monospace">${A.rowHeader ? A.rowHeader(i, d) : i}</text>`;
      // dependency arrows (dep center -> current center)
      if (cur.cur && cur.deps) for (const [di, dj] of cur.deps) {
        const x1 = gx(dj) + cellW / 2, y1 = gy(di) + cellH / 2, x2 = gx(cur.cur[1]) + cellW / 2, y2 = gy(cur.cur[0]) + cellH / 2;
        const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, r = Math.min(cellW, cellH) * 0.38;
        s += `<line x1="${x1 + ux * r}" y1="${y1 + uy * r}" x2="${x2 - ux * r}" y2="${y2 - uy * r}" stroke="${T.ok}" stroke-width="2" marker-end="url(#dp-arr)"/>`;
      }
      // cells
      for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
        const v = table[i][j], key = i + ',' + j, filled = v !== null;
        let fill = T.bg, stroke = T.border, tc = T.muted, w = 1;
        if (filled) { fill = T.fill; stroke = T.edge; tc = T.text; }
        if (depSet.has(key)) { fill = T.okSoft; stroke = T.ok; tc = T.ok; w = 2; }
        if (key === curSet) { fill = isAns ? 'rgba(94,198,232,0.22)' : T.accentSoft; stroke = T.accent; tc = T.accent; w = isAns ? 3 : 2; }
        s += `<rect x="${gx(j) + 3}" y="${gy(i) + 3}" width="${cellW - 6}" height="${cellH - 6}" rx="6" fill="${fill}" stroke="${stroke}" stroke-width="${w}" style="transition:all 200ms"/>`;
        if (filled) s += `<text x="${gx(j) + cellW / 2}" y="${gy(i) + cellH / 2}" text-anchor="middle" dominant-baseline="central" fill="${tc}" style="font:700 ${cellW < 34 ? 11 : 14}px 'JetBrains Mono',monospace">${fmt(v)}</text>`;
        if (key === curSet && !isAns) s += `<rect x="${gx(j) + 3}" y="${gy(i) + 3}" width="${cellW - 6}" height="${cellH - 6}" rx="6" fill="none" stroke="${T.accent}" stroke-width="1.5" opacity="0.6"><animate attributeName="opacity" values="0.6;0;0.6" dur="1.4s" repeatCount="indefinite"/></rect>`;
      }
      if (A.decorate) s += A.decorate({ gx, gy, cellW, cellH, rows, cols }, d, T);
      return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;flex:1;min-height:0"><defs><marker id="dp-arr" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="${T.ok}"/></marker></defs>${s}</svg>`;
    }

    function render() {
      const d = A.examples[exIdx], cur = steps[stepIdx];
      const tabs = A.examples.map((e, i) =>
        `<button data-ex="${i}" style="cursor:pointer;padding:5px 12px;border-radius:5px;font:600 11px 'Inter',sans-serif;border:1px solid ${i === exIdx ? T.accent : T.border};background:${i === exIdx ? T.accentSoft : 'transparent'};color:${i === exIdx ? T.accent : T.muted};transition:all 150ms">${e.label}</button>`).join('');
      const codeHtml = A.code.map((line, i) =>
        `<div style="padding:2px 8px;background:${i === cur.line ? T.accentSoft : 'transparent'};border-left:2px solid ${i === cur.line ? T.accent : 'transparent'};font:11.5px 'JetBrains Mono',monospace;color:${i === cur.line ? T.text : T.muted};transition:all 180ms;white-space:pre">${line}</div>`).join('');

      // current-cell detail
      let detail = `<div style="color:${T.muted};font-size:11px;font-style:italic">seeding base cases…</div>`;
      if (cur.cur && cur.phase === 'fill') {
        const [i, j] = cur.cur;
        detail = `<div style="font:600 12px 'JetBrains Mono',monospace;color:${T.accent}">dp[${i}][${j}]</div>
          <div style="font:12px 'JetBrains Mono',monospace;color:${T.text};margin-top:6px;line-height:1.7">= ${cur.expr}<br>= <span style="color:${T.accent};font-weight:700">${cur.value}</span></div>`;
      } else if (cur.phase === 'answer') {
        detail = `<div style="font:600 11px 'Inter',sans-serif;color:${T.muted};text-transform:uppercase;letter-spacing:0.08em">answer cell</div><div style="font:700 30px 'JetBrains Mono',monospace;color:${T.accent};margin-top:4px">${cur.value}</div>`;
      }
      let verdict = '';
      if (cur.verdict !== null && cur.phase === 'answer')
        verdict = `<div style="padding:7px 10px;background:${T.accentSoft};border:1px solid ${T.accent};border-radius:5px;color:${T.accent};font:600 12px 'Inter',sans-serif">✓ ${A.answerText(cur.verdict, d)}</div>`;

      container.innerHTML = `
        <div style="display:flex;flex-direction:column;height:100%;gap:8px;padding:8px;font-family:'Inter',sans-serif;box-sizing:border-box">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <div style="display:flex;gap:6px">${tabs}</div>
            <span style="color:${T.muted};font-size:11px;flex:1;min-width:180px">${d.blurb}</span>
          </div>
          <div style="display:grid;grid-template-columns:1.7fr 1fr 1.2fr;gap:8px;flex:1;min-height:0">
            <div style="background:${T.panel};border:1px solid ${T.border};border-radius:6px;padding:8px;display:flex;flex-direction:column;overflow:hidden">
              <div style="font-size:9px;text-transform:uppercase;letter-spacing:0.1em;color:${T.muted};margin-bottom:4px;font-weight:600">${A.icon} ${A.gridTitle}</div>
              ${gridSvg(d, cur)}
              <div style="display:flex;gap:12px;padding-top:6px;border-top:1px solid ${T.border};font:9px 'Inter',sans-serif;color:${T.muted}">
                ${sw(T.accent, 'computing')} ${sw(T.ok, 'inputs (deps)')} ${sw(T.edge, 'filled')}
              </div>
            </div>
            <div style="background:${T.panel};border:1px solid ${T.border};border-radius:6px;padding:8px;display:flex;flex-direction:column;overflow:hidden">
              <div style="font-size:9px;text-transform:uppercase;letter-spacing:0.1em;color:${T.muted};margin-bottom:6px;font-weight:600">Recurrence</div>
              <div style="background:${T.bg};border:1px solid ${T.border};border-radius:5px;padding:8px;font:11px 'JetBrains Mono',monospace;color:${T.text};line-height:1.5">${A.recurrence}</div>
              <div style="margin-top:10px;font-size:9px;text-transform:uppercase;letter-spacing:0.1em;color:${T.muted};font-weight:600;margin-bottom:6px">This step</div>
              <div style="background:${T.bg};border:1px solid ${T.border};border-radius:5px;padding:8px;min-height:64px">${detail}</div>
            </div>
            <div style="background:${T.panel};border:1px solid ${T.border};border-radius:6px;padding:8px;display:flex;flex-direction:column;overflow:hidden">
              <div style="font-size:9px;text-transform:uppercase;letter-spacing:0.1em;color:${T.muted};margin-bottom:6px;font-weight:600">Solution</div>
              <div style="flex:1;overflow:auto">${codeHtml}</div>
            </div>
          </div>
          <div style="display:flex;gap:8px;align-items:stretch">
            <div style="flex:1;padding:8px 10px;background:${T.accentSoft};border:1px solid ${T.accent};border-radius:5px;font:12px 'JetBrains Mono',monospace;color:${T.accent};display:flex;align-items:center">› ${A.narrate(cur, d)}</div>
            ${verdict}
          </div>
        </div>`;
    }

    const sw = (col, lbl) => `<span style="display:inline-flex;align-items:center;gap:4px"><span style="width:9px;height:9px;border-radius:2px;background:${col}"></span>${lbl}</span>`;

    function step(dir) { stop(); stepIdx = Math.max(0, Math.min(steps.length - 1, stepIdx + dir)); render(); updateStepLabel(); }
    function play() { if (stepIdx >= steps.length - 1) stepIdx = 0; playing = true; tick(); }
    function tick() { if (!playing || stepIdx >= steps.length - 1) { stop(); return; } stepIdx++; render(); updateStepLabel(); timer = setTimeout(tick, speed); }
    function stop() { playing = false; clearTimeout(timer); }
    function reset() { stop(); stepIdx = 0; render(); updateStepLabel(); }
    function setSpeed(s) { speed = s; }
    function updateStepLabel() { const l = document.getElementById('viz-step-label'); if (l) l.textContent = `${stepIdx + 1} / ${steps.length}`; }
    function getTitle() { return A.title; }
    function getStepCount() { return steps ? steps.length : 0; }
    function isPlaying() { return playing; }
    return { init, step, play, stop, reset, setSpeed, getTitle, getStepCount, isPlaying, render };
  }

  // expose the engine so future DP adapters can live in their own files
  window.VIZ_ENGINES = window.VIZ_ENGINES || {};
  window.VIZ_ENGINES.dpTable = makeDpTableViz;

  // ═══════════════ ADAPTER: Unique Paths (#62) ═══════════════
  const uniquePaths = {
    id: 'unique-paths', num: 62, title: 'Unique Paths — 2-D dynamic programming',
    icon: '🤖', gridTitle: 'paths to reach each cell',
    recurrence: 'dp[i][j] =\n  dp[i-1][j]   (from above)\n+ dp[i][j-1]   (from left)',
    examples: [
      { label: '1 · 3 × 4 grid', m: 3, n: 4, blurb: 'Robot at top-left → bottom-right, moving only right or down. How many distinct paths? (→ 10)' },
      { label: '2 · 3 × 7 grid', m: 3, n: 7, blurb: 'The classic LeetCode case, m=3 n=7. (→ 28)' },
    ],
    shape: (d) => ({ rows: d.m, cols: d.n }),
    base: (t, d) => { for (let j = 0; j < d.n; j++) t[0][j] = 1; for (let i = 0; i < d.m; i++) t[i][0] = 1; },
    order: (d) => { const o = []; for (let i = 1; i < d.m; i++) for (let j = 1; j < d.n; j++) o.push([i, j]); return o; },
    step: (i, j, t) => ({ value: t[i - 1][j] + t[i][j - 1], deps: [[i - 1, j], [i, j - 1]], expr: `${t[i - 1][j]} + ${t[i][j - 1]}` }),
    answer: (d) => [d.m - 1, d.n - 1],
    code: [
      'def uniquePaths(m, n):',
      '    dp = [[1]*n for _ in range(m)]',
      '    for i in range(1, m):',
      '        for j in range(1, n):',
      '            dp[i][j] = (dp[i-1][j]',
      '                        + dp[i][j-1])',
      '    return dp[m-1][n-1]',
    ],
    lineFor: (phase) => ({ base: 1, fill: 4, answer: 6 }[phase]),
    narrate: (s, d) => {
      if (s.phase === 'base') return `Base case: top row & left column each have exactly 1 path — there's only one way to slide straight there.`;
      if (s.phase === 'answer') return `Bottom-right corner = ${s.value}: every route funnels here. Answer = ${s.value}. 🤖🏁`;
      const [i, j] = s.cur;
      return `dp[${i}][${j}] = paths from above (${s.expr.split(' + ')[0]}) + from left (${s.expr.split(' + ')[1]}) = ${s.value}.`;
    },
    answerText: (v, d) => `${v} unique paths across the ${d.m}×${d.n} grid`,
    decorate: (g, d, T) => {
      const rx = g.gx(0) + 12, ry = g.gy(0) + 13, fx = g.gx(d.n - 1) + g.cellW - 11, fy = g.gy(d.m - 1) + g.cellH - 8;
      return `<text x="${rx}" y="${ry}" text-anchor="middle" style="font-size:13px">🤖</text><text x="${fx}" y="${fy}" text-anchor="middle" style="font-size:13px">🏁</text>`;
    },
  };

  if (typeof window.VIZ_REGISTRY === 'undefined') window.VIZ_REGISTRY = {};
  window.VIZ_REGISTRY['unique-paths'] = makeDpTableViz(uniquePaths);
})();
