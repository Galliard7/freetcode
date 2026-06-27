/* ══════════════════════════════════════════════════════════════
   FreetCode — DFS Visualizer (vanilla SVG, no React)
   ══════════════════════════════════════════════════════════════ */

const DFSVisualizer = (() => {

  // ─── Tree structure ───
  const TREE = {
    A: ['B', 'C'],
    B: ['D', 'E'],
    C: ['F'],
    D: [],
    E: ['G'],
    F: [],
    G: [],
  };

  const POS = {
    A: [250, 40], B: [130, 120], C: [370, 120],
    D: [60, 200], E: [200, 200], F: [370, 200], G: [200, 280],
  };

  const CODE = [
    'def dfs(node):',
    '    visit(node)',
    '    for child in node.children:',
    '        dfs(child)',
    '    return',
  ];

  // ─── Colors ───
  const C = {
    bg: '#0f0f0f', panel: '#161616', border: '#2a2a2a',
    text: '#e0e0e0', muted: '#666',
    accent: '#6366f1', accentSoft: 'rgba(99,102,241,0.15)',
    current: '#f59e0b', currentSoft: 'rgba(245,158,11,0.12)',
    visited: '#22c55e', visitedSoft: 'rgba(34,197,94,0.1)',
    stack: '#c084fc', stackSoft: 'rgba(192,132,252,0.1)',
  };

  // ─── Generate steps ───
  function generateSteps() {
    const steps = [];
    const visited = new Set();
    const stack = [];

    function dfs(node) {
      stack.push(node);
      steps.push({ type: 'enter', node, stack: [...stack], visited: new Set(visited), line: 0, msg: `call dfs(${node}) — push frame` });
      visited.add(node);
      steps.push({ type: 'visit', node, stack: [...stack], visited: new Set(visited), line: 1, msg: `visit ${node}` });
      for (const child of TREE[node]) {
        steps.push({ type: 'recurse', node, child, stack: [...stack], visited: new Set(visited), line: 3, msg: `descend ${node} → ${child}` });
        dfs(child);
      }
      stack.pop();
      steps.push({ type: 'return', node, stack: [...stack], visited: new Set(visited), line: 4, msg: `return from dfs(${node}) — pop frame` });
    }

    dfs('A');
    return steps;
  }

  let steps, stepIdx, playing, speed, timer;
  let container;

  function init(el) {
    container = el;
    steps = generateSteps();
    stepIdx = 0;
    playing = false;
    speed = 800;
    render();
  }

  function getNodeState(node) {
    const cur = steps[stepIdx];
    if (cur.node === node) {
      if (cur.type === 'visit') return 'visiting';
      if (cur.type === 'enter') return 'entering';
      if (cur.type === 'return') return 'returning';
    }
    if (cur.stack.includes(node)) return 'on-stack';
    if (cur.visited.has(node)) return 'visited';
    return 'unvisited';
  }

  function stateColors(s) {
    const fills = { unvisited: C.panel, entering: C.currentSoft, visiting: C.current, returning: C.stackSoft, 'on-stack': C.stackSoft, visited: C.visitedSoft };
    const strokes = { unvisited: C.border, entering: C.current, visiting: C.current, returning: C.stack, 'on-stack': C.stack, visited: C.visited };
    const texts = { unvisited: C.muted, entering: C.text, visiting: C.bg, returning: C.text, 'on-stack': C.text, visited: C.visited };
    return { fill: fills[s], stroke: strokes[s], text: texts[s] };
  }

  function visitOrder() {
    return steps.slice(0, stepIdx + 1).filter(s => s.type === 'visit').map(s => s.node);
  }

  function render() {
    const cur = steps[stepIdx];
    const activeEdge = cur.type === 'recurse' ? { from: cur.node, to: cur.child } : null;
    const vOrder = visitOrder();

    // Build SVG for tree
    let edgesSvg = '';
    for (const [parent, children] of Object.entries(TREE)) {
      for (const child of children) {
        const [px, py] = POS[parent];
        const [cx, cy] = POS[child];
        const isActive = activeEdge && activeEdge.from === parent && activeEdge.to === child;
        const isTraversed = cur.visited.has(child) || cur.stack.includes(child);
        const color = isActive ? C.current : isTraversed ? C.stack : C.border;
        const width = isActive ? 2.5 : isTraversed ? 1.5 : 1;
        edgesSvg += `<line x1="${px}" y1="${py}" x2="${cx}" y2="${cy}" stroke="${color}" stroke-width="${width}" style="transition:all 250ms"/>`;
      }
    }

    let nodesSvg = '';
    for (const [node, [x, y]] of Object.entries(POS)) {
      const state = getNodeState(node);
      const { fill, stroke, text } = stateColors(state);
      const sw = state === 'unvisited' ? 1 : 2;
      const pulse = (state === 'visiting' || state === 'entering')
        ? `<circle cx="${x}" cy="${y}" r="20" fill="none" stroke="${C.current}" opacity="0.4"><animate attributeName="r" values="20;30;20" dur="1.4s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.5;0;0.5" dur="1.4s" repeatCount="indefinite"/></circle>`
        : '';
      const order = vOrder.indexOf(node);
      const orderBadge = order >= 0
        ? `<circle cx="${x+16}" cy="${y-16}" r="7" fill="${C.bg}" stroke="${C.visited}" stroke-width="1"/><text x="${x+16}" y="${y-16}" text-anchor="middle" dominant-baseline="central" fill="${C.visited}" style="font:600 8px 'JetBrains Mono',monospace">${order+1}</text>`
        : '';
      nodesSvg += `${pulse}<circle cx="${x}" cy="${y}" r="20" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" style="transition:all 250ms"/><text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="central" fill="${text}" style="font:500 italic 17px 'Inter',sans-serif;transition:fill 250ms">${node}</text>${orderBadge}`;
    }

    // Stack display
    let stackHtml = '';
    if (cur.stack.length === 0) {
      stackHtml = '<div style="color:' + C.muted + ';font-style:italic;font-size:11px;text-align:center;padding:12px 0">— empty —</div>';
    } else {
      for (let i = cur.stack.length - 1; i >= 0; i--) {
        const node = cur.stack[i];
        const isTop = i === cur.stack.length - 1;
        const bg = isTop ? C.currentSoft : C.panel;
        const bc = isTop ? C.current : C.stack;
        stackHtml += `<div style="padding:6px 10px;margin:2px 0;background:${bg};border:1px solid ${bc};border-radius:4px;font-size:13px;display:flex;justify-content:space-between;align-items:center;transition:all 250ms${isTop ? ';transform:translateX(3px)' : ''}">
          <span>dfs(<span style="color:${isTop ? C.current : C.accent};font-weight:600">${node}</span>)</span>
          ${isTop ? '<span style="font:600 8px JetBrains Mono,monospace;color:' + C.current + ';text-transform:uppercase;letter-spacing:0.1em">↑ top</span>' : ''}
        </div>`;
      }
    }

    // Visit order pills
    let orderHtml = vOrder.map(n =>
      `<span style="font:500 10px 'JetBrains Mono',monospace;color:${C.text};background:${C.visitedSoft};border:1px solid ${C.visited};padding:1px 6px;border-radius:3px">${n}</span>`
    ).join(' ') || '<span style="color:' + C.muted + ';font-style:italic;font-size:11px">—</span>';

    // Code with highlight
    let codeHtml = CODE.map((line, i) => {
      const active = i === cur.line;
      const bg = active ? C.accentSoft : 'transparent';
      const color = active ? C.text : C.muted;
      return `<div style="padding:2px 8px;background:${bg};border-left:2px solid ${active ? C.accent : 'transparent'};font:12px 'JetBrains Mono',monospace;color:${color};transition:all 200ms;white-space:pre">${line}</div>`;
    }).join('');

    container.innerHTML = `
      <div style="display:grid;grid-template-columns:2fr 1fr 1.2fr;gap:8px;height:100%;padding:8px;font-family:'Inter',sans-serif">
        <!-- Tree -->
        <div style="background:${C.panel};border:1px solid ${C.border};border-radius:6px;padding:8px;display:flex;flex-direction:column;overflow:hidden">
          <div style="font-size:9px;text-transform:uppercase;letter-spacing:0.1em;color:${C.muted};margin-bottom:4px;font-weight:600">Tree</div>
          <svg viewBox="0 0 500 310" style="width:100%;flex:1;min-height:0">${edgesSvg}${nodesSvg}</svg>
          <div style="display:flex;gap:12px;padding-top:6px;border-top:1px solid ${C.border};font:9px 'JetBrains Mono',monospace;color:${C.muted}">
            <span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${C.current};vertical-align:middle;margin-right:3px"></span>current</span>
            <span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;border:1.5px solid ${C.stack};vertical-align:middle;margin-right:3px"></span>on stack</span>
            <span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;border:1.5px solid ${C.visited};vertical-align:middle;margin-right:3px"></span>visited</span>
          </div>
        </div>
        <!-- Stack -->
        <div style="background:${C.panel};border:1px solid ${C.border};border-radius:6px;padding:8px;display:flex;flex-direction:column;overflow:hidden">
          <div style="font-size:9px;text-transform:uppercase;letter-spacing:0.1em;color:${C.muted};margin-bottom:4px;font-weight:600">Call Stack</div>
          <div style="flex:1;overflow-y:auto;display:flex;flex-direction:column">${stackHtml}</div>
          <div style="padding-top:6px;border-top:1px solid ${C.border}">
            <div style="font:600 9px 'JetBrains Mono',monospace;color:${C.muted};text-transform:uppercase;letter-spacing:0.1em;margin-bottom:4px">Visit Order</div>
            <div style="display:flex;flex-wrap:wrap;gap:4px">${orderHtml}</div>
          </div>
        </div>
        <!-- Code -->
        <div style="background:${C.panel};border:1px solid ${C.border};border-radius:6px;padding:8px;display:flex;flex-direction:column;overflow:hidden">
          <div style="font-size:9px;text-transform:uppercase;letter-spacing:0.1em;color:${C.muted};margin-bottom:6px;font-weight:600">Code</div>
          <div style="flex:1">${codeHtml}</div>
          <div style="margin-top:8px;padding:8px;background:${C.currentSoft};border:1px solid ${C.current};border-radius:4px;font:11px 'JetBrains Mono',monospace;color:${C.current}">
            › ${cur.msg}
          </div>
        </div>
      </div>`;
  }

  function step(dir) {
    stop();
    stepIdx = Math.max(0, Math.min(steps.length - 1, stepIdx + dir));
    render();
    updateStepLabel();
  }

  function play() {
    if (stepIdx >= steps.length - 1) stepIdx = 0;
    playing = true;
    tick();
  }

  function tick() {
    if (!playing || stepIdx >= steps.length - 1) { stop(); return; }
    stepIdx++;
    render();
    updateStepLabel();
    timer = setTimeout(tick, speed);
  }

  function stop() {
    playing = false;
    clearTimeout(timer);
  }

  function reset() {
    stop();
    stepIdx = 0;
    render();
    updateStepLabel();
  }

  function setSpeed(s) {
    speed = s;
  }

  function updateStepLabel() {
    const label = document.getElementById('viz-step-label');
    if (label) label.textContent = `${stepIdx + 1} / ${steps.length}`;
  }

  function getTitle() { return 'Depth-First Search'; }
  function getStepCount() { return steps ? steps.length : 0; }
  function isPlaying() { return playing; }

  return { init, step, play, stop, reset, setSpeed, getTitle, getStepCount, isPlaying, render };
})();

// Register with visualizer system
if (typeof window.VIZ_REGISTRY === 'undefined') window.VIZ_REGISTRY = {};
window.VIZ_REGISTRY['dfs'] = DFSVisualizer;
