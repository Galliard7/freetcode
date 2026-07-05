/* ══════════════════════════════════════════════════════════════
   FreetCode — Two Pointers Visualizer (vanilla SVG)
   Demonstrates: Container With Most Water (LC 11)
   ══════════════════════════════════════════════════════════════ */

const TwoPointersVisualizer = (() => {

  const HEIGHTS = [1, 8, 6, 2, 5, 4, 8, 3, 7];

  const CODE = [
    'def maxArea(height):',
    '    l, r = 0, len(height) - 1',
    '    best = 0',
    '    while l < r:',
    '        area = min(height[l], height[r]) * (r - l)',
    '        best = max(best, area)',
    '        if height[l] < height[r]:',
    '            l += 1',
    '        else:',
    '            r -= 1',
    '    return best',
  ];

  const C = {
    bg: '#0f0f0f', panel: '#161616', border: '#2a2a2a',
    text: '#e0e0e0', muted: '#666',
    accent: '#e0a458', accentSoft: 'rgba(224,164,88,0.15)',
    left: '#3b82f6', leftSoft: 'rgba(59,130,246,0.12)',
    right: '#ef4444', rightSoft: 'rgba(239,68,68,0.12)',
    water: 'rgba(59,130,246,0.15)', waterBorder: 'rgba(59,130,246,0.4)',
    best: '#22c55e', bestSoft: 'rgba(34,197,94,0.1)',
    bar: '#444',
  };

  function generateSteps() {
    const steps = [];
    let l = 0, r = HEIGHTS.length - 1, best = 0;

    steps.push({ l, r, best, area: 0, type: 'init', line: 1, msg: `initialize l=0, r=${r}` });

    while (l < r) {
      const area = Math.min(HEIGHTS[l], HEIGHTS[r]) * (r - l);
      const newBest = Math.max(best, area);
      steps.push({ l, r, best, area, type: 'compute', line: 4, msg: `area = min(${HEIGHTS[l]}, ${HEIGHTS[r]}) × ${r - l} = ${area}${area > best ? ' ← new best!' : ''}` });
      best = newBest;

      if (HEIGHTS[l] < HEIGHTS[r]) {
        steps.push({ l, r, best, area, type: 'move-left', line: 7, msg: `height[${l}]=${HEIGHTS[l]} < height[${r}]=${HEIGHTS[r]} → move left pointer` });
        l++;
      } else {
        steps.push({ l, r, best, area, type: 'move-right', line: 9, msg: `height[${l}]=${HEIGHTS[l]} >= height[${r}]=${HEIGHTS[r]} → move right pointer` });
        r--;
      }
    }
    steps.push({ l, r, best, area: 0, type: 'done', line: 10, msg: `l >= r — done! max area = ${best}` });
    return steps;
  }

  let steps, stepIdx, playing, speed, timer, container;

  function init(el) {
    container = el;
    steps = generateSteps();
    stepIdx = 0;
    playing = false;
    speed = 1000;
    render();
  }

  function render() {
    const cur = steps[stepIdx];
    const maxH = Math.max(...HEIGHTS);
    const barW = 40, gap = 8, chartH = 250, chartW = HEIGHTS.length * (barW + gap) - gap;
    const startX = 30, startY = 20;

    let svg = '';
    // Water area between pointers
    if (cur.l < cur.r) {
      const waterH = Math.min(HEIGHTS[cur.l], HEIGHTS[cur.r]);
      const waterTop = startY + chartH - (waterH / maxH) * chartH;
      const waterLeft = startX + cur.l * (barW + gap) + barW;
      const waterRight = startX + cur.r * (barW + gap);
      const waterBottom = startY + chartH;
      svg += `<rect x="${waterLeft}" y="${waterTop}" width="${waterRight - waterLeft}" height="${waterBottom - waterTop}" fill="${C.water}" stroke="${C.waterBorder}" stroke-width="1" rx="2" style="transition:all 300ms"/>`;
    }

    // Bars
    for (let i = 0; i < HEIGHTS.length; i++) {
      const x = startX + i * (barW + gap);
      const h = (HEIGHTS[i] / maxH) * chartH;
      const y = startY + chartH - h;

      let fill = C.bar, stroke = C.border;
      if (i === cur.l) { fill = C.leftSoft; stroke = C.left; }
      else if (i === cur.r) { fill = C.rightSoft; stroke = C.right; }

      svg += `<rect x="${x}" y="${y}" width="${barW}" height="${h}" rx="3" fill="${fill}" stroke="${stroke}" stroke-width="${(i === cur.l || i === cur.r) ? 2 : 1}" style="transition:all 300ms"/>`;
      svg += `<text x="${x + barW/2}" y="${y - 6}" text-anchor="middle" fill="${(i === cur.l || i === cur.r) ? C.text : C.muted}" style="font:600 11px 'JetBrains Mono',monospace">${HEIGHTS[i]}</text>`;
      svg += `<text x="${x + barW/2}" y="${startY + chartH + 16}" text-anchor="middle" fill="${C.muted}" style="font:10px 'JetBrains Mono',monospace">${i}</text>`;

      // Pointer labels
      if (i === cur.l) svg += `<text x="${x + barW/2}" y="${startY + chartH + 32}" text-anchor="middle" fill="${C.left}" style="font:700 12px 'JetBrains Mono',monospace">L</text>`;
      if (i === cur.r) svg += `<text x="${x + barW/2}" y="${startY + chartH + 32}" text-anchor="middle" fill="${C.right}" style="font:700 12px 'JetBrains Mono',monospace">R</text>`;
    }

    let codeHtml = CODE.map((line, i) => {
      const active = i === cur.line;
      return `<div style="padding:2px 8px;background:${active ? C.accentSoft : 'transparent'};border-left:2px solid ${active ? C.accent : 'transparent'};font:12px 'JetBrains Mono',monospace;color:${active ? C.text : C.muted};white-space:pre">${line}</div>`;
    }).join('');

    const svgW = chartW + 60;
    container.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 280px;gap:8px;height:100%;padding:8px;font-family:'Inter',sans-serif">
        <div style="background:${C.panel};border:1px solid ${C.border};border-radius:6px;padding:12px;display:flex;flex-direction:column;overflow:hidden">
          <div style="font-size:9px;text-transform:uppercase;letter-spacing:0.1em;color:${C.muted};margin-bottom:8px;font-weight:600">Container With Most Water</div>
          <div style="flex:1;display:flex;align-items:center;justify-content:center">
            <svg viewBox="0 0 ${svgW} ${chartH + 50}" style="width:100%;max-height:100%">${svg}</svg>
          </div>
          <div style="display:flex;gap:16px;padding-top:8px;border-top:1px solid ${C.border}">
            <div style="font:11px 'JetBrains Mono',monospace;color:${C.muted}">area: <span style="color:${C.text};font-weight:600">${cur.area}</span></div>
            <div style="font:11px 'JetBrains Mono',monospace;color:${C.muted}">best: <span style="color:${C.best};font-weight:600">${cur.best}</span></div>
          </div>
          <div style="margin-top:6px;padding:8px;background:rgba(224,164,88,0.08);border:1px solid rgba(224,164,88,0.3);border-radius:4px;font:11px 'JetBrains Mono',monospace;color:${C.accent}">› ${cur.msg}</div>
        </div>
        <div style="background:${C.panel};border:1px solid ${C.border};border-radius:6px;padding:8px;display:flex;flex-direction:column">
          <div style="font-size:9px;text-transform:uppercase;letter-spacing:0.1em;color:${C.muted};margin-bottom:6px;font-weight:600">Code</div>
          <div style="flex:1">${codeHtml}</div>
        </div>
      </div>`;
  }

  function step(dir) { stop(); stepIdx = Math.max(0, Math.min(steps.length - 1, stepIdx + dir)); render(); updateStepLabel(); }
  function play() { if (stepIdx >= steps.length - 1) stepIdx = 0; playing = true; tick(); }
  function tick() { if (!playing || stepIdx >= steps.length - 1) { stop(); return; } stepIdx++; render(); updateStepLabel(); timer = setTimeout(tick, speed); }
  function stop() { playing = false; clearTimeout(timer); }
  function reset() { stop(); stepIdx = 0; render(); updateStepLabel(); }
  function setSpeed(s) { speed = s; }
  function updateStepLabel() { const l = document.getElementById('viz-step-label'); if (l) l.textContent = `${stepIdx + 1} / ${steps.length}`; }
  function getTitle() { return 'Two Pointers'; }
  function getStepCount() { return steps ? steps.length : 0; }
  function isPlaying() { return playing; }

  return { init, step, play, stop, reset, setSpeed, getTitle, getStepCount, isPlaying, render };
})();

if (typeof window.VIZ_REGISTRY === 'undefined') window.VIZ_REGISTRY = {};
window.VIZ_REGISTRY['two-pointers'] = TwoPointersVisualizer;
