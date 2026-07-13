// SPDX-License-Identifier: AGPL-3.0-or-later
// FreetCode — Copyright (C) 2026 Galliard7. See LICENSE.

/* ══════════════════════════════════════════════════════════════════
   FreetCode — AI Tutor (client-side, WebLLM + WebGPU).

   Opt-in by design: nothing downloads until the user clicks Enable.
   Inference runs on the user's GPU; nothing is sent to any server.
   Reads live app state via window.__oc (defined at the end of the main
   script in index.html). Per-problem chat is persisted in localStorage.
   See docs/adr/0003-client-side-tutor.md.

   Revert the whole feature by deleting tutor.js + tutor.css and the
   #tutor-* markup + window.__oc bridge in index.html.
   ══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  // A/B is a one-line change. WebLLM pinned to 0.2.84 (verified to include all
  // MODEL_ID candidates) so an upstream release can't break the live tutor;
  // bump deliberately to take updates.
  const MODEL_ID = 'Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC';
  const WEBLLM_URL = 'https://esm.run/@mlc-ai/web-llm@0.2.84';
  const ENABLED_KEY = 'freetcode_tutor_enabled';
  const CHATS_KEY = 'freetcode_tutor_chats';
  const SHARE_KEY = 'freetcode_tutor_share';   // opt-in chat sharing (ADR 0004) — absent/off by default
  const GREETING = "Hi! Ask me about the current problem, or any Python question — hints, explanations, complexity, or a quick syntax check.";

  const $ = (id) => document.getElementById(id);
  const panel = $('tutor-panel');
  if (!panel) return; // markup absent — feature not wired

  let webllm = null, engine = null;
  let loading = false, ready = false, streaming = false, cacheChecked = false;

  // per-problem chat history: { [problemNum]: [{role:'user'|'ai', text}] }
  let chatStore = {};
  try { chatStore = JSON.parse(localStorage.getItem(CHATS_KEY) || '{}'); } catch (e) { chatStore = {}; }
  let activeNum = null;
  const saveChats = () => { try { localStorage.setItem(CHATS_KEY, JSON.stringify(chatStore)); } catch (e) {} };
  const curNum = () => { const p = (window.__oc || {}).problem; return p ? p.num : null; };
  const shareOn = () => localStorage.getItem(SHARE_KEY) === '1';
  const lastShared = {};   // problemNum -> snapshot last sent (session-scoped dedup)

  const SYSTEM = `You are a concise coding tutor inside FreetCode, a Python practice platform. Your job is to help the student figure it out THEMSELVES, not to solve it for them.

BREVITY (most important):
- Default to 1–3 short sentences. No preamble, no recap of the problem, no summary.
- Answer only what was asked. Don't volunteer extra tips, alternative approaches, or next steps unless asked.

NEVER WRITE THE SOLUTION:
- Do NOT output full or near-full code solutions. There is a "Show solution" button for that — if the student wants the whole thing, tell them to use it.
- Even when explicitly asked to "just write it," decline the full solution; instead point them to the Show solution button and give one targeted hint.
- You may show at most a tiny fragment (a single line or expression) ONLY to illustrate a specific syntax point the student asked about — never a working chunk of their answer.
- You are shown the reference solution for grounding ONLY. Never paste it, quote it, or reconstruct it. Use it silently to aim your hints.

WHAT TO DO INSTEAD:
- Point at the specific spot in THEIR code that's relevant — quote a short fragment of it and ask a question or name the issue.
- If they ask about a specific part ("what does this line do", "why is this wrong"), explain just that part.
- Use the judge's verdict when provided; never invent numbers. For complexity, state it relative to optimal in one line.
- For general Python/syntax questions, answer directly and briefly.

If unsure, say so rather than guessing. Never fabricate code or output.`;

  const QUICK = {
    hint: "I'm stuck — give me ONE small hint without revealing the solution or writing code.",
    explain: "In 2–3 sentences, what's the high-level idea for this problem? No code, no step-by-step walkthrough.",
    review: "Look at my current code and point out the single most important issue, in one or two sentences. Don't rewrite it for me.",
    pattern: "What algorithmic pattern does this problem use, and how do I recognize it? Keep it brief.",
    complexity: "What's the time and space complexity of my current code, relative to optimal? One line.",
  };

  // ── grounding pulled live from the running app ──
  function buildGrounding() {
    const oc = window.__oc || {};
    const prob = oc.problem, code = oc.code || '', v = oc.verdict;
    let ctx = '';
    if (prob) {
      ctx += `Current problem: #${prob.num} "${prob.title}" (${prob.difficulty || ''})\n`;
      if (prob.category) ctx += `Category: ${prob.category}\n`;
      if (prob.tags && prob.tags.length) ctx += `Tags: ${prob.tags.join(', ')}\n`;
      if (prob.description) ctx += `\nProblem:\n${prob.description}\n`;
      if (prob.hints) ctx += `\nAuthored hints: ${[].concat(prob.hints).join(' | ')}\n`;
      if (prob.solution) ctx += `\nReference (optimal) solution — to guide your hints; don't paste wholesale:\n${prob.solution}\n`;
      if (v && v.problem === prob.num) {
        const s = (typeof v.score === 'number') ? ` (composite ${v.score.toFixed(2)}, lower = faster)` : '';
        ctx += `\nLatest judge verdict: ${v.verdict}${s}.\n`;
      }
    }
    ctx += `\nStudent's current code:\n${code || '(empty)'}\n`;
    return ctx;
  }

  // system + grounding, then recent conversation, then the new question
  function buildMessages(userMessage, num) {
    const msgs = [{ role: 'system', content: SYSTEM + '\n\n' + buildGrounding() }];
    const hist = (num != null && chatStore[num]) ? chatStore[num].slice(-8) : [];
    for (const m of hist) msgs.push({ role: m.role === 'ai' ? 'assistant' : 'user', content: m.text });
    msgs.push({ role: 'user', content: userMessage });
    return msgs;
  }

  // ── chat UI + persistence ──
  function addMsg(text, role, persist) {
    const div = document.createElement('div');
    div.className = `tutor-msg ${role}`;
    div.textContent = text; // textContent, not innerHTML → safe to render model output
    const box = $('tutor-messages');
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
    if (persist && activeNum != null) {
      (chatStore[activeNum] = chatStore[activeNum] || []).push({ role, text });
      saveChats();
    }
    return div;
  }

  function renderChat(num) {
    const box = $('tutor-messages'); if (!box) return;
    box.innerHTML = '';
    const msgs = (num != null && chatStore[num]) ? chatStore[num] : null;
    if (msgs && msgs.length) {
      msgs.forEach((m, i) => {
        const div = addMsg(m.text, m.role, false);
        if (m.role === 'ai') attachRating(div, num, i);
      });
    } else addMsg(GREETING, 'ai', false);
  }

  // ── opt-in chat sharing (ADR 0004) ──
  // Rating buttons appear on tutor replies only while sharing is ON — a rating
  // IS telemetry here (it's what makes a weak model's transcripts usable), so
  // no dead controls when the user hasn't opted in.
  function attachRating(div, num, idx) {
    if (!shareOn() || num == null) return;
    const cur = (chatStore[num] && chatStore[num][idx]) || null;
    if (!cur) return;
    const wrap = document.createElement('div');
    wrap.className = 'tutor-rate';
    for (const r of ['up', 'down']) {
      const b = document.createElement('button');
      b.textContent = r === 'up' ? '👍' : '👎';
      b.title = 'Rate this reply (shared anonymously)';
      if (cur.rating === r) b.classList.add('sel');
      b.addEventListener('click', () => {
        cur.rating = r; saveChats();
        wrap.querySelectorAll('button').forEach((x) => x.classList.remove('sel'));
        b.classList.add('sel');
        sendShared(num);   // "send on rate"
      });
      wrap.appendChild(b);
    }
    div.appendChild(wrap);
  }

  // Snapshot this problem's exchange → POST /tutor-chat (anonymous, zero
  // identifiers — see stats.js). Deduped per problem per session so
  // close/switch never re-sends an unchanged chat.
  function sendShared(num) {
    if (!shareOn() || num == null || !window.Stats || !Stats.postTutorChat) return;
    const msgs = (chatStore[num] || []).slice(-40);
    if (!msgs.some((m) => m.role === 'ai')) return;   // no tutor reply yet — nothing to share
    const oc = window.__oc || {};
    const v = oc.verdict;
    const payload = {
      problem: num,
      user_code: (oc.problem && oc.problem.num === num) ? String(oc.code || '').slice(0, 16000) : null,
      verdict: (v && v.problem === num) ? v.verdict : null,
      ratio: (v && v.problem === num && typeof v.score === 'number') ? v.score : null,
      turns: msgs.map((m) => {
        const t = { role: m.role === 'ai' ? 'ai' : 'user', text: String(m.text).slice(0, 8000) };
        if (m.rating === 'up' || m.rating === 'down') t.rating = m.rating;
        return t;
      }),
    };
    const snap = JSON.stringify(payload.turns) + '|' + (payload.user_code || '');
    if (lastShared[num] === snap) return;
    lastShared[num] = snap;
    Stats.postTutorChat(payload);   // fire-and-forget
  }
  // "send on chat close": panel close, problem switch, page hide.
  const flushShared = () => { if (ready && activeNum != null) sendShared(activeNum); };

  function clearChat() {
    if (activeNum != null) { delete chatStore[activeNum]; saveChats(); }
    renderChat(activeNum);
  }

  async function send(text) {
    if (!ready || streaming) return;
    if ((window.__oc || {}).busy) {   // resource guard (ADR 0003): judge and tutor never compute at once
      addMsg('⏳ The judge is running — ask again when it finishes.', 'ai', false);
      return;
    }
    text = (text || $('tutor-input').value).trim();
    if (!text) return;
    $('tutor-input').value = '';
    const num = activeNum;
    const payload = buildMessages(text, num);   // build BEFORE adding current msg (no dupe)
    addMsg(text, 'user', true);
    const out = addMsg('…', 'ai', false);
    streaming = true;
    try {
      const stream = await engine.chat.completions.create({
        messages: payload, stream: true, temperature: 0.3, max_tokens: 350,
      });
      let acc = '';
      for await (const chunk of stream) {
        const d = chunk.choices[0]?.delta?.content || '';
        if (d) { acc += d; out.textContent = acc; $('tutor-messages').scrollTop = $('tutor-messages').scrollHeight; }
      }
      out.textContent = acc || '(no response)';
      if (num != null) {
        (chatStore[num] = chatStore[num] || []).push({ role: 'ai', text: out.textContent });
        saveChats();
        attachRating(out, num, chatStore[num].length - 1);
      }
    } catch (e) {
      out.textContent = 'Error: ' + (e.message || e);
    } finally { streaming = false; }
  }

  // ── model lifecycle ──
  function gateErr(m) { $('tutor-gate-err').textContent = m || ''; }
  async function ensureLib() { if (!webllm) webllm = await import(WEBLLM_URL); return webllm; }

  async function enable() {
    if (loading || ready) return;
    if (!navigator.gpu) { gateErr('This browser has no WebGPU — try Chrome, Edge, or Safari 17+.'); return; }
    loading = true; gateErr(''); panel.dataset.state = 'loading';
    try {
      await ensureLib();
      engine = await webllm.CreateMLCEngine(MODEL_ID, {
        initProgressCallback: (r) => {
          $('tutor-load-text').textContent = r.text || 'Loading…';
          $('tutor-bar').style.width = Math.round((r.progress || 0) * 100) + '%';
        },
      });
      // Ask the browser not to evict the ~1 GB between sessions.
      if (navigator.storage && navigator.storage.persist) { try { await navigator.storage.persist(); } catch (e) {} }
      ready = true; loading = false;
      localStorage.setItem(ENABLED_KEY, '1');
      panel.dataset.state = 'ready';
      activeNum = curNum();
      renderChat(activeNum);
      updateSettings();
    } catch (e) {
      loading = false; panel.dataset.state = 'gate';
      gateErr('Load failed: ' + (e.message || e));
    }
  }

  async function refreshCacheNote() {
    if (cacheChecked || ready) return;
    try {
      await ensureLib();
      const cached = await webllm.hasModelInCache(MODEL_ID);
      $('tutor-cache-note').textContent = cached ? 'Already on this device — loads instantly, no download.' : '';
      $('tutor-enable').textContent = cached ? 'Load tutor' : 'Enable & download';
      cacheChecked = true;
    } catch (e) { /* keep defaults */ }
  }

  // ── settings: status + remove ──
  async function modelCached() {
    if (ready) return true;
    try { await ensureLib(); return await webllm.hasModelInCache(MODEL_ID); } catch (e) { return false; }
  }

  async function updateSettings() {
    const el = $('tutor-settings-status'); if (!el) return;
    const cached = await modelCached();
    el.textContent = cached ? 'AI Tutor model: downloaded (~1 GB), cached on this device.'
                            : 'AI Tutor model: not downloaded.';
    const rm = $('tutor-remove'); if (rm) rm.disabled = !cached;
  }

  // Guaranteed removal: official API + a sweep of BOTH WebLLM storage
  // backends (Cache API and IndexedDB), since the cache name/backend can
  // vary by version. Verified by re-checking hasModelInCache afterwards.
  async function removeModel() {
    const rm = $('tutor-remove'); if (rm) { rm.disabled = true; rm.textContent = 'Removing…'; }
    try { if (engine && engine.unload) await engine.unload(); } catch (e) {}
    try { await ensureLib(); if (webllm.deleteModelAllInfoInCache) await webllm.deleteModelAllInfoInCache(MODEL_ID); } catch (e) {}
    // App uses no other Cache Storage (no service worker), so clearing all is safe & definitive.
    try { for (const k of await caches.keys()) await caches.delete(k); } catch (e) {}
    try {
      if (indexedDB.databases) {
        const dbs = await indexedDB.databases();
        for (const d of dbs) if (d.name && /webllm|mlc|tvmjs/i.test(d.name)) indexedDB.deleteDatabase(d.name);
      }
    } catch (e) {}
    engine = null; ready = false; cacheChecked = false;
    localStorage.removeItem(ENABLED_KEY);
    panel.dataset.state = 'gate';
    $('tutor-enable').textContent = 'Enable & download';
    $('tutor-cache-note').textContent = '';
    if (rm) rm.textContent = 'Remove tutor model (~1 GB)';
    let still = true;
    try { still = await webllm.hasModelInCache(MODEL_ID); } catch (e) { still = false; }
    if (still) console.warn('[tutor] model still reported in cache after removal');
    await updateSettings();
  }

  // ── wiring ──
  function openPanel() {
    panel.classList.add('open');
    $('tutor-toggle').classList.add('active');
    if (activeNum == null) activeNum = curNum();
    if (ready) renderChat(activeNum);
    refreshCacheNote();
  }
  function closePanel() {
    flushShared();   // "send on chat close"
    panel.classList.remove('open'); $('tutor-toggle').classList.remove('active');
  }

  // fresh slate on a new problem; restore the chat when returning to one
  window.addEventListener('oc:problemchange', (e) => {
    flushShared();   // capture the outgoing problem's exchange before switching
    activeNum = (e && e.detail != null) ? e.detail : curNum();
    if (ready) renderChat(activeNum);
  });
  window.addEventListener('pagehide', flushShared);   // best-effort on tab close

  $('tutor-toggle').addEventListener('click', () => panel.classList.contains('open') ? closePanel() : openPanel());
  $('tutor-close').addEventListener('click', closePanel);
  $('tutor-clear').addEventListener('click', clearChat);
  $('tutor-enable').addEventListener('click', enable);
  $('tutor-send').addEventListener('click', () => send());
  $('tutor-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  });
  $('tutor-quick').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-action]'); if (b) send(QUICK[b.dataset.action]);
  });
  const rm = $('tutor-remove'); if (rm) rm.addEventListener('click', removeModel);
  const sb = $('settings-btn'); if (sb) sb.addEventListener('click', updateSettings);
  const shareBox = $('tutor-share');
  if (shareBox) {
    shareBox.checked = shareOn();
    shareBox.addEventListener('change', () => {
      if (shareBox.checked) localStorage.setItem(SHARE_KEY, '1');
      else localStorage.removeItem(SHARE_KEY);
      if (ready) renderChat(activeNum);   // show/hide rating controls immediately
    });
  }

  activeNum = curNum(); // best-effort initial (event will correct it)
})();
