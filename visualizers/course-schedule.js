/* ══════════════════════════════════════════════════════════════
   FreetCode — Course Schedule (DFS cycle detection) Visualizer
   Vanilla SVG, no deps. Three-color DFS: WHITE / GRAY (on path) /
   BLACK (done). A GRAY neighbour = back edge = cycle = can't finish.
   ══════════════════════════════════════════════════════════════ */

const CourseScheduleVisualizer = (() => {

  // ─── Three worked examples of increasing complexity ───
  // prerequisites use LeetCode form [a, b] = "b before a"; edge drawn b → a.
  const EXAMPLES = [
    {
      label: '1 · Chain',
      n: 3,
      prereqs: [[1, 0], [2, 1]],
      pos: { 0: [70, 150], 1: [175, 150], 2: [280, 150] },
      blurb: 'n=3, prerequisites=[[1,0],[2,1]] — a straight line 0→1→2.',
    },
    {
      label: '2 · Diamond',
      n: 4,
      prereqs: [[1, 0], [2, 0], [3, 1], [3, 2]],
      pos: { 0: [175, 50], 1: [80, 155], 2: [270, 155], 3: [175, 255] },
      blurb: 'n=4 — two paths re-converge on 3. Re-visiting a finished (BLACK) node is NOT a cycle.',
    },
    {
      label: '3 · Cycle',
      n: 4,
      prereqs: [[1, 0], [2, 1], [0, 2], [3, 2]],
      pos: { 0: [90, 80], 1: [265, 80], 2: [265, 220], 3: [90, 220] },
      blurb: 'n=4 — 0→1→2→0 is a circular dependency. No course can go first.',
    },
  ];

  const CODE = [
    'def canFinish(n, prerequisites):',
    '    g = build_graph(prerequisites)  # b→a',
    '    state = [WHITE] * n',
    '    def has_cycle(u):',
    '        state[u] = GRAY',
    '        for v in g[u]:',
    '            if state[v] == GRAY:',
    '                return True    # cycle!',
    '            if state[v] == WHITE and has_cycle(v):',
    '                return True',
    '        state[u] = BLACK',
    '        return False',
    '    return not any(has_cycle(c) for c',
    '                   in range(n) if state[c] == WHITE)',
  ];

  const C = {
    bg: '#0b1017', panel: '#111823', border: '#243040',
    text: '#dbe3ec', muted: '#7c8b9c',
    accent: '#5ec6e8', accentSoft: 'rgba(94,198,232,0.13)',  // bright blue = live/active (edge, UI primary)
    gray: '#aeb8c2', graySoft: 'rgba(174,184,194,0.14)',     // GRAY = on the recursion stack
    black: '#29ABCA', blackSoft: 'rgba(41,171,202,0.14)',    // BLACK = finished / safe (blue rim)
    cycle: '#FC6255', cycleSoft: 'rgba(252,98,85,0.14)',     // cycle / back edge
    white: '#aab6c4',                                        // WHITE = unvisited node (dimmed)
  };
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const R = 21;

  // ─── Build adjacency list: for [a,b], b unlocks a → edge b→a ───
  function buildGraph(ex) {
    const g = {};
    for (let i = 0; i < ex.n; i++) g[i] = [];
    for (const [a, b] of ex.prereqs) g[b].push(a);
    return g;
  }

  // ─── Generate the DFS step trace for one example ───
  function generateSteps(ex) {
    const g = buildGraph(ex);
    const state = new Array(ex.n).fill(WHITE);
    const path = [];
    const steps = [];
    let done = false;

    const snap = (extra) => steps.push(Object.assign({
      state: [...state], path: [...path], edge: null,
      cycleNodes: [], cycleEdges: [], verdict: null, line: 5,
    }, extra));

    function hasCycle(u) {
      state[u] = GRAY; path.push(u);
      snap({ node: u, line: 4, msg: `enter ${u}: mark GRAY — it's now on the active path` });
      for (const v of g[u]) {
        snap({ node: u, edge: [u, v], line: 5, msg: `look at edge ${u} → ${v}` });
        if (state[v] === GRAY) {
          const idx = path.indexOf(v);
          const cyc = path.slice(idx);
          const cycEdges = cyc.map((x, i) => [x, cyc[(i + 1) % cyc.length]]);
          snap({
            node: u, edge: [u, v], line: 7,
            cycleNodes: cyc, cycleEdges: cycEdges, verdict: false,
            msg: `${v} is GRAY — already on our path ⇒ CYCLE ${cyc.join('→')}→${cyc[0]}`,
          });
          done = true;
          return true;
        }
        if (state[v] === WHITE) {
          snap({ node: u, edge: [u, v], line: 8, msg: `${v} is WHITE (unseen) — recurse into it` });
          if (hasCycle(v)) return true;
        } else {
          snap({ node: u, edge: [u, v], line: 5, msg: `${v} is BLACK (finished) — safe, skip. Re-convergence ≠ cycle` });
        }
      }
      state[u] = BLACK; path.pop();
      snap({ node: u, line: 10, msg: `all of ${u}'s edges cleared → mark BLACK (done & safe)` });
      return false;
    }

    for (let c = 0; c < ex.n && !done; c++) {
      if (state[c] === WHITE) {
        snap({ node: c, line: 12, msg: `outer loop: ${c} still WHITE → start has_cycle(${c})` });
        hasCycle(c);
      }
    }

    const finalVerdict = !done;   // no cycle ⇒ can finish
    snap({
      node: null, line: finalVerdict ? 12 : 7, verdict: finalVerdict,
      cycleNodes: done ? steps[steps.length - 1].cycleNodes : [],
      cycleEdges: done ? steps[steps.length - 1].cycleEdges : [],
      msg: finalVerdict
        ? `No GRAY node was ever revisited ⇒ no cycle ⇒ can finish all ${ex.n} courses ✓`
        : `A GRAY node was revisited ⇒ cycle ⇒ cannot finish all courses ✗`,
      final: true,
    });
    return steps;
  }

  let exIdx, steps, stepIdx, playing, speed, timer, container;

  function loadExample(i) {
    exIdx = i;
    steps = generateSteps(EXAMPLES[i]);
    stepIdx = 0;
    render();
    updateStepLabel();
  }

  function init(el) {
    container = el;
    speed = 800;
    playing = false;
    // one delegated handler survives innerHTML re-renders (container persists)
    container.onclick = (e) => {
      const tab = e.target.closest('[data-ex]');
      if (tab) { stop(); loadExample(+tab.dataset.ex); }
    };
    loadExample(0);
  }

  // trim a segment so it starts/ends at the node borders (room for arrowhead)
  function trim(x1, y1, x2, y2, r1, r2) {
    const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1;
    const ux = dx / L, uy = dy / L;
    return [x1 + ux * r1, y1 + uy * r1, x2 - ux * r2, y2 - uy * r2];
  }

  // colors for the state chips / legend (labels on the dark UI)
  function nodeColors(st, isCycleNode) {
    if (isCycleNode) return { fill: C.cycleSoft, stroke: C.cycle, text: C.cycle };
    if (st === GRAY) return { fill: C.graySoft, stroke: C.gray, text: C.gray };
    if (st === BLACK) return { fill: C.blackSoft, stroke: C.black, text: C.black };
    return { fill: C.panel, stroke: C.muted, text: C.muted };
  }

  // solid-orb styling for the graph nodes — true WHITE→GRAY→BLACK with a
  // soft halo glow. `text` always contrasts the core so the number never
  // washes out (dark digit on light nodes, light digit on the dark done node).
  function nodeStyle(st, isCycleNode) {
    if (isCycleNode) return { core: '#3a1a1c', rim: C.cycle,   halo: C.cycle, haloOp: 0.55, text: '#ffe0de' };
    if (st === GRAY)  return { core: '#79848f', rim: '#c2cbd4', halo: '#aeb8c2', haloOp: 0.42, text: '#101620' };
    if (st === BLACK) return { core: '#131b26', rim: C.black,   halo: C.black, haloOp: 0.55, text: '#dbe9f2' };
    return { core: '#aab6c4', rim: '#c8d2dd', halo: '#8ba0b5', haloOp: 0.16, text: '#0e141d' }; // WHITE (dimmed)
  }

  function render() {
    const ex = EXAMPLES[exIdx];
    const g = buildGraph(ex);
    const cur = steps[stepIdx];
    const cycleNodeSet = new Set(cur.cycleNodes);
    const cycleEdgeSet = new Set((cur.cycleEdges || []).map(([a, b]) => a + '-' + b));

    // ── edges ──
    let edgesSvg = '';
    for (let u = 0; u < ex.n; u++) {
      for (const v of g[u]) {
        const [x1, y1] = ex.pos[u], [x2, y2] = ex.pos[v];
        const [ax, ay, bx, by] = trim(x1, y1, x2, y2, R, R + 5);
        const isCycle = cycleEdgeSet.has(u + '-' + v);
        const isActive = cur.edge && cur.edge[0] === u && cur.edge[1] === v;
        const touched = cur.state[u] !== WHITE && cur.state[v] !== WHITE;
        let col = C.border, mk = 'idle', w = 1.4;
        if (isCycle) { col = C.cycle; mk = 'cycle'; w = 2.6; }
        else if (isActive) { col = C.accent; mk = 'active'; w = 2.6; }
        else if (touched) { col = '#33465a'; mk = 'idle'; w = 1.6; }
        edgesSvg += `<line x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}" stroke="${col}" stroke-width="${w}" marker-end="url(#cs-ah-${mk})" style="transition:all 220ms"/>`;
      }
    }

    // ── nodes (halo glow + solid orb, number always legible) ──
    let nodesSvg = '';
    for (let node = 0; node < ex.n; node++) {
      const [x, y] = ex.pos[node];
      const s = nodeStyle(cur.state[node], cycleNodeSet.has(node));
      const isCurrent = cur.node === node && !cur.final;
      // soft blurred halo — brighter/larger for the node we're on right now
      const haloOp = isCurrent ? Math.min(0.85, s.haloOp + 0.3) : s.haloOp;
      const haloR = isCurrent ? R + 12 : R + 7;
      const halo = `<circle cx="${x}" cy="${y}" r="${haloR}" fill="${s.halo}" opacity="${haloOp}" filter="url(#cs-glow)" style="transition:all 260ms"/>`;
      const pulse = isCurrent
        ? `<circle cx="${x}" cy="${y}" r="${R + 3}" fill="none" stroke="${s.rim}" stroke-width="1.5" opacity="0.6"><animate attributeName="r" values="${R + 3};${R + 13};${R + 3}" dur="1.5s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.6;0;0.6" dur="1.5s" repeatCount="indefinite"/></circle>`
        : '';
      nodesSvg += `${halo}${pulse}<circle cx="${x}" cy="${y}" r="${R}" fill="${s.core}" stroke="${s.rim}" stroke-width="2" style="transition:all 260ms"/><text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="central" fill="${s.text}" style="font:700 17px 'JetBrains Mono',monospace;transition:fill 260ms">${node}</text>`;
    }

    const defs = `<defs>
      <filter id="cs-glow" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="4.5"/></filter>
      <marker id="cs-ah-idle" markerWidth="9" markerHeight="9" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="#33465a"/></marker>
      <marker id="cs-ah-active" markerWidth="9" markerHeight="9" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="${C.accent}"/></marker>
      <marker id="cs-ah-cycle" markerWidth="9" markerHeight="9" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="${C.cycle}"/></marker>
    </defs>`;

    // ── example tabs ──
    const tabs = EXAMPLES.map((e, i) => {
      const on = i === exIdx;
      return `<button data-ex="${i}" style="cursor:pointer;padding:5px 12px;border-radius:5px;font:600 11px 'Inter',sans-serif;border:1px solid ${on ? C.accent : C.border};background:${on ? C.accentSoft : 'transparent'};color:${on ? C.accent : C.muted};transition:all 150ms">${e.label}</button>`;
    }).join('');

    // ── state chips (per-course color) ──
    const legend = (col, lbl) => `<span style="display:inline-flex;align-items:center;gap:4px"><span style="width:9px;height:9px;border-radius:50%;border:1.5px solid ${col};background:${col}22"></span>${lbl}</span>`;
    let chips = '';
    for (let i = 0; i < ex.n; i++) {
      const { stroke } = nodeColors(cur.state[i], cycleNodeSet.has(i));
      const name = cur.state[i] === GRAY ? 'GRAY' : cur.state[i] === BLACK ? 'BLACK' : 'WHITE';
      chips += `<div style="display:flex;justify-content:space-between;align-items:center;padding:3px 8px;margin:2px 0;background:${C.bg};border:1px solid ${stroke};border-radius:4px;font:11px 'JetBrains Mono',monospace"><span style="color:${C.text}">course ${i}</span><span style="color:${stroke};font-weight:600">${name}</span></div>`;
    }

    // ── path (recursion stack) ──
    const pathHtml = cur.path.length
      ? cur.path.map((n, i) => `<span style="font:600 11px 'JetBrains Mono',monospace;color:${C.gray};background:${C.graySoft};border:1px solid ${C.gray};padding:1px 7px;border-radius:3px">${n}</span>`).join('<span style="color:'+C.muted+'">→</span>')
      : `<span style="color:${C.muted};font-style:italic;font-size:11px">— empty —</span>`;

    // ── verdict banner ──
    let verdict = '';
    if (cur.verdict === true) verdict = `<div style="padding:7px 10px;background:${C.blackSoft};border:1px solid ${C.black};border-radius:5px;color:${C.black};font:600 12px 'Inter',sans-serif">✓ Can finish all courses — returns True</div>`;
    else if (cur.verdict === false) verdict = `<div style="padding:7px 10px;background:${C.cycleSoft};border:1px solid ${C.cycle};border-radius:5px;color:${C.cycle};font:600 12px 'Inter',sans-serif">✗ Cannot finish — cycle detected — returns False</div>`;

    // ── code ──
    const codeHtml = CODE.map((line, i) => {
      const active = i === cur.line;
      return `<div style="padding:2px 8px;background:${active ? C.accentSoft : 'transparent'};border-left:2px solid ${active ? C.accent : 'transparent'};font:11.5px 'JetBrains Mono',monospace;color:${active ? C.text : C.muted};transition:all 180ms;white-space:pre">${line}</div>`;
    }).join('');

    container.innerHTML = `
      <div style="display:flex;flex-direction:column;height:100%;gap:8px;padding:8px;font-family:'Inter',sans-serif;box-sizing:border-box">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <div style="display:flex;gap:6px">${tabs}</div>
          <span style="color:${C.muted};font-size:11px;flex:1;min-width:180px">${ex.blurb}</span>
        </div>
        <div style="display:grid;grid-template-columns:1.7fr 1fr 1.3fr;gap:8px;flex:1;min-height:0">
          <!-- graph -->
          <div style="background:${C.panel};border:1px solid ${C.border};border-radius:6px;padding:8px;display:flex;flex-direction:column;overflow:hidden">
            <div style="font-size:9px;text-transform:uppercase;letter-spacing:0.1em;color:${C.muted};margin-bottom:4px;font-weight:600">Prerequisite graph &nbsp;(arrow = "must come before")</div>
            <svg viewBox="0 0 350 300" style="width:100%;flex:1;min-height:0">${defs}${edgesSvg}${nodesSvg}</svg>
            <div style="display:flex;gap:12px;padding-top:6px;border-top:1px solid ${C.border};font:9px 'Inter',sans-serif;color:${C.muted}">
              ${legend(C.white, 'WHITE unseen')} ${legend(C.gray, 'GRAY on stack')} ${legend(C.black, 'BLACK done')} ${legend(C.cycle, 'cycle')}
            </div>
          </div>
          <!-- state + path -->
          <div style="background:${C.panel};border:1px solid ${C.border};border-radius:6px;padding:8px;display:flex;flex-direction:column;overflow:hidden">
            <div style="font-size:9px;text-transform:uppercase;letter-spacing:0.1em;color:${C.muted};margin-bottom:4px;font-weight:600">Course states</div>
            <div style="overflow-y:auto">${chips}</div>
            <div style="margin-top:8px;padding-top:6px;border-top:1px solid ${C.border}">
              <div style="font:600 9px 'JetBrains Mono',monospace;color:${C.muted};text-transform:uppercase;letter-spacing:0.1em;margin-bottom:5px">Active path (recursion stack)</div>
              <div style="display:flex;flex-wrap:wrap;gap:4px;align-items:center">${pathHtml}</div>
            </div>
          </div>
          <!-- code -->
          <div style="background:${C.panel};border:1px solid ${C.border};border-radius:6px;padding:8px;display:flex;flex-direction:column;overflow:hidden">
            <div style="font-size:9px;text-transform:uppercase;letter-spacing:0.1em;color:${C.muted};margin-bottom:6px;font-weight:600">DFS cycle detection</div>
            <div style="flex:1;overflow:auto">${codeHtml}</div>
          </div>
        </div>
        <!-- narration + verdict -->
        <div style="display:flex;gap:8px;align-items:stretch">
          <div style="flex:1;padding:8px 10px;background:${C.accentSoft};border:1px solid ${C.accent};border-radius:5px;font:12px 'JetBrains Mono',monospace;color:${C.accent};display:flex;align-items:center">› ${cur.msg}</div>
          ${verdict}
        </div>
      </div>`;
  }

  function step(dir) {
    stop();
    stepIdx = Math.max(0, Math.min(steps.length - 1, stepIdx + dir));
    render(); updateStepLabel();
  }
  function play() {
    if (stepIdx >= steps.length - 1) stepIdx = 0;
    playing = true; tick();
  }
  function tick() {
    if (!playing || stepIdx >= steps.length - 1) { stop(); return; }
    stepIdx++; render(); updateStepLabel();
    timer = setTimeout(tick, speed);
  }
  function stop() { playing = false; clearTimeout(timer); }
  function reset() { stop(); stepIdx = 0; render(); updateStepLabel(); }
  function setSpeed(s) { speed = s; }
  function updateStepLabel() {
    const label = document.getElementById('viz-step-label');
    if (label) label.textContent = `${stepIdx + 1} / ${steps.length}`;
  }
  function getTitle() { return 'Course Schedule — DFS Cycle Detection'; }
  function getStepCount() { return steps ? steps.length : 0; }
  function isPlaying() { return playing; }

  return { init, step, play, stop, reset, setSpeed, getTitle, getStepCount, isPlaying, render };
})();

if (typeof window.VIZ_REGISTRY === 'undefined') window.VIZ_REGISTRY = {};
window.VIZ_REGISTRY['course-schedule'] = CourseScheduleVisualizer;
