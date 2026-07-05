// FreetCode free-tier quota watchdog.
// Runs on a daily cron. Queries the Cloudflare GraphQL Analytics API for the
// account's usage so far *today* (UTC), compares each metric to its free-plan
// daily cap, and POSTs a message to ALERT_WEBHOOK when anything crosses WARN_PCT.
// Stays silent on a healthy day (no noise). Any GraphQL error is itself sent to
// the webhook so a wrong field name / token scope surfaces on the first run.

const GQL = 'https://api.cloudflare.com/client/v4/graphql';

async function graphql(token, query, variables) {
  const r = await fetch(GQL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || (j.errors && j.errors.length)) {
    throw new Error(`GraphQL ${r.status}: ${JSON.stringify(j.errors || j).slice(0, 300)}`);
  }
  return j.data;
}

// UTC day bounds for "today so far".
function todayBounds() {
  const now = new Date();
  const day = now.toISOString().slice(0, 10);            // YYYY-MM-DD
  return { day, sinceISO: `${day}T00:00:00Z`, untilISO: now.toISOString() };
}

async function collect(env) {
  const acct = env.ACCOUNT_ID;
  const { day, sinceISO, untilISO } = todayBounds();
  const out = {};

  // 1) Workers requests (datetime-filtered adaptive dataset).
  try {
    const d = await graphql(env.CF_API_TOKEN, `
      query($a:String!,$s:Time!,$u:Time!){viewer{accounts(filter:{accountTag:$a}){
        workersInvocationsAdaptive(limit:10000, filter:{datetime_geq:$s, datetime_leq:$u}){
          sum{requests}}}}}`,
      { a: acct, s: sinceISO, u: untilISO });
    out.workers_requests = (d.viewer.accounts[0]?.workersInvocationsAdaptive || [])
      .reduce((n, r) => n + (r.sum?.requests || 0), 0);
  } catch (e) { out._errors = (out._errors || []).concat(`workers: ${e.message}`); }

  // 2) D1 rows read/written (date-filtered groups dataset).
  try {
    const d = await graphql(env.CF_API_TOKEN, `
      query($a:String!,$d:Date!){viewer{accounts(filter:{accountTag:$a}){
        d1AnalyticsAdaptiveGroups(limit:10000, filter:{date_geq:$d, date_leq:$d}){
          sum{rowsRead rowsWritten}}}}}`,
      { a: acct, d: day });
    const rows = d.viewer.accounts[0]?.d1AnalyticsAdaptiveGroups || [];
    out.d1_rows_read = rows.reduce((n, r) => n + (r.sum?.rowsRead || 0), 0);
    out.d1_rows_written = rows.reduce((n, r) => n + (r.sum?.rowsWritten || 0), 0);
  } catch (e) { out._errors = (out._errors || []).concat(`d1: ${e.message}`); }

  // 3) KV read operations (grouped by actionType).
  try {
    const d = await graphql(env.CF_API_TOKEN, `
      query($a:String!,$s:Time!,$u:Time!){viewer{accounts(filter:{accountTag:$a}){
        kvOperationsAdaptiveGroups(limit:10000, filter:{datetime_geq:$s, datetime_leq:$u, actionType:"read"}){
          sum{requests}}}}}`,
      { a: acct, s: sinceISO, u: untilISO });
    out.kv_reads = (d.viewer.accounts[0]?.kvOperationsAdaptiveGroups || [])
      .reduce((n, r) => n + (r.sum?.requests || 0), 0);
  } catch (e) { out._errors = (out._errors || []).concat(`kv: ${e.message}`); }

  return { day, ...out };
}

function evaluate(env, u) {
  const num = (k) => Number(env[k]);
  const warn = num('WARN_PCT'), crit = num('CRIT_PCT');
  const metrics = [
    ['Worker requests', u.workers_requests, num('CAP_WORKERS_REQUESTS')],
    ['D1 rows read',    u.d1_rows_read,     num('CAP_D1_ROWS_READ')],
    ['D1 rows written', u.d1_rows_written,  num('CAP_D1_ROWS_WRITTEN')],
    ['KV reads',        u.kv_reads,         num('CAP_KV_READS')],
  ];
  const lines = [], breaches = [];
  let worst = 0;
  for (const [label, val, cap] of metrics) {
    if (val == null || !cap) { lines.push(`• ${label}: n/a`); continue; }
    const pct = Math.round((val / cap) * 100);
    worst = Math.max(worst, pct);
    const flag = pct >= crit ? ' 🔴' : pct >= warn ? ' 🟠' : '';
    lines.push(`• ${label}: ${val.toLocaleString()} / ${cap.toLocaleString()} (${pct}%)${flag}`);
    if (pct >= warn) breaches.push(`${label} at ${pct}%`);
  }
  return { worst, breaches, lines, errors: u._errors || [] };
}

async function notify(env, text) {
  if (!env.ALERT_WEBHOOK) return;
  // Generic JSON payload; adjust the shape to your channel if needed.
  await fetch(env.ALERT_WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  }).catch(() => {});
}

export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil((async () => {
      const usage = await collect(env);
      const { worst, breaches, lines, errors } = evaluate(env, usage);
      if (errors.length) {
        await notify(env, `⚠️ FreetCode alerter couldn't read some usage (${usage.day} UTC):\n${errors.join('\n')}\n\nPartial:\n${lines.join('\n')}`);
        return;
      }
      // Silent on a healthy day; ping only on a breach.
      if (breaches.length) {
        const tag = worst >= Number(env.CRIT_PCT) ? '🔴 URGENT' : '🟠 WARNING';
        await notify(env, `${tag} — FreetCode free-tier usage (${usage.day} UTC so far):\n${lines.join('\n')}\n\nBreached: ${breaches.join(', ')}`);
      }
    })());
  },

  // Manual health check: GET / returns the current usage snapshot (no secrets leaked).
  async fetch(_req, env) {
    const usage = await collect(env);
    const { lines, errors } = evaluate(env, usage);
    return new Response(`FreetCode usage ${usage.day} UTC:\n${lines.join('\n')}${errors.length ? '\n\nerrors:\n' + errors.join('\n') : ''}\n`,
      { headers: { 'Content-Type': 'text/plain' } });
  },
};
