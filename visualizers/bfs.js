/* ══════════════════════════════════════════════════════════════
   FreetCode — BFS Visualizer (vanilla SVG)
   ══════════════════════════════════════════════════════════════ */

const BFSVisualizer = (() => {

  const TREE = {
    A: ['B', 'C'],
    B: ['D', 'E'],
    C: ['F', 'G'],
    D: [],
    E: [],
    F: [],
    G: [],
  };

  const POS = {
    A: [250, 40], B: [130, 120], C: [370, 120],
    D: [60, 200], E: [200, 200], F: [310, 200], G: [440, 200],
  };

  const CODE = [
    'def bfs(start):',
    '    queue = deque([start])',
    '    visited = {start}',
    '    while queue:',
    '        node = queue.popleft()',
    '        visit(node)',
    '        for child in node.children:',
    '            if child not in visited:',
    '                visited.add(child)',
    '                queue.append(child)',
  ];

  const C = {
    bg: '#0f0f0f', panel: '#161616', border: '#2a2a2a',
    text: '#e0e0e0', muted: '#666',
    accent: '#6366f1', accentSoft: 'rgba(99,102,241,0.15)',
    current: '#3b82f6', currentSoft: 'rgba(59,130,246,0.12)',
    visited: '#22c55e', visitedSoft: 'rgba(34,197,94,0.1)',
    queued: '#f59e0b', queuedSoft: 'rgba(245,158,11,0.1)',
  };

  function generateSteps() {
    const steps = [];
    const visited = new Set();
    const queue = [];

    queue.push('A');
    visited.add('A');
    steps.push({ type: 'init', node: 'A', queue: [...queue], visited: new Set(visited), line: 1, msg: 'initialize queue with start node A' });

    while (queue.length > 0) {
      const node = queue.shift();
      steps.push({ type: 'dequeue', node, queue: [...queue], visited: new Set(visited), line: 4, msg: `dequeue ${node} from front of queue` });
      steps.push({ type: 'visit', node, queue: [...queue], visited: new Set(visited), line: 5, msg: `visit ${node}` });

      for (const child of TREE[node]) {
        if (!visited.has(child)) {
          visited.add(child);
          queue.push(child);
          steps.push({ type: 'enqueue', node, child, queue: [...queue], visited: new Set(visited), line: 9, msg: `enqueue ${child} (neighbor of ${node})` });
        }
      }
    }
    steps.push({ type: 'done', node: null, queue: [], visited: new Set(visited), line: 3, msg: 'queue is empty — BFS complete' });
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

  function getNodeState(node) {
    const cur = steps[stepIdx];
    if (cur.node === node && (cur.type === 'visit' || cur.type === 'dequeue')) return 'current';
    if (cur.type === 'enqueue' && cur.child === node) return 'enqueuing';
    if (cur.queue.includes(node)) return 'queued';
    if (cur.visited.has(node)) return 'visited';
    return 'unvisited';
  }

  function stateColors(s) {
    const fills = { unvisited: C.panel, current: C.current, enqueuing: C.queuedSoft, queued: C.queuedSoft, visited: C.visitedSoft };
    const strokes = { unvisited: C.border, current: C.current, enqueuing: C.queued, queued: C.queued, visited: C.visited };
    const texts = { unvisited: C.muted, current: C.bg, enqueuing: C.text, queued: C.text, visited: C.visited };
    return { fill: fills[s], stroke: strokes[s], text: texts[s] };
  }

  function visitOrder() {
    return steps.slice(0, stepIdx + 1).filter(s => s.type === 'visit').map(s => s.node);
  }

  function render() {
    const cur = steps[stepIdx];
    const vOrder = visitOrder();

    // SVG edges
    let edgesSvg = '';
    for (const [parent, children] of Object.entries(TREE)) {
      for (const child of children) {
        const [px, py] = POS[parent];
        const [cx, cy] = POS[child];
        const isActive = cur.type === 'enqueue' && cur.node === parent && cur.child === child;
        const isTraversed = cur.visited.has(child);
        const color = isActive ? C.queued : isTraversed ? C.visited : C.border;
        const width = isActive ? 2.5 : isTraversed ? 1.5 : 1;
        edgesSvg += `<line x1="${px}" y1="${py}" x2="${cx}" y2="${cy}" stroke="${color}" stroke-width="${width}" style="transition:all 250ms"/>`;
      }
    }

    // SVG nodes
    let nodesSvg = '';
    for (const [node, [x, y]] of Object.entries(POS)) {
      const state = getNodeState(node);
      const { fill, stroke, text } = stateColors(state);
      const sw = state === 'unvisited' ? 1 : 2;
      const pulse = state === 'current'
        ? `<circle cx="${x}" cy="${y}" r="20" fill="none" stroke="${C.current}" opacity="0.4"><animate attributeName="r" values="20;30;20" dur="1.4s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.5;0;0.5" dur="1.4s" repeatCount="indefinite"/></circle>`
        : '';
      const order = vOrder.indexOf(node);
      const orderBadge = order >= 0
        ? `<circle cx="${x+16}" cy="${y-16}" r="7" fill="${C.bg}" stroke="${C.visited}" stroke-width="1"/><text x="${x+16}" y="${y-16}" text-anchor="middle" dominant-baseline="central" fill="${C.visited}" style="font:600 8px 'JetBrains Mono',monospace">${order+1}</text>`
        : '';
      nodesSvg += `${pulse}<circle cx="${x}" cy="${y}" r="20" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" style="transition:all 250ms"/><text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="central" fill="${text}" style="font:500 italic 17px 'Inter',sans-serif;transition:fill 250ms">${node}</text>${orderBadge}`;
    }

    // Queue display
    let queueHtml = '';
    if (cur.queue.length === 0) {
      queueHtml = `<div style="color:${C.muted};font-style:italic;font-size:11px;text-align:center;padding:12px 0">— empty —</div>`;
    } else {
      queueHtml = '<div style="display:flex;gap:4px;flex-wrap:wrap">';
      cur.queue.forEach((node, i) => {
        const isFirst = i === 0;
        const bg = isFirst ? C.currentSoft : C.queuedSoft;
        const bc = isFirst ? C.current : C.queued;
        queueHtml += `<div style="padding:6px 12px;background:${bg};border:1px solid ${bc};border-radius:4px;font:500 13px 'Inter',sans-serif;color:${C.text};transition:all 250ms">${node}${isFirst ? ' <span style="font:600 8px JetBrains Mono,monospace;color:' + C.current + ';margin-left:4px">← front</span>' : ''}</div>`;
      });
      queueHtml += '</div>';
    }

    // Visit order pills
    let orderHtml = vOrder.map(n =>
      `<span style="font:500 10px 'JetBrains Mono',monospace;color:${C.text};background:${C.visitedSoft};border:1px solid ${C.visited};padding:1px 6px;border-radius:3px">${n}</span>`
    ).join(' ') || `<span style="color:${C.muted};font-style:italic;font-size:11px">—</span>`;

    // Code highlight
    let codeHtml = CODE.map((line, i) => {
      const active = i === cur.line;
      return `<div style="padding:2px 8px;background:${active ? C.accentSoft : 'transparent'};border-left:2px solid ${active ? C.accent : 'transparent'};font:12px 'JetBrains Mono',monospace;color:${active ? C.text : C.muted};transition:all 200ms;white-space:pre">${line}</div>`;
    }).join('');

    container.innerHTML = `
      <div style="display:grid;grid-template-columns:2fr 1fr 1.2fr;gap:8px;height:100%;padding:8px;font-family:'Inter',sans-serif">
        <div style="background:${C.panel};border:1px solid ${C.border};border-radius:6px;padding:8px;display:flex;flex-direction:column;overflow:hidden">
          <div style="font-size:9px;text-transform:uppercase;letter-spacing:0.1em;color:${C.muted};margin-bottom:4px;font-weight:600">Graph</div>
          <svg viewBox="0 0 500 240" style="width:100%;flex:1;min-height:0">${edgesSvg}${nodesSvg}</svg>
          <div style="display:flex;gap:12px;padding-top:6px;border-top:1px solid ${C.border};font:9px 'JetBrains Mono',monospace;color:${C.muted}">
            <span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${C.current};vertical-align:middle;margin-right:3px"></span>current</span>
            <span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;border:1.5px solid ${C.queued};vertical-align:middle;margin-right:3px"></span>queued</span>
            <span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;border:1.5px solid ${C.visited};vertical-align:middle;margin-right:3px"></span>visited</span>
          </div>
        </div>
        <div style="background:${C.panel};border:1px solid ${C.border};border-radius:6px;padding:8px;display:flex;flex-direction:column;overflow:hidden">
          <div style="font-size:9px;text-transform:uppercase;letter-spacing:0.1em;color:${C.muted};margin-bottom:4px;font-weight:600">Queue (FIFO)</div>
          <div style="flex:1;overflow-y:auto">${queueHtml}</div>
          <div style="padding-top:6px;border-top:1px solid ${C.border}">
            <div style="font:600 9px 'JetBrains Mono',monospace;color:${C.muted};text-transform:uppercase;letter-spacing:0.1em;margin-bottom:4px">Visit Order</div>
            <div style="display:flex;flex-wrap:wrap;gap:4px">${orderHtml}</div>
          </div>
        </div>
        <div style="background:${C.panel};border:1px solid ${C.border};border-radius:6px;padding:8px;display:flex;flex-direction:column;overflow:hidden">
          <div style="font-size:9px;text-transform:uppercase;letter-spacing:0.1em;color:${C.muted};margin-bottom:6px;font-weight:600">Code</div>
          <div style="flex:1">${codeHtml}</div>
          <div style="margin-top:8px;padding:8px;background:${C.currentSoft};border:1px solid ${C.current};border-radius:4px;font:11px 'JetBrains Mono',monospace;color:${C.current}">› ${cur.msg}</div>
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
  function getTitle() { return 'Breadth-First Search'; }
  function getStepCount() { return steps ? steps.length : 0; }
  function isPlaying() { return playing; }

  return { init, step, play, stop, reset, setSpeed, getTitle, getStepCount, isPlaying, render };
})();

if (typeof window.VIZ_REGISTRY === 'undefined') window.VIZ_REGISTRY = {};
window.VIZ_REGISTRY['bfs'] = BFSVisualizer;
