// SPDX-License-Identifier: AGPL-3.0-or-later
// FreetCode — Copyright (C) 2026 Galliard7. See LICENSE.

/* ══════════════════════════════════════════════════════════════════
   FreetCode — Scratchpad: per-problem freehand sketch + notes.

   Independent of the tutor/model. An adjustable split beside the editor
   to draw trees/pointers and jot ideas. Strokes are stored as vectors
   (normalized 0..1), so they survive resize and restore cleanly.
   Persisted in localStorage, keyed by problem number; switches with the
   oc:problemchange event fired by the main app.

   Revert: delete scratch.js + scratch.css and the #scratch* markup +
   the .editor-row wrapper in index.html.
   ══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  const KEY = 'freetcode_scratch';        // { [num]: { strokes, notes } }
  const WKEY = 'freetcode_scratch_w';     // remembered panel width
  const $ = (id) => document.getElementById(id);
  const pad = $('scratchpad'); if (!pad) return;
  const main = $('main');
  const canvas = $('scratch-canvas');
  const notes = $('scratch-notes');
  const wrap = canvas.parentElement;
  const ctx = canvas.getContext('2d');

  let store = {};
  try { store = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { store = {}; }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) {} };
  const curNum = () => { const p = (window.__oc || {}).problem; return p ? p.num : null; };

  let activeNum = curNum();
  let tool = 'pen', color = '#e2e8f0', size = 2;
  let strokes = [];            // [{tool,color,size,pts:[[nx,ny],...]}]
  let drawing = false, cur = null;

  // ── per-problem persistence ──
  function loadProblem(num) {
    activeNum = num;
    const rec = (num != null && store[num]) ? store[num] : { strokes: [], notes: '' };
    strokes = rec.strokes ? JSON.parse(JSON.stringify(rec.strokes)) : [];
    notes.value = rec.notes || '';
    redraw();
  }
  function persist() {
    if (activeNum == null) return;
    store[activeNum] = { strokes, notes: notes.value };
    save();
  }

  // ── canvas (vectors stored normalized; repainted at current size) ──
  function fitCanvas() {
    const r = wrap.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    redraw();
  }
  function redraw() {
    const r = wrap.getBoundingClientRect();
    ctx.clearRect(0, 0, r.width, r.height);
    for (const s of strokes) paint(s, r.width, r.height);
  }
  function paint(s, w, h) {
    if (!s.pts.length) return;
    ctx.globalCompositeOperation = s.tool === 'eraser' ? 'destination-out' : 'source-over';
    ctx.strokeStyle = s.color; ctx.fillStyle = s.color;
    ctx.lineWidth = s.size; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (s.pts.length === 1) {
      ctx.beginPath(); ctx.arc(s.pts[0][0] * w, s.pts[0][1] * h, Math.max(0.75, s.size / 2), 0, 7); ctx.fill();
    } else {
      ctx.beginPath(); ctx.moveTo(s.pts[0][0] * w, s.pts[0][1] * h);
      for (let i = 1; i < s.pts.length; i++) ctx.lineTo(s.pts[i][0] * w, s.pts[i][1] * h);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  function npos(e) {
    const r = canvas.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
  }

  canvas.addEventListener('pointerdown', (e) => {
    drawing = true; canvas.setPointerCapture(e.pointerId);
    cur = { tool, color, size: tool === 'eraser' ? size * 4 : size, pts: [npos(e)] };
    strokes.push(cur); redraw();
  });
  canvas.addEventListener('pointermove', (e) => { if (drawing) { cur.pts.push(npos(e)); redraw(); } });
  function endStroke() { if (drawing) { drawing = false; cur = null; persist(); } }
  canvas.addEventListener('pointerup', endStroke);
  canvas.addEventListener('pointercancel', endStroke);

  // ── toolbar ──
  function setActive(sel, btn) {
    pad.querySelectorAll(sel).forEach((x) => x.classList.remove('active'));
    if (btn) btn.classList.add('active');
  }
  pad.querySelector('.scratch-toolbar').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.tool) { tool = b.dataset.tool; setActive('.scratch-tool', b); }
    else if (b.dataset.color) {
      color = b.dataset.color; tool = 'pen';
      setActive('.scratch-swatch', b);
      setActive('.scratch-tool', pad.querySelector('[data-tool="pen"]'));
    } else if (b.dataset.size) { size = +b.dataset.size; setActive('.scratch-size', b); }
    else if (b.id === 'scratch-undo') { strokes.pop(); redraw(); persist(); }
    else if (b.id === 'scratch-clear') { strokes = []; redraw(); persist(); }
  });

  // ── notes ──
  let nt; notes.addEventListener('input', () => { clearTimeout(nt); nt = setTimeout(persist, 400); });

  // ── open / close / resize ──
  const savedW = parseInt(localStorage.getItem(WKEY) || '', 10);
  if (savedW > 160) pad.style.width = savedW + 'px';

  function openPad() { main.classList.add('scratch-open'); $('scratch-toggle').classList.add('active'); requestAnimationFrame(fitCanvas); }
  function closePad() { main.classList.remove('scratch-open'); $('scratch-toggle').classList.remove('active'); }
  $('scratch-toggle').addEventListener('click', () => main.classList.contains('scratch-open') ? closePad() : openPad());

  const divider = $('scratch-divider');
  divider.addEventListener('pointerdown', (e) => {
    e.preventDefault(); divider.classList.add('dragging');
    const row = $('editor-row');
    const move = (ev) => {
      const r = row.getBoundingClientRect();
      const w = Math.max(200, Math.min(r.width - 200, r.right - ev.clientX));
      pad.style.width = w + 'px';
      fitCanvas();
    };
    const up = () => {
      divider.classList.remove('dragging');
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      try { localStorage.setItem(WKEY, String(parseInt(pad.style.width, 10) || 380)); } catch (e) {}
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
  });

  window.addEventListener('resize', () => { if (main.classList.contains('scratch-open')) fitCanvas(); });

  // fresh slate on a new problem; restore when returning to one
  window.addEventListener('oc:problemchange', (e) => {
    persist();
    loadProblem(e && e.detail != null ? e.detail : curNum());
  });

  loadProblem(activeNum);
})();
