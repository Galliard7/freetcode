/* ══════════════════════════════════════════════════════════════
   FreetCode — Backtracking Visualizer (vanilla SVG)
   Demonstrates: Subsets (LC 78) — generates all subsets of [1,2,3]
   ══════════════════════════════════════════════════════════════ */

const BacktrackingVisualizer = (() => {

  const NUMS = [1, 2, 3];

  const CODE = [
    'def subsets(nums):',
    '    result = []',
    '    def backtrack(start, current):',
    '        result.append(current[:])',
    '        for i in range(start, len(nums)):',
    '            current.append(nums[i])',
    '            backtrack(i + 1, current)',
    '            current.pop()  # backtrack',
    '    backtrack(0, [])',
    '    return result',
  ];

  const C = {
    bg: '#0b1017', panel: '#111823', border: '#243040',
    text: '#dbe3ec', muted: '#7c8b9c',
    accent: '#5ec6e8', accentSoft: 'rgba(94,198,232,0.13)',
    include: '#22c55e', includeSoft: 'rgba(34,197,94,0.1)',
    exclude: '#ef4444', excludeSoft: 'rgba(239,68,68,0.08)',
    current: '#f59e0b', currentSoft: 'rgba(245,158,11,0.12)',
    collected: '#8b5cf6', collectedSoft: 'rgba(139,92,246,0.1)',
  };

  function generateSteps() {
    const steps = [];
    const result = [];

    function backtrack(start, current, depth) {
      // Record the current subset
      result.push([...current]);
      steps.push({
        type: 'collect',
        current: [...current],
        result: result.map(r => [...r]),
        start,
        depth,
        line: 3,
        msg: `collect [${current.join(',')}]${current.length === 0 ? ' (empty set)' : ''}`,
      });

      for (let i = start; i < NUMS.length; i++) {
        // Include nums[i]
        current.push(NUMS[i]);
        steps.push({
          type: 'include',
          current: [...current],
          result: result.map(r => [...r]),
          included: NUMS[i],
          start: i,
          depth: depth + 1,
          line: 5,
          msg: `include ${NUMS[i]} → current = [${current.join(',')}]`,
        });

        backtrack(i + 1, current, depth + 1);

        // Backtrack (pop)
        const popped = current.pop();
        steps.push({
          type: 'backtrack',
          current: [...current],
          result: result.map(r => [...r]),
          popped,
          start: i,
          depth,
          line: 7,
          msg: `backtrack: pop ${popped} → current = [${current.join(',')}]${current.length === 0 ? ' (empty)' : ''}`,
        });
      }
    }

    steps.push({ type: 'init', current: [], result: [], start: 0, depth: 0, line: 0, msg: 'start backtracking with nums = [1, 2, 3]' });
    backtrack(0, [], 0);
    steps.push({ type: 'done', current: [], result: result.map(r => [...r]), start: 0, depth: 0, line: 9, msg: `done! found ${result.length} subsets` });
    return steps;
  }

  let steps, stepIdx, playing, speed, timer, container;

  function init(el) {
    container = el;
    steps = generateSteps();
    stepIdx = 0;
    playing = false;
    speed = 800;
    render();
  }

  function render() {
    const cur = steps[stepIdx];

    // Decision tree — simplified as current path display
    const pathHtml = NUMS.map((n, i) => {
      const included = cur.current.includes(n);
      const bg = included ? C.includeSoft : C.panel;
      const border = included ? C.include : C.border;
      const color = included ? C.include : C.muted;
      return `<div style="width:56px;height:56px;display:flex;align-items:center;justify-content:center;background:${bg};border:2px solid ${border};border-radius:8px;font:600 20px 'JetBrains Mono',monospace;color:${color};transition:all 250ms">${n}</div>`;
    }).join('');

    // Current subset
    const currentHtml = cur.current.length > 0
      ? `<span style="font:600 15px 'JetBrains Mono',monospace;color:${C.current}">[${cur.current.join(', ')}]</span>`
      : `<span style="font:500 13px 'Inter',sans-serif;color:${C.muted};font-style:italic">[ ] empty</span>`;

    // Collected subsets
    let collectedHtml = '';
    if (cur.result && cur.result.length > 0) {
      collectedHtml = cur.result.map((s, i) => {
        const isLatest = i === cur.result.length - 1 && cur.type === 'collect';
        const bg = isLatest ? C.collectedSoft : C.panel;
        const border = isLatest ? C.collected : C.border;
        return `<div style="padding:4px 10px;background:${bg};border:1px solid ${border};border-radius:4px;font:12px 'JetBrains Mono',monospace;color:${C.text};transition:all 200ms">[${s.join(',')}]</div>`;
      }).join('');
    } else {
      collectedHtml = `<div style="color:${C.muted};font-style:italic;font-size:11px">none yet</div>`;
    }

    // Call stack depth visualization
    let depthHtml = '';
    for (let d = 0; d <= cur.depth; d++) {
      const isCurrent = d === cur.depth;
      depthHtml += `<div style="height:24px;background:${isCurrent ? C.currentSoft : C.panel};border:1px solid ${isCurrent ? C.current : C.border};border-radius:3px;display:flex;align-items:center;padding:0 8px;font:11px 'JetBrains Mono',monospace;color:${isCurrent ? C.current : C.muted};transition:all 200ms">depth ${d}</div>`;
    }

    let codeHtml = CODE.map((line, i) => {
      const active = i === cur.line;
      return `<div style="padding:2px 8px;background:${active ? C.accentSoft : 'transparent'};border-left:2px solid ${active ? C.accent : 'transparent'};font:11px 'JetBrains Mono',monospace;color:${active ? C.text : C.muted};white-space:pre">${line}</div>`;
    }).join('');

    const typeColor = cur.type === 'include' ? C.include : cur.type === 'backtrack' ? C.exclude : cur.type === 'collect' ? C.collected : C.accent;
    const typeBg = cur.type === 'include' ? C.includeSoft : cur.type === 'backtrack' ? C.excludeSoft : cur.type === 'collect' ? C.collectedSoft : C.accentSoft;

    container.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr 260px;gap:8px;height:100%;padding:8px;font-family:'Inter',sans-serif">
        <!-- Left: elements + current -->
        <div style="display:flex;flex-direction:column;gap:8px">
          <div style="background:${C.panel};border:1px solid ${C.border};border-radius:6px;padding:12px">
            <div style="font-size:9px;text-transform:uppercase;letter-spacing:0.1em;color:${C.muted};margin-bottom:10px;font-weight:600">Elements</div>
            <div style="display:flex;gap:10px;justify-content:center">${pathHtml}</div>
          </div>
          <div style="background:${C.panel};border:1px solid ${C.border};border-radius:6px;padding:12px">
            <div style="font-size:9px;text-transform:uppercase;letter-spacing:0.1em;color:${C.muted};margin-bottom:6px;font-weight:600">Current Subset</div>
            <div style="text-align:center;padding:8px 0">${currentHtml}</div>
          </div>
          <div style="background:${C.panel};border:1px solid ${C.border};border-radius:6px;padding:12px">
            <div style="font-size:9px;text-transform:uppercase;letter-spacing:0.1em;color:${C.muted};margin-bottom:6px;font-weight:600">Recursion Depth</div>
            <div style="display:flex;flex-direction:column;gap:3px">${depthHtml}</div>
          </div>
          <div style="padding:8px;background:${typeBg};border:1px solid ${typeColor};border-radius:4px;font:11px 'JetBrains Mono',monospace;color:${typeColor}">› ${cur.msg}</div>
        </div>
        <!-- Middle: collected results -->
        <div style="background:${C.panel};border:1px solid ${C.border};border-radius:6px;padding:12px;display:flex;flex-direction:column;overflow:hidden">
          <div style="font-size:9px;text-transform:uppercase;letter-spacing:0.1em;color:${C.muted};margin-bottom:6px;font-weight:600">Collected Subsets (${cur.result ? cur.result.length : 0})</div>
          <div style="flex:1;overflow-y:auto;display:flex;flex-wrap:wrap;gap:6px;align-content:start">${collectedHtml}</div>
        </div>
        <!-- Right: code -->
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
  function getTitle() { return 'Backtracking'; }
  function getStepCount() { return steps ? steps.length : 0; }
  function isPlaying() { return playing; }

  return { init, step, play, stop, reset, setSpeed, getTitle, getStepCount, isPlaying, render };
})();

if (typeof window.VIZ_REGISTRY === 'undefined') window.VIZ_REGISTRY = {};
window.VIZ_REGISTRY['backtracking'] = BacktrackingVisualizer;
