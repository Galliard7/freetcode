/* ══════════════════════════════════════════════════════════════
   FreetCode — "Binary search on the answer" ENGINE + Koko adapter
   ---------------------------------------------------------------
   POC for the engine+adapter model: a reusable engine renders the
   generic lo/hi/mid search mechanics, and a per-problem ADAPTER
   injects (a) the feasibility check, (b) a bespoke "stage" scene,
   (c) narration + code. Koko Eating Bananas (#875) is the first
   adapter; ship more by writing another adapter, not another engine.
   ══════════════════════════════════════════════════════════════ */

(() => {
  const T = {
    bg: '#0b1017', panel: '#111823', border: '#243040', text: '#dbe3ec', muted: '#7c8b9c',
    accent: '#5ec6e8', accentSoft: 'rgba(94,198,232,0.13)',
    ok: '#22c55e', okSoft: 'rgba(34,197,94,0.13)',
    no: '#FC6255', noSoft: 'rgba(252,98,85,0.13)',
    lo: '#5ec6e8', hi: '#a78bfa',            // lo = blue, hi = violet
    banana: '#f2c94c', bananaEdge: '#caa02e',
  };

  // ═══════════════ ENGINE: binary search on the answer ═══════════════
  // adapter A: { id, num, title, icon, examples:[{...data}], range(d),
  //   check(mid,d)->{feasible, detail}, code:[...], lineFor(phase,feasible),
  //   narrate(step)->str, answerText(ans,d)->str, stage(step,d,T)->svgInner,
  //   rangeUnit }
  function makeAnswerSearchViz(A) {
    let exIdx, steps, stepIdx, playing, speed, timer, container;

    function generateSteps(d) {
      let [lo, hi] = A.range(d);
      const lo0 = lo, hi0 = hi;
      const out = [];
      const snap = (x) => out.push(Object.assign(
        { lo, hi, lo0, hi0, mid: null, feasible: null, detail: null, phase: 'init', line: 0, verdict: null }, x));

      snap({ phase: 'init', line: A.lineFor('init') });
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        const r = A.check(mid, d);
        snap({ mid, feasible: r.feasible, detail: r.detail, phase: 'test', line: A.lineFor('test') });
        if (r.feasible) { snap({ mid, feasible: true, detail: r.detail, phase: 'feasible', line: A.lineFor('move', true) }); hi = mid; }
        else { snap({ mid, feasible: false, detail: r.detail, phase: 'infeasible', line: A.lineFor('move', false) }); lo = mid + 1; }
      }
      const fin = A.check(lo, d);
      snap({ mid: lo, feasible: true, detail: fin.detail, phase: 'answer', line: A.lineFor('answer'), verdict: lo, final: true });
      return out;
    }

    function loadExample(i) {
      exIdx = i;
      steps = generateSteps(A.examples[i]);
      stepIdx = 0; render(); updateStepLabel();
    }

    function init(el) {
      container = el; speed = 850; playing = false;
      container.onclick = (e) => {
        const tab = e.target.closest('[data-ex]');
        if (tab) { stop(); loadExample(+tab.dataset.ex); }
      };
      loadExample(0);
    }

    // generic search-range bar over the answer domain lo0..hi0
    function rangeSvg(d, cur) {
      const { lo0, hi0, lo, hi, mid, feasible } = cur;
      const span = hi0 - lo0 + 1;
      const W = 360, H = 66, padX = 12;
      const cellW = Math.min(30, (W - padX * 2) / span);
      const totalW = cellW * span, startX = (W - totalW) / 2, y = 26, h = 26;
      let s = '';
      for (let k = 0; k < span; k++) {
        const val = lo0 + k, x = startX + k * cellW;
        const inWin = val >= lo && val <= hi;
        const isMid = mid !== null && val === mid;
        let fill = T.panel, stroke = T.border, tc = T.muted;
        if (inWin) { stroke = '#33465a'; tc = T.text; }
        if (isMid) {
          fill = feasible === false ? T.noSoft : feasible ? T.okSoft : T.accentSoft;
          stroke = feasible === false ? T.no : feasible ? T.ok : T.accent;
          tc = stroke;
        }
        const showLabel = span <= 22 || val % Math.ceil(span / 18) === 0 || isMid || val === lo || val === hi;
        s += `<rect x="${x + 1}" y="${y}" width="${cellW - 2}" height="${h}" rx="4" fill="${fill}" stroke="${stroke}" stroke-width="${isMid ? 2 : 1}" style="transition:all 200ms"/>`;
        if (showLabel) s += `<text x="${x + cellW / 2}" y="${y + h / 2}" text-anchor="middle" dominant-baseline="central" fill="${tc}" style="font:600 ${cellW < 20 ? 8 : 10}px 'JetBrains Mono',monospace">${val}</text>`;
      }
      // lo / hi / mid markers
      const markX = (val) => startX + (val - lo0) * cellW + cellW / 2;
      const mk = (val, col, lbl, dy) => `<text x="${markX(val)}" y="${dy}" text-anchor="middle" fill="${col}" style="font:700 10px 'JetBrains Mono',monospace">${lbl}</text>`;
      s += mk(lo, T.lo, 'lo▼', 16);
      s += mk(hi, T.hi, 'hi▼', 16);
      if (mid !== null) s += `<text x="${markX(mid)}" y="${y + h + 14}" text-anchor="middle" fill="${feasible === false ? T.no : feasible ? T.ok : T.accent}" style="font:700 10px 'JetBrains Mono',monospace">▲mid=${mid}</text>`;
      return `<svg viewBox="0 0 ${W} ${H}" style="width:100%">${s}</svg>`;
    }

    function render() {
      const d = A.examples[exIdx], cur = steps[stepIdx];

      const tabs = A.examples.map((e, i) =>
        `<button data-ex="${i}" style="cursor:pointer;padding:5px 12px;border-radius:5px;font:600 11px 'Inter',sans-serif;border:1px solid ${i === exIdx ? T.accent : T.border};background:${i === exIdx ? T.accentSoft : 'transparent'};color:${i === exIdx ? T.accent : T.muted};transition:all 150ms">${e.label}</button>`).join('');

      const codeHtml = A.code.map((line, i) =>
        `<div style="padding:2px 8px;background:${i === cur.line ? T.accentSoft : 'transparent'};border-left:2px solid ${i === cur.line ? T.accent : 'transparent'};font:11.5px 'JetBrains Mono',monospace;color:${i === cur.line ? T.text : T.muted};transition:all 180ms;white-space:pre">${line}</div>`).join('');

      let verdict = '';
      if (cur.verdict !== null)
        verdict = `<div style="padding:7px 10px;background:${T.okSoft};border:1px solid ${T.ok};border-radius:5px;color:${T.ok};font:600 12px 'Inter',sans-serif">✓ ${A.answerText(cur.verdict, d)}</div>`;

      container.innerHTML = `
        <div style="display:flex;flex-direction:column;height:100%;gap:8px;padding:8px;font-family:'Inter',sans-serif;box-sizing:border-box">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <div style="display:flex;gap:6px">${tabs}</div>
            <span style="color:${T.muted};font-size:11px;flex:1;min-width:180px">${d.blurb}</span>
          </div>
          <div style="display:grid;grid-template-columns:1.5fr 1.15fr 1.15fr;gap:8px;flex:1;min-height:0">
            <!-- bespoke stage -->
            <div style="background:${T.panel};border:1px solid ${T.border};border-radius:6px;padding:8px;display:flex;flex-direction:column;overflow:hidden">
              <div style="font-size:9px;text-transform:uppercase;letter-spacing:0.1em;color:${T.muted};margin-bottom:4px;font-weight:600">${A.icon} ${A.stageTitle}</div>
              <svg viewBox="0 0 360 260" style="width:100%;flex:1;min-height:0">${A.stage(cur, d, T)}</svg>
            </div>
            <!-- search state -->
            <div style="background:${T.panel};border:1px solid ${T.border};border-radius:6px;padding:8px;display:flex;flex-direction:column;overflow:hidden">
              <div style="font-size:9px;text-transform:uppercase;letter-spacing:0.1em;color:${T.muted};margin-bottom:4px;font-weight:600">Binary search on the answer (${A.rangeUnit})</div>
              ${rangeSvg(d, cur)}
              <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-top:10px">
                ${stateBox('lo', cur.lo, T.lo)}${stateBox('mid', cur.mid ?? '—', cur.feasible === false ? T.no : cur.feasible ? T.ok : T.accent)}${stateBox('hi', cur.hi, T.hi)}
              </div>
              <div style="margin-top:auto;display:flex;gap:12px;padding-top:8px;border-top:1px solid ${T.border};font:9px 'Inter',sans-serif;color:${T.muted}">
                ${swatch(T.ok, 'feasible (go slower)')} ${swatch(T.no, 'too slow (speed up)')}
              </div>
            </div>
            <!-- code -->
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

    const stateBox = (lbl, val, col) => `<div style="background:${T.bg};border:1px solid ${col};border-radius:5px;padding:5px;text-align:center"><div style="font:600 8px 'Inter',sans-serif;text-transform:uppercase;letter-spacing:0.08em;color:${col}">${lbl}</div><div style="font:700 16px 'JetBrains Mono',monospace;color:${T.text};margin-top:1px">${val}</div></div>`;
    const swatch = (col, lbl) => `<span style="display:inline-flex;align-items:center;gap:4px"><span style="width:9px;height:9px;border-radius:2px;background:${col}"></span>${lbl}</span>`;

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

  // ═══════════════ ADAPTER: Koko Eating Bananas (#875) ═══════════════
  const koko = {
    id: 'koko-bananas', num: 875, title: 'Koko Eating Bananas — binary search on the answer',
    icon: '🐵', stageTitle: "Koko's banana piles", rangeUnit: 'bananas / hour',
    examples: [
      { label: '1 · [3,6,7,11], h=8', piles: [3, 6, 7, 11], H: 8, blurb: 'Guards away in 8h. Slowest speed that still clears every pile in time? (→ 4)' },
      { label: '2 · [30,11,23,4,20], h=5', piles: [30, 11, 23, 4, 20], H: 5, blurb: 'Only 5h — one pile per hour. She must go max-pile fast. (→ 30)' },
    ],
    range: (d) => [1, Math.max(...d.piles)],
    check: (k, d) => {
      const per = d.piles.map(p => Math.ceil(p / k));
      const total = per.reduce((a, b) => a + b, 0);
      return { feasible: total <= d.H, detail: { per, total, k } };
    },
    code: [
      'def minEatingSpeed(piles, h):',
      '    lo, hi = 1, max(piles)',
      '    while lo < hi:',
      '        k = (lo + hi) // 2',
      '        hours = sum(ceil(p / k)',
      '                    for p in piles)',
      '        if hours <= h:   # fits',
      '            hi = k       # slower',
      '        else:            # too slow',
      '            lo = k + 1',
      '    return lo',
    ],
    lineFor: (phase, feasible) => ({ init: 1, test: 4, move: feasible ? 7 : 9, answer: 10 }[phase]),
    narrate: (s, d) => {
      if (s.phase === 'init') return `Koko must finish every pile within ${d.H}h. Speeds range 1…${Math.max(...d.piles)} bananas/hr.`;
      if (s.phase === 'answer') return `Answer: ${s.verdict} bananas/hr — the slowest speed that still finishes in ${d.H}h. 🍌`;
      const { total, k } = s.detail;
      if (s.phase === 'test') return `At ${k}/hr she needs ${total}h  (limit ${d.H}h).`;
      if (s.feasible) return `${total}h ≤ ${d.H}h ✓ — she can afford to slow down. Search [${s.lo}, ${k}].`;
      return `${total}h > ${d.H}h ✗ — too slow, guards return. Speed up: search [${k + 1}, ${s.hi}].`;
    },
    answerText: (ans, d) => `Koko's minimum speed = ${ans} bananas/hour`,
    stage: (s, d, T) => {
      const piles = d.piles, n = piles.length, maxP = Math.max(...piles);
      const areaX = 22, areaW = 316, gap = 12, barW = (areaW - (n - 1) * gap) / n;
      const baseY = 176, maxBarH = 120;
      const k = s.mid, per = s.detail ? s.detail.per : null, total = s.detail ? s.detail.total : null;
      let out = `<text x="180" y="26" text-anchor="middle" style="font-size:26px">🐵</text>`;
      out += `<text x="180" y="44" text-anchor="middle" fill="${T.muted}" style="font:600 9px 'Inter',sans-serif">eating at ${k !== null ? k + ' /hr' : '…'}</text>`;
      for (let i = 0; i < n; i++) {
        const x = areaX + i * (barW + gap);
        const bh = Math.max(10, (piles[i] / maxP) * maxBarH), y = baseY - bh;
        out += `<rect x="${x}" y="${y}" width="${barW}" height="${bh}" rx="4" fill="${T.banana}" stroke="${T.bananaEdge}" stroke-width="1.5" style="transition:all 250ms"/>`;
        out += `<text x="${x + barW / 2}" y="${y - 5}" text-anchor="middle" fill="${T.text}" style="font:700 11px 'JetBrains Mono',monospace">${piles[i]}</text>`;
        if (per) {
          const hrs = per[i];
          out += `<rect x="${x}" y="${baseY + 6}" width="${barW}" height="16" rx="3" fill="${T.bg}" stroke="${T.border}"/>`;
          out += `<text x="${x + barW / 2}" y="${baseY + 14}" text-anchor="middle" dominant-baseline="central" fill="${T.accent}" style="font:600 9px 'JetBrains Mono',monospace">${hrs}h</text>`;
        }
      }
      // hours meter: total vs H
      if (total !== null) {
        const mx = 22, mw = 316, my = 218, mh = 16;
        const meterMax = Math.max(d.H * 1.5, total);
        const fillW = Math.min(1, total / meterMax) * mw;
        const hX = mx + (d.H / meterMax) * mw;
        const feas = total <= d.H;
        out += `<rect x="${mx}" y="${my}" width="${mw}" height="${mh}" rx="8" fill="${T.bg}" stroke="${T.border}"/>`;
        out += `<rect x="${mx}" y="${my}" width="${fillW}" height="${mh}" rx="8" fill="${feas ? T.okSoft : T.noSoft}" stroke="${feas ? T.ok : T.no}" stroke-width="1.5" style="transition:all 300ms"/>`;
        out += `<line x1="${hX}" y1="${my - 4}" x2="${hX}" y2="${my + mh + 4}" stroke="${T.hi}" stroke-width="2"/>`;
        out += `<text x="${hX}" y="${my + mh + 15}" text-anchor="middle" fill="${T.hi}" style="font:700 9px 'JetBrains Mono',monospace">limit ${d.H}h</text>`;
        out += `<text x="${mx}" y="${my - 5}" fill="${feas ? T.ok : T.no}" style="font:700 10px 'JetBrains Mono',monospace">total ${total}h</text>`;
      }
      return out;
    },
  };

  if (typeof window.VIZ_REGISTRY === 'undefined') window.VIZ_REGISTRY = {};
  window.VIZ_REGISTRY['koko-bananas'] = makeAnswerSearchViz(koko);
})();
