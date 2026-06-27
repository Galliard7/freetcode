// SPDX-License-Identifier: AGPL-3.0-or-later
// FreetCode — Copyright (C) 2026 Galliard7. See LICENSE.

/* ══════════════════════════════════════════════════════════════════
   FreetCode — Pyodide Host Worker
   Runs all Python off the main thread so a runaway loop can't freeze
   the tab: the main thread kills (terminate) + respawns this worker on
   timeout. Handles two jobs:
     • run    — unjudged execution, streams stdout/stderr back
     • judge  — graded execution (smart-compare correctness, scaled timing)
   ══════════════════════════════════════════════════════════════════ */

importScripts('https://cdn.jsdelivr.net/pyodide/v0.27.4/full/pyodide.js');

let pyodide = null;

// ─── Python judging harness (loaded once at init) ───
const JUDGE_PY = String.raw`
import json, io, contextlib, time, itertools, random

def _short(x, limit=160):
    try:
        s = repr(x)
    except Exception:
        s = str(x)
    return s if len(s) <= limit else s[:limit] + '…'

def _exec_capture(src):
    g = {'__name__': '__judge__'}
    buf = io.StringIO()
    t0 = time.perf_counter()
    try:
        with contextlib.redirect_stdout(buf), contextlib.redirect_stderr(buf):
            exec(src, g)
    except Exception as e:
        return g, buf.getvalue(), '{}: {}'.format(type(e).__name__, e), (time.perf_counter()-t0)*1000
    return g, buf.getvalue(), None, (time.perf_counter()-t0)*1000

def _spec_fns(spec, g):
    fns = {}
    for key in ('build', 'extract', 'check', 'gen'):
        src = spec.get(key)
        if src:
            exec(src, g)
            fns[key] = g.get(key)
    return fns

def _equal(a, b, mode):
    if mode == 'sorted':
        return sorted(a) == sorted(b)
    if mode == 'set':
        return set(a) == set(b)
    if mode == 'multiset':
        return sorted(sorted(x) for x in a) == sorted(sorted(x) for x in b)
    if mode == 'float':
        return abs(a - b) < 1e-6
    if mode == 'bool':
        return bool(a) == bool(b)
    return a == b

def _call(g, fns, spec, raw):
    args = list(fns['build'](*raw)) if fns.get('build') else list(raw)
    res = getattr(g['Solution'](), spec['entry'])(*args)
    if fns.get('extract'):
        res = fns['extract'](res)
    return res

# ── Spec-driven sample judging (return-value smart compare) ──
def judge_samples(user_src, sol_src, spec_json):
    spec = json.loads(spec_json)
    mode = spec.get('compare', 'exact')
    entry = spec['entry']
    ug, _o, uerr, _t = _exec_capture(user_src)
    if uerr:
        return json.dumps({'correct': False, 'error': 'Your code errored: ' + uerr, 'cases': [], 'mode': 'spec'})
    rg, _o, rerr, _t = _exec_capture(sol_src)
    if rerr:
        return json.dumps({'correct': False, 'error': 'Reference errored: ' + rerr, 'cases': [], 'mode': 'spec'})
    if 'Solution' not in ug:
        return json.dumps({'correct': False, 'error': 'No Solution class found in your code.', 'cases': [], 'mode': 'spec'})
    ufns = _spec_fns(spec, ug)
    rfns = _spec_fns(spec, rg)
    chk = ufns.get('check') or rfns.get('check')
    cases = []
    all_ok = True
    for raw in spec.get('samples', []):
        try:
            ures = _call(ug, ufns, spec, raw)
        except Exception as e:
            cases.append({'input': _short(raw), 'expected': '', 'got': '{}: {}'.format(type(e).__name__, e), 'ok': False})
            all_ok = False
            continue
        if chk:
            ok = bool(chk(list(raw), ures))
            exp = '(any valid)'
        else:
            rres = _call(rg, rfns, spec, raw)
            exp = rres
            try:
                ok = _equal(ures, rres, mode)
            except Exception:
                ok = (ures == rres)
        cases.append({'input': _short(raw), 'expected': _short(exp), 'got': _short(ures), 'ok': ok})
        if not ok:
            all_ok = False
    return json.dumps({'correct': all_ok, 'error': None, 'cases': cases, 'mode': 'spec'})

# ── Fresh args per rep (copy top-level lists so mutating solutions are fair) ──
def _prep(raw, fns):
    if fns.get('build'):
        return list(fns['build'](*raw))
    return [list(a) if isinstance(a, list) else a for a in raw]

# ── Best-of-reps timing (min); one untimed warm-up first to stabilize caches ──
def _time_best(g, fns, spec, raw, reps):
    entry = spec['entry']
    Sol = g['Solution']
    getattr(Sol(), entry)(*_prep(raw, fns))   # warm-up, untimed
    best = None
    for _ in range(reps):
        args = _prep(raw, fns)                 # rebuild outside the timed region
        t0 = time.perf_counter()
        getattr(Sol(), entry)(*args)
        dt = time.perf_counter() - t0
        if best is None or dt < best:
            best = dt
    return best * 1000

def _result(g, fns, spec, raw):
    res = getattr(g['Solution'](), spec['entry'])(*_prep(raw, fns))
    if fns.get('extract'):
        res = fns['extract'](res)
    return res

# ── Spec-driven benchmark at one size: warm-up + best-of-reps for both sides ──
def judge_bench(user_src, sol_src, spec_json, n, reps):
    spec = json.loads(spec_json)
    mode = spec.get('compare', 'exact')
    ug, _o, uerr, _t = _exec_capture(user_src)
    if uerr:
        return json.dumps({'ok': False, 'error': 'Your code errored: ' + uerr})
    rg, _o, rerr, _t = _exec_capture(sol_src)
    if rerr:
        return json.dumps({'ok': False, 'error': 'Reference errored: ' + rerr})
    ufns = _spec_fns(spec, ug)
    rfns = _spec_fns(spec, rg)
    gen = ufns.get('gen') or rfns.get('gen')
    if not gen:
        return json.dumps({'ok': False, 'unavailable': True})
    random.seed(987654321 + n)
    raw = gen(n)
    # Correctness at this size
    try:
        ures = _result(ug, ufns, spec, raw)
    except Exception as e:
        return json.dumps({'ok': False, 'error': '{}: {}'.format(type(e).__name__, e)})
    rres = _result(rg, rfns, spec, raw)
    chk = ufns.get('check') or rfns.get('check')
    if chk:
        correct = bool(chk(list(raw), ures))
    else:
        try:
            correct = _equal(ures, rres, mode)
        except Exception:
            correct = (ures == rres)
    # Timing (warm-up + best-of-reps min, fair both sides)
    user_ms = _time_best(ug, ufns, spec, raw, reps)
    ref_ms = _time_best(rg, rfns, spec, raw, reps)
    return json.dumps({'ok': True, 'n': n, 'correct': correct, 'user_ms': user_ms,
                       'ref_ms': ref_ms, 'ratio': user_ms / max(ref_ms, 0.02)})

# ── Peak-memory (auxiliary space) via tracemalloc; args built BEFORE measuring ──
def judge_space(user_src, sol_src, spec_json, n):
    import tracemalloc
    spec = json.loads(spec_json)
    ug, _o, uerr, _t = _exec_capture(user_src)
    if uerr:
        return json.dumps({'ok': False, 'error': uerr})
    rg, _o, rerr, _t = _exec_capture(sol_src)
    if rerr:
        return json.dumps({'ok': False, 'error': rerr})
    ufns = _spec_fns(spec, ug)
    rfns = _spec_fns(spec, rg)
    gen = ufns.get('gen') or rfns.get('gen')
    if not gen:
        return json.dumps({'ok': False, 'unavailable': True})
    random.seed(987654321 + n)
    raw = gen(n)

    def peak(g, fns):
        args = _prep(raw, fns)            # build input first — excluded from the measurement
        tracemalloc.start()
        getattr(g['Solution'](), spec['entry'])(*args)
        _cur, pk = tracemalloc.get_traced_memory()
        tracemalloc.stop()
        return pk

    try:
        upk = peak(ug, ufns)
    except Exception as e:
        return json.dumps({'ok': False, 'error': '{}: {}'.format(type(e).__name__, e)})
    rpk = peak(rg, rfns)
    return json.dumps({'ok': True, 'n': n, 'user_peak': upk, 'ref_peak': rpk,
                       'ratio': upk / max(rpk, 1)})

# ── Fallback for problems without a judge spec: compare printed output ──
def judge_stdout(user_src, sol_src):
    ug, uout, uerr, ums = _exec_capture(user_src)
    if uerr:
        return json.dumps({'correct': False, 'error': 'Your code errored: ' + uerr, 'cases': [], 'mode': 'stdout'})
    rg, rout, rerr, rms = _exec_capture(sol_src)
    if rerr:
        return json.dumps({'correct': None, 'error': None, 'cases': [], 'mode': 'stdout',
                           'note': 'reference unavailable', 'user_ms': ums})
    ul = [l.rstrip() for l in uout.strip().splitlines()]
    rl = [l.rstrip() for l in rout.strip().splitlines()]
    cases = []
    for i, (a, b) in enumerate(itertools.zip_longest(ul, rl, fillvalue='')):
        cases.append({'input': 'case ' + str(i + 1), 'expected': b, 'got': a, 'ok': a == b})
    return json.dumps({'correct': ul == rl, 'error': None, 'cases': cases, 'mode': 'stdout',
                       'user_ms': ums, 'ref_ms': rms, 'ratio': ums / max(rms, 0.05)})
`;

