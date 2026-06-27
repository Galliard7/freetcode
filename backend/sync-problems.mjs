// SPDX-License-Identifier: AGPL-3.0-or-later
// FreetCode — Copyright (C) 2026 Galliard7. See LICENSE.
//
// Sync the problem curriculum into Cloudflare KV.
// Reads ../problems.json and emits a wrangler "bulk put" file with:
//   - key `index`        -> lightweight list metadata (NO bodies) for the sidebar
//   - key `problem:<num>`-> the full problem object (template, solution, hints, ...)
// This keeps the full set off the static repo: the index leaks titles only;
// the valuable bodies require one fetch per problem.
//
// Usage:
//   node sync-problems.mjs                      # writes /tmp/kv-problems-bulk.json
//   npx wrangler kv bulk put /tmp/kv-problems-bulk.json --binding PROBLEMS --remote
// (re-run after editing problems.json to push updates)

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, '..', 'problems.json');
const OUT = '/tmp/kv-problems-bulk.json';

// Fields exposed in the list index. Deliberately excludes the heavy/valuable
// bodies: template, solution, hints, description, judge, alt_solutions, etc.
const INDEX_FIELDS = ['num', 'title', 'difficulty', 'category', 'tags', 'lists', 'visualizer'];

const problems = JSON.parse(readFileSync(SRC, 'utf8'));
if (!Array.isArray(problems)) throw new Error('problems.json is not an array');

const seen = new Set();
const index = [];
const bulk = [];

for (const p of problems) {
  if (p.num === undefined || p.num === null) throw new Error('problem missing num: ' + JSON.stringify(p).slice(0, 80));
  const key = String(p.num);
  if (seen.has(key)) throw new Error('duplicate num: ' + key);
  seen.add(key);

  const light = {};
  for (const f of INDEX_FIELDS) if (p[f] !== undefined) light[f] = p[f];
  index.push(light);

  bulk.push({ key: `problem:${p.num}`, value: JSON.stringify(p) });
}

bulk.push({ key: 'index', value: JSON.stringify(index) });

writeFileSync(OUT, JSON.stringify(bulk));

const indexBytes = Buffer.byteLength(JSON.stringify(index));
const fullBytes = Buffer.byteLength(readFileSync(SRC, 'utf8'));
console.log(`problems:      ${problems.length}`);
console.log(`KV entries:    ${bulk.length} (${problems.length} bodies + 1 index)`);
console.log(`index size:    ${(indexBytes / 1024).toFixed(1)} KB (list metadata only)`);
console.log(`full size:     ${(fullBytes / 1024).toFixed(1)} KB (stays out of the repo)`);
console.log(`bulk file:     ${OUT}`);
console.log(`\nNext: npx wrangler kv bulk put ${OUT} --binding PROBLEMS --remote`);
