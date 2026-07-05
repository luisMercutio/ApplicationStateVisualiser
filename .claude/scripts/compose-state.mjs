#!/usr/bin/env node
/**
 * compose-state.mjs — fold Business Rule deltas up to a cut point.
 *
 * This is the Phase-2 proof that the application state (entities, endpoints,
 * store slices, components, selectors) can be *composed* from BR data rather
 * than read from a per-UC snapshot file — the thing the app's future
 * "Active Feature" selector will do.
 *
 * "up to X" = every rule with `seq ≤ cut` (Dewey-compared), where the cut is a
 * feature (its highest-seq rule) or an explicit seq.
 *
 * Usage:
 *   node compose-state.mjs --root "C:/path/to/projectB" --at manage-bookings
 *   node compose-state.mjs --root "C:/path/to/projectB" --at 63
 */

import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const argVal = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };
const root = argVal('--root');
const at = argVal('--at');
if (!root) { console.error('Usage: node compose-state.mjs --root <projectRoot> --at <feature|seq>'); process.exit(1); }

const indexPath = path.resolve(root, '.claude', 'rules', '_index.json');
if (!fs.existsSync(indexPath)) { console.error(`Not found: ${indexPath} — run extract-brs.mjs first.`); process.exit(1); }
const rules = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));

// Dewey comparison: segment-wise numeric; shorter prefix sorts first.
function dewey(a, b) {
  const A = String(a).split('.').map(Number), B = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(A.length, B.length); i++) {
    const x = A[i] ?? -1, y = B[i] ?? -1;
    if (x !== y) return x - y;
  }
  return 0;
}

// resolve the cut
let cutSeq;
if (at && /^[\d.]+$/.test(at)) {
  cutSeq = at;
} else if (at) {
  const inFeature = rules.filter((r) => (r.features ?? []).includes(at));
  if (!inFeature.length) { console.error(`No feature '${at}'. Features: ${[...new Set(rules.flatMap((r) => r.features))].join(', ')}`); process.exit(1); }
  cutSeq = inFeature.reduce((m, r) => (dewey(r.seq, m) > 0 ? r.seq : m), inFeature[0].seq);
} else {
  cutSeq = rules.reduce((m, r) => (dewey(r.seq, m) > 0 ? r.seq : m), '0'); // whole app
}

const included = rules.filter((r) => dewey(r.seq, cutSeq) <= 0).sort((a, b) => dewey(a.seq, b.seq));

// fold
const KINDS = ['entities', 'endpoints', 'slices', 'components', 'selectors'];
const state = {};            // kind -> Map(target -> { owner, modifiedBy:Set })
for (const k of KINDS) state[k] = new Map();
const crossFeature = [];     // { from, to, kind, target }
for (const r of included) {
  const feat = (r.features ?? [])[0];
  for (const kind of KINDS) {
    const d = r.delta?.[kind]; if (!d) continue;
    for (const t of d.add ?? []) if (!state[kind].has(t)) state[kind].set(t, { owner: feat, modifiedBy: new Set() });
    for (const t of d.modify ?? []) {
      const cur = state[kind].get(t);
      if (cur) { cur.modifiedBy.add(feat); if (cur.owner !== feat) crossFeature.push({ from: feat, to: cur.owner, kind, target: t }); }
    }
  }
}

// report
console.log(`\nComposed application state as of ${/^[\d.]+$/.test(at ?? '') ? `seq ${cutSeq}` : `feature "${at ?? 'ALL'}" (seq ≤ ${cutSeq})`}`);
console.log(`Folded ${included.length}/${rules.length} rules.\n`);
for (const kind of KINDS) {
  const entries = [...state[kind].entries()];
  if (!entries.length) continue;
  console.log(`${kind} (${entries.length}):`);
  for (const [t, meta] of entries) {
    const mods = meta.modifiedBy.size ? `  (modified by: ${[...meta.modifiedBy].join(', ')})` : '';
    console.log(`  • ${t}  [${meta.owner}]${mods}`);
  }
  console.log('');
}
if (crossFeature.length) {
  console.log('Cross-feature changes (a rule modifying another feature\'s domain — the "btw" relationship):');
  const seen = new Set();
  for (const c of crossFeature) {
    const key = `${c.from}->${c.to}:${c.target}`;
    if (seen.has(key)) continue; seen.add(key);
    console.log(`  ${c.from}  →  ${c.to}   (${c.kind}: ${c.target})`);
  }
} else {
  console.log('No cross-feature changes in this cut.');
}
