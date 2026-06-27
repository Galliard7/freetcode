/* ══════════════════════════════════════════════════════════════
   FreetCode — Sliding Window Visualizer (vanilla SVG)
   Demonstrates: Longest Substring Without Repeating Characters (LC 3)
   ══════════════════════════════════════════════════════════════ */

const SlidingWindowVisualizer = (() => {

  const STR = 'abcabcbb';

  const CODE = [
    'def lengthOfLongestSubstring(s):',
    '    char_set = set()',
    '    l = 0',
    '    result = 0',
    '    for r in range(len(s)):',
    '        while s[r] in char_set:',
    '            char_set.remove(s[l])',
    '            l += 1',
    '        char_set.add(s[r])',
    '        result = max(result, r - l + 1)',
    '    return result',
  ];

  const C = {
    bg: '#0f0f0f', panel: '#161616', border: '#2a2a2a',
    text: '#e0e0e0', muted: '#666',
    accent: '#6366f1', accentSoft: 'rgba(99,102,241,0.15)',
    window: '#8b5cf6', windowSoft: 'rgba(139,92,246,0.12)', windowBorder: 'rgba(139,92,246,0.4)',
    left: '#3b82f6',
    right: '#f59e0b',
    best: '#22c55e', bestSoft: 'rgba(34,197,94,0.1)',
    conflict: '#ef4444', conflictSoft: 'rgba(239,68,68,0.12)',
  };

  function generateSteps() {
    const steps = [];
    const charSet = new Set();
    let l = 0, result = 0;

    steps.push({ l, r: -1, charSet: new Set(), result, type: 'init', line: 0, msg: 'initialize: l=0, result=0, empty set', bestL: 0, bestR: -1 });

    let bestL = 0, bestR = -1;
    for (let r = 0; r < STR.length; r++) {
      steps.push({ l, r, charSet: new Set(charSet), result, type: 'expand', line: 4, msg: `expand right: r=${r}, s[r]='${STR[r]}'`, bestL, bestR });

      while (charSet.has(STR[r])) {
        steps.push({ l, r, charSet: new Set(charSet), result, type: 'conflict', line: 5, conflict: STR[r], msg: `'${STR[r]}' already in set — shrink: remove s[${l}]='${STR[l]}'`, bestL, bestR });
        charSet.delete(STR[l]);
        l++;
      }

      charSet.add(STR[r]);
      const newLen = r - l + 1;
      if (newLen > result) {
        result = newLen;
        bestL = l;
        bestR = r;
      }
      steps.push({ l, r, charSet: new Set(charSet), result, type: 'add', line: 8, msg: `add '${STR[r]}' to set, window="${STR.slice(l, r+1)}" (len=${newLen}), best=${result}`, bestL, bestR });
    }
    steps.push({ l, r: STR.length - 1, charSet: new Set(charSet), result, type: 'done', line: 10, msg: `done! longest substring without repeats = ${result}`, bestL, bestR });
    return steps;
  }

  let steps, stepIdx, playing, speed, timer, container;

  function init(el) {
    container = el;
    steps = generateSteps();
    stepIdx = 0;
    playing = false;
    speed = 900;
    render();
  }

  function render() {
    const cur = steps[stepIdx];
    const cellW = 52, gap = 6, cellH = 52;
    const startX = 30, startY = 50;

    let svg = '';

    // Window highlight
    if (cur.r >= 0 && cur.l <= cur.r) {
      const wx = startX + cur.l * (cellW + gap) - 3;
      const ww = (cur.r - cur.l + 1) * (cellW + gap) - gap + 6;
      svg += `<rect x="${wx}" y="${startY - 3}" width="${ww}" height="${cellH + 6}" rx="6" fill="${cur.type === 'conflict' ? C.conflictSoft : C.windowSoft}" stroke="${cur.type === 'conflict' ? C.conflict : C.windowBorder}" stroke-width="1.5" stroke-dasharray="${cur.type === 'conflict' ? '4,3' : 'none'}" style="transition:all 300ms"/>`;
    }

    // Cells
    for (let i = 0; i < STR.length; i++) {
      const x = startX + i * (cellW + gap);
      const inWindow = cur.r >= 0 && i >= cur.l && i <= cur.r;
      const isBest = i >= cur.bestL && i <= cur.bestR;
      let fill = C.panel, stroke = C.border, textColor = C.muted;

      if (inWindow) {
        fill = C.windowSoft;
        stroke = C.window;
        textColor = C.text;
      }

      svg += `<rect x="${x}" y="${startY}" width="${cellW}" height="${cellH}" rx="4" fill="${fill}" stroke="${stroke}" stroke-width="${inWindow ? 1.5 : 1}" style="transition:all 250ms"/>`;
      svg += `<text x="${x + cellW/2}" y="${startY + cellH/2}" text-anchor="middle" dominant-baseline="central" fill="${textColor}" style="font:600 18px 'JetBrains Mono',monospace;transition:fill 250ms">${STR[i]}</text>`;
      svg += `<text x="${x + cellW/2}" y="${startY + cellH + 16}" text-anchor="middle" fill="${C.muted}" style="font:10px 'JetBrains Mono',monospace">${i}</text>`;

      // Best underline
      if (isBest && cur.result > 0) {
        svg += `<line x1="${x + 2}" y1="${startY + cellH + 24}" x2="${x + cellW - 2}" y2="${startY + cellH + 24}" stroke="${C.best}" stroke-width="2" stroke-linecap="round"/>`;
      }
    }

    // Pointer labels
    if (cur.r >= 0) {
      const lx = startX + cur.l * (cellW + gap) + cellW / 2;
      svg += `<text x="${lx}" y="${startY - 10}" text-anchor="middle" fill="${C.left}" style="font:700 11px 'JetBrains Mono',monospace">L</text>`;
      const rx = startX + cur.r * (cellW + gap) + cellW / 2;
      svg += `<text x="${rx}" y="${startY - 10}" text-anchor="middle" fill="${C.right}" style="font:700 11px 'JetBrains Mono',monospace">${cur.r === cur.l ? 'L/R' : 'R'}</text>`;
    }

    // Set display
    const setItems = [...cur.charSet].sort();
    const setHtml = setItems.length > 0
      ? setItems.map(c => `<span style="font:500 13px 'JetBrains Mono',monospace;color:${C.text};background:${C.windowSoft};border:1px solid ${C.window};padding:3px 10px;border-radius:4px">${c}</span>`).join(' ')
      : `<span style="color:${C.muted};font-style:italic;font-size:11px">∅ empty</span>`;

    let codeHtml = CODE.map((line, i) => {
      const active = i === cur.line;
      return `<div style="padding:2px 8px;background:${active ? C.accentSoft : 'transparent'};border-left:2px solid ${active ? C.accent : 'transparent'};font:12px 'JetBrains Mono',monospace;color:${active ? C.text : C.muted};white-space:pre">${line}</div>`;
    }).join('');

    const svgW = STR.length * (cellW + gap) + 60;
    container.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 280px;gap:8px;height:100%;padding:8px;font-family:'Inter',sans-serif">
        <div style="background:${C.panel};border:1px solid ${C.border};border-radius:6px;padding:12px;display:flex;flex-direction:column;overflow:hidden">
          <div style="font-size:9px;text-transform:uppercase;letter-spacing:0.1em;color:${C.muted};margin-bottom:8px;font-weight:600">Longest Substring Without Repeating Characters</div>
          <div style="flex:1;display:flex;align-items:center;justify-content:center">
            <svg viewBox="0 0 ${svgW} 140" style="width:100%;max-height:100%">${svg}</svg>
          </div>
          <div style="padding:8px 0;border-top:1px solid ${C.border}">
            <div style="font:600 9px 'JetBrains Mono',monospace;color:${C.muted};text-transform:uppercase;letter-spacing:0.1em;margin-bottom:6px">char_set</div>
            <div style="display:flex;gap:6px;flex-wrap:wrap">${setHtml}</div>
          </div>
          <div style="display:flex;gap:16px;padding-top:6px;border-top:1px solid ${C.border}">
            <div style="font:11px 'JetBrains Mono',monospace;color:${C.muted}">window: <span style="color:${C.window};font-weight:600">"${cur.r >= 0 ? STR.slice(cur.l, cur.r + 1) : ''}"</span></div>
            <div style="font:11px 'JetBrains Mono',monospace;color:${C.muted}">best: <span style="color:${C.best};font-weight:600">${cur.result}</span></div>
          </div>
          <div style="margin-top:6px;padding:8px;background:${cur.type === 'conflict' ? C.conflictSoft : C.accentSoft};border:1px solid ${cur.type === 'conflict' ? C.conflict : 'rgba(99,102,241,0.3)'};border-radius:4px;font:11px 'JetBrains Mono',monospace;color:${cur.type === 'conflict' ? C.conflict : C.accent}">› ${cur.msg}</div>
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
  function getTitle() { return 'Sliding Window'; }
  function getStepCount() { return steps ? steps.length : 0; }
  function isPlaying() { return playing; }

  return { init, step, play, stop, reset, setSpeed, getTitle, getStepCount, isPlaying, render };
})();

if (typeof window.VIZ_REGISTRY === 'undefined') window.VIZ_REGISTRY = {};
window.VIZ_REGISTRY['sliding-window'] = SlidingWindowVisualizer;
