/* ══════════════════════════════════════════════════════════════
   FreetCode — Binary Search Visualizer (vanilla SVG)
   Larger array with more detailed steps per iteration
   ══════════════════════════════════════════════════════════════ */

const BinarySearchVisualizer = (() => {

  const ARRAY = [1, 3, 5, 7, 9, 11, 14, 16, 19, 22, 25, 28, 31, 35, 38, 42, 47, 53, 61, 72];
  const TARGET = 35;

  const CODE = [
    'def binary_search(nums, target):',
    '    l, r = 0, len(nums) - 1',
    '    while l <= r:',
    '        mid = (l + r) // 2',
    '        if nums[mid] == target:',
    '            return mid          # found!',
    '        elif nums[mid] < target:',
    '            l = mid + 1         # search right',
    '        else:',
    '            r = mid - 1         # search left',
    '    return -1                   # not found',
  ];

  const C = {
    bg: '#0f0f0f', panel: '#161616', border: '#2a2a2a',
    text: '#e0e0e0', muted: '#666',
    accent: '#e0a458', accentSoft: 'rgba(224,164,88,0.15)',
    left: '#3b82f6', leftSoft: 'rgba(59,130,246,0.15)',
    right: '#ef4444', rightSoft: 'rgba(239,68,68,0.15)',
    mid: '#f59e0b', midSoft: 'rgba(245,158,11,0.15)',
    found: '#22c55e', foundSoft: 'rgba(34,197,94,0.15)',
    eliminated: 'rgba(255,255,255,0.03)',
  };

  function generateSteps() {
    const steps = [];
    let l = 0, r = ARRAY.length - 1;
    let iteration = 0;
    const history = []; // track eliminated regions

    steps.push({ l, r, mid: -1, type: 'init', line: 1, iteration: 0, history: [],
      msg: `Start: search for ${TARGET} in array of ${ARRAY.length} elements. Set l=0, r=${r}.` });

    steps.push({ l, r, mid: -1, type: 'check-loop', line: 2, iteration: 0, history: [...history],
      msg: `Check loop condition: l(${l}) <= r(${r})? Yes — search space has ${r - l + 1} elements.` });

    while (l <= r) {
      iteration++;
      const mid = Math.floor((l + r) / 2);

      // Step: compute mid
      steps.push({ l, r, mid, type: 'compute-mid', line: 3, iteration, history: [...history],
        msg: `Iteration ${iteration}: mid = (${l} + ${r}) // 2 = ${mid}` });

      // Step: show what's at mid
      steps.push({ l, r, mid, type: 'peek-mid', line: 3, iteration, history: [...history],
        msg: `nums[${mid}] = ${ARRAY[mid]}. Compare with target ${TARGET}...` });

      if (ARRAY[mid] === TARGET) {
        steps.push({ l, r, mid, type: 'compare', line: 4, iteration, history: [...history],
          msg: `${ARRAY[mid]} == ${TARGET}? YES!` });
        steps.push({ l, r, mid, type: 'found', line: 5, iteration, history: [...history],
          msg: `Found ${TARGET} at index ${mid}! Search took ${iteration} iteration${iteration > 1 ? 's' : ''}.` });
        return steps;
      } else if (ARRAY[mid] < TARGET) {
        steps.push({ l, r, mid, type: 'compare', line: 6, iteration, history: [...history],
          msg: `${ARRAY[mid]} < ${TARGET}? Yes — target is LARGER.` });

        const eliminated = r - l + 1 - (r - mid);
        history.push({ from: l, to: mid, type: 'left' });

        steps.push({ l, r, mid, type: 'eliminate-left', line: 7, iteration, history: [...history],
          msg: `Eliminate left half (indices ${l}..${mid}): ${eliminated} elements removed. Set l = ${mid + 1}.` });

        l = mid + 1;

        steps.push({ l, r, mid: -1, type: 'after-update', line: 7, iteration, history: [...history],
          msg: `Search space narrowed to indices ${l}..${r} (${r - l + 1} elements remain).` });
      } else {
        steps.push({ l, r, mid, type: 'compare', line: 8, iteration, history: [...history],
          msg: `${ARRAY[mid]} > ${TARGET}? Yes — target is SMALLER.` });

        const eliminated = r - l + 1 - (mid - l);
        history.push({ from: mid, to: r, type: 'right' });

        steps.push({ l, r, mid, type: 'eliminate-right', line: 9, iteration, history: [...history],
          msg: `Eliminate right half (indices ${mid}..${r}): ${eliminated} elements removed. Set r = ${mid - 1}.` });

        r = mid - 1;

        steps.push({ l, r, mid: -1, type: 'after-update', line: 9, iteration, history: [...history],
          msg: `Search space narrowed to indices ${l}..${r} (${r - l + 1} elements remain).` });
      }

      // Check loop condition again
      if (l <= r) {
        steps.push({ l, r, mid: -1, type: 'check-loop', line: 2, iteration, history: [...history],
          msg: `Check loop: l(${l}) <= r(${r})? Yes — continue searching.` });
      }
    }

    steps.push({ l, r, mid: -1, type: 'not-found', line: 10, iteration, history: [...history],
      msg: `l(${l}) > r(${r}) — loop ends. Target ${TARGET} not found. Return -1.` });
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
    const cellW = 38, cellH = 44, gap = 2;
    const startX = 10, y = 70;

    // Array cells
    let cellsSvg = '';
    for (let i = 0; i < ARRAY.length; i++) {
      const x = startX + i * (cellW + gap);
      let fill = C.panel, stroke = C.border, textColor = C.muted, sw = 1;

      // Check if eliminated
      const isEliminated = cur.history && cur.history.some(h => i >= h.from && i <= h.to);

      if (cur.type === 'found' && i === cur.mid) {
        fill = C.foundSoft; stroke = C.found; textColor = C.found; sw = 2;
      } else if (i === cur.mid && cur.mid >= 0) {
        fill = C.midSoft; stroke = C.mid; textColor = C.text; sw = 2;
      } else if (isEliminated) {
        fill = C.eliminated; stroke = '#1a1a1a'; textColor = '#333';
      } else if (i >= cur.l && i <= cur.r) {
        fill = C.panel; stroke = C.border; textColor = C.text;
      } else {
        fill = C.eliminated; stroke = '#1a1a1a'; textColor = '#333';
      }

      cellsSvg += `<rect x="${x}" y="${y}" width="${cellW}" height="${cellH}" rx="3" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" style="transition:all 300ms"/>`;
      cellsSvg += `<text x="${x + cellW/2}" y="${y + cellH/2}" text-anchor="middle" dominant-baseline="central" fill="${textColor}" style="font:600 11px 'JetBrains Mono',monospace;transition:fill 300ms">${ARRAY[i]}</text>`;
      cellsSvg += `<text x="${x + cellW/2}" y="${y + cellH + 12}" text-anchor="middle" fill="${C.muted}" style="font:8px 'JetBrains Mono',monospace">${i}</text>`;
    }

    // Pointer arrows (below indices)
    if (cur.l <= cur.r || cur.type === 'not-found') {
      if (cur.l >= 0 && cur.l < ARRAY.length) {
        const lx = startX + cur.l * (cellW + gap) + cellW / 2;
        cellsSvg += `<text x="${lx}" y="${y - 8}" text-anchor="middle" fill="${C.left}" style="font:700 10px 'JetBrains Mono',monospace">L↓</text>`;
      }
      if (cur.r >= 0 && cur.r < ARRAY.length && cur.r !== cur.l) {
        const rx = startX + cur.r * (cellW + gap) + cellW / 2;
        cellsSvg += `<text x="${rx}" y="${y - 8}" text-anchor="middle" fill="${C.right}" style="font:700 10px 'JetBrains Mono',monospace">R↓</text>`;
      }
      if (cur.l === cur.r && cur.l >= 0 && cur.l < ARRAY.length) {
        const bx = startX + cur.l * (cellW + gap) + cellW / 2;
        cellsSvg += `<text x="${bx}" y="${y - 8}" text-anchor="middle" fill="${C.accent}" style="font:700 10px 'JetBrains Mono',monospace">L=R↓</text>`;
      }
      if (cur.mid >= 0 && cur.mid !== cur.l && cur.mid !== cur.r) {
        const mx = startX + cur.mid * (cellW + gap) + cellW / 2;
        cellsSvg += `<text x="${mx}" y="${y - 8}" text-anchor="middle" fill="${C.mid}" style="font:700 10px 'JetBrains Mono',monospace">M↓</text>`;
      }
    }

    // Target label
    const targetSvg = `<text x="${startX}" y="22" fill="${C.text}" style="font:12px 'Inter',sans-serif">target = <tspan fill="${C.mid}" style="font:700 14px 'JetBrains Mono',monospace">${TARGET}</tspan>  <tspan fill="${C.muted}" style="font:11px 'Inter',sans-serif">| array size: ${ARRAY.length} | search space: ${Math.max(0, cur.r - cur.l + 1)}</tspan></text>`;

    // Iteration counter
    const iterSvg = cur.iteration > 0
      ? `<text x="${startX + ARRAY.length * (cellW + gap) - 10}" y="22" text-anchor="end" fill="${C.accent}" style="font:600 12px 'JetBrains Mono',monospace">iteration ${cur.iteration}</text>`
      : '';

    // Search space bracket
    let bracketSvg = '';
    if (cur.l <= cur.r && cur.l >= 0 && cur.r < ARRAY.length) {
      const bx1 = startX + cur.l * (cellW + gap);
      const bx2 = startX + cur.r * (cellW + gap) + cellW;
      const by = y + cellH + 22;
      bracketSvg = `<line x1="${bx1}" y1="${by}" x2="${bx2}" y2="${by}" stroke="${C.accent}" stroke-width="2" stroke-linecap="round" opacity="0.4"/>`;
    }

    // Code highlight
    let codeHtml = CODE.map((line, i) => {
      const active = i === cur.line;
      return `<div style="padding:2px 8px;background:${active ? C.accentSoft : 'transparent'};border-left:2px solid ${active ? C.accent : 'transparent'};font:11px 'JetBrains Mono',monospace;color:${active ? C.text : C.muted};white-space:pre">${line}</div>`;
    }).join('');

    // State panel
    const stateHtml = `
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:10px">
        <div style="background:${C.leftSoft};border:1px solid ${C.left};border-radius:4px;padding:6px;text-align:center">
          <div style="font:600 8px 'JetBrains Mono',monospace;color:${C.left};text-transform:uppercase;letter-spacing:0.1em;margin-bottom:2px">Left</div>
          <div style="font:600 16px 'JetBrains Mono',monospace;color:${C.text}">${cur.l}</div>
        </div>
        <div style="background:${cur.mid >= 0 ? C.midSoft : C.panel};border:1px solid ${cur.mid >= 0 ? C.mid : C.border};border-radius:4px;padding:6px;text-align:center">
          <div style="font:600 8px 'JetBrains Mono',monospace;color:${C.mid};text-transform:uppercase;letter-spacing:0.1em;margin-bottom:2px">Mid</div>
          <div style="font:600 16px 'JetBrains Mono',monospace;color:${C.text}">${cur.mid >= 0 ? cur.mid : '—'}</div>
        </div>
        <div style="background:${C.rightSoft};border:1px solid ${C.right};border-radius:4px;padding:6px;text-align:center">
          <div style="font:600 8px 'JetBrains Mono',monospace;color:${C.right};text-transform:uppercase;letter-spacing:0.1em;margin-bottom:2px">Right</div>
          <div style="font:600 16px 'JetBrains Mono',monospace;color:${C.text}">${cur.r}</div>
        </div>
      </div>
      <div style="background:${C.panel};border:1px solid ${C.border};border-radius:4px;padding:6px;font:11px 'JetBrains Mono',monospace;color:${C.muted};margin-bottom:10px">
        Search space: <span style="color:${C.text};font-weight:600">${Math.max(0, cur.r - cur.l + 1)}</span> of ${ARRAY.length} elements
        ${cur.iteration > 0 ? `<br>Eliminated: <span style="color:${C.right}">${ARRAY.length - Math.max(0, cur.r - cur.l + 1)}</span> elements` : ''}
      </div>`;

    const svgW = ARRAY.length * (cellW + gap) + 20;
    const msgColor = cur.type === 'found' ? C.found :
                     cur.type === 'not-found' ? C.right :
                     cur.type.startsWith('eliminate') ? C.right :
                     cur.type === 'compare' ? C.mid : C.accent;
    const msgBg = cur.type === 'found' ? C.foundSoft :
                  cur.type.startsWith('eliminate') ? C.rightSoft :
                  C.accentSoft;

    container.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 260px;gap:8px;height:100%;padding:8px;font-family:'Inter',sans-serif">
        <div style="background:${C.panel};border:1px solid ${C.border};border-radius:6px;padding:10px;display:flex;flex-direction:column;overflow:hidden">
          <div style="flex:1;display:flex;align-items:center;justify-content:center;overflow-x:auto">
            <svg viewBox="0 0 ${svgW} 140" style="width:100%;max-height:100%">${targetSvg}${iterSvg}${cellsSvg}${bracketSvg}</svg>
          </div>
          <div style="margin-top:6px;padding:8px 10px;background:${msgBg};border:1px solid ${msgColor}40;border-radius:4px;font:11px 'JetBrains Mono',monospace;color:${msgColor};line-height:1.5">› ${cur.msg}</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px">
          <div style="background:${C.panel};border:1px solid ${C.border};border-radius:6px;padding:8px">
            <div style="font-size:9px;text-transform:uppercase;letter-spacing:0.1em;color:${C.muted};margin-bottom:6px;font-weight:600">State</div>
            ${stateHtml}
          </div>
          <div style="background:${C.panel};border:1px solid ${C.border};border-radius:6px;padding:8px;flex:1">
            <div style="font-size:9px;text-transform:uppercase;letter-spacing:0.1em;color:${C.muted};margin-bottom:6px;font-weight:600">Code</div>
            ${codeHtml}
          </div>
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
  function getTitle() { return 'Binary Search'; }
  function getStepCount() { return steps ? steps.length : 0; }
  function isPlaying() { return playing; }

  return { init, step, play, stop, reset, setSpeed, getTitle, getStepCount, isPlaying, render };
})();

if (typeof window.VIZ_REGISTRY === 'undefined') window.VIZ_REGISTRY = {};
window.VIZ_REGISTRY['binary-search'] = BinarySearchVisualizer;