async function init() {
  try {
    pyodide = await loadPyodide();
    pyodide.setStdout({ batched: (s) => postMessage({ type: 'stdout', text: s + '\n' }) });
    pyodide.setStderr({ batched: (s) => postMessage({ type: 'stderr', text: s + '\n' }) });
    pyodide.runPython(JUDGE_PY);
    postMessage({ type: 'ready' });
  } catch (e) {
    postMessage({ type: 'init-error', text: e.message || String(e) });
  }
}

async function runCode(id, code) {
  try {
    await pyodide.runPythonAsync(code);
    postMessage({ type: 'done', id });
  } catch (e) {
    postMessage({ type: 'stderr', text: e.message || String(e) });
    postMessage({ type: 'done', id, error: true });
  }
}

// Call a Python judging fn with string/number args; return parsed JSON.
function pyJudge(fn, args) {
  const g = pyodide.globals;
  const res = g.get(fn)(...args);
  const out = typeof res === 'string' ? res : res.toString();
  if (res && res.destroy) res.destroy();
  return JSON.parse(out);
}

async function judge(id, payload) {
  try {
    let result;
    if (payload.kind === 'samples') {
      result = pyJudge('judge_samples', [payload.userCode, payload.solution, payload.spec]);
    } else if (payload.kind === 'bench') {
      result = pyJudge('judge_bench', [payload.userCode, payload.solution, payload.spec, payload.n, payload.reps]);
    } else if (payload.kind === 'space') {
      result = pyJudge('judge_space', [payload.userCode, payload.solution, payload.spec, payload.n]);
    } else {
      result = pyJudge('judge_stdout', [payload.userCode, payload.solution]);
    }
    postMessage({ type: 'verdict', id, result });
  } catch (e) {
    postMessage({ type: 'verdict', id, result: { error: e.message || String(e), correct: false } });
  }
}

self.onmessage = async (e) => {
  const m = e.data;
  if (m.type === 'run') await runCode(m.id, m.code);
  else if (m.type === 'judge') await judge(m.id, m);
};

init();
