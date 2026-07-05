#!/usr/bin/env node
/**
 * extract-brs.mjs — Phase 1 of the BR-first evolution.
 *
 * Converts a project's per-UC `business-rules.json` files into **standalone**
 * Business Rule files at `<root>/.claude/rules/<slug>.md`, in the agreed shape:
 *
 *   - filename = a stable slug, NO number in it (identity lives in the name)
 *   - `seq`    = a Dewey-decimal ordinal string, the sole source of build order
 *   - `features` = feature name(s) the rule serves (derived from its UC folder)
 *   - `dependsOn` = other rules by slug — context only (draws graph edges,
 *                   feeds the developer agent), NOT an ordering constraint
 *
 * Non-destructive to the existing architecture artifacts. It (re)creates only
 * the `.claude/rules/` folder. The old `business-rules.json` files stay in place
 * so the current app keeps working until we flip it (Phase 3).
 *
 * Usage:
 *   node extract-brs.mjs --root "C:/path/to/projectB" [--dry]
 */

import fs from 'node:fs';
import path from 'node:path';

// ── args ────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const argVal = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };
const root = argVal('--root');
const dry = args.includes('--dry');
if (!root) { console.error('Usage: node extract-brs.mjs --root <projectRoot> [--dry]'); process.exit(1); }
const archBase = path.resolve(root, '.claude', 'architecture');
const rulesDir = path.resolve(root, '.claude', 'rules');
if (!fs.existsSync(archBase)) { console.error(`Not found: ${archBase}`); process.exit(1); }

const read = (p) => { try { return fs.readFileSync(p, 'utf-8'); } catch { return null; } };

// ── slug helpers ─────────────────────────────────────────────────────────────
const STOP = new Set(['a','an','the','is','are','be','of','to','in','on','for','and','or','with',
  'that','this','if','no','not','must','all','any','its','it','as','at','by','from','via','per',
  'when','which','has','have','shall','should','only','both','each','a','using']);

/** A short, meaningful slug for a rule sentence — the file's identity. */
function ruleSlug(text) {
  const words = text
    .replace(/`([^`]*)`/g, ' $1 ')          // keep code tokens, drop backticks
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((w) => w && !STOP.has(w));
  let slug = words.slice(0, 7).join('-').slice(0, 52).replace(/-+$/g, '');
  return slug || 'rule';
}

/** Feature name = the UC folder slug, minus its numeric prefix. */
function featureOfFolder(folder) {
  return folder.replace(/^\d{3}[a-z]?-/, '');
}

// ── collect all rules ────────────────────────────────────────────────────────
// Chain order = folder numeric prefix (post-shift positions), then rule order
// within each file. Legacy BR ids are NOT globally unique (some UCs restart at
// BR-001), so we never sort by them.
const ucFolders = fs.readdirSync(archBase, { withFileTypes: true })
  .filter((e) => e.isDirectory() && /^\d{3}[a-z]?-/.test(e.name))
  .map((e) => e.name)
  .sort((a, b) => (parseInt(a) - parseInt(b)) || a.localeCompare(b));

const all = []; // { legacyId, legacyUc, seq(number), rule, category, dependsOn[], touches, feature }
for (const folder of ucFolders) {
  const txt = read(path.join(archBase, folder, 'business-rules.json'));
  if (!txt) continue;
  let doc;
  try { doc = JSON.parse(txt); } catch { continue; }
  const feature = featureOfFolder(folder);
  for (const r of doc.rules ?? []) {
    all.push({
      legacyId: r.id, legacyUc: r.uc, seq: r.seq, rule: r.rule,
      category: r.category ?? 'other', dependsOn: r.dependsOn ?? [],
      touches: r.touches ?? {}, feature,
    });
  }
}
// `all` is already in (chain, in-file) order — the true development order.

// ── assign identity (slug) + Dewey seq, then resolve dependsOn ───────────────
const usedSlugs = new Set();
const occ = new Map(); // legacyId -> [{ gi, feature, slug }] in order
all.forEach((r, i) => {
  let base = ruleSlug(r.rule);
  let slug = base, n = 2;
  while (usedSlugs.has(slug)) slug = `${base}-${n++}`;
  usedSlugs.add(slug);
  r.slug = slug;
  r.gi = i;
  r.newSeq = String(i + 1);        // clean contiguous baseline; Dewey sub-segments appear on later inserts
  if (!occ.has(r.legacyId)) occ.set(r.legacyId, []);
  occ.get(r.legacyId).push({ gi: i, feature: r.feature, slug });
});
// dependsOn ids aren't globally unique → pick the nearest EARLIER occurrence,
// preferring the same feature. Provisional (the old edges were themselves
// derived); real edges get authored/re-synthesized in Phase 2.
all.forEach((r) => {
  const deps = [];
  for (const depId of r.dependsOn ?? []) {
    const cands = (occ.get(depId) ?? []).filter((o) => o.gi < r.gi);
    if (!cands.length) continue;
    const sameFeat = cands.filter((o) => o.feature === r.feature);
    const pick = (sameFeat.length ? sameFeat : cands).reduce((a, b) => (b.gi > a.gi ? b : a));
    if (pick.slug !== r.slug && !deps.includes(pick.slug)) deps.push(pick.slug);
  }
  r.deps = deps;
});

// ── Phase 2: per-BR architecture deltas via first-touch classification ────────
// The FIRST rule (lowest seq) to touch an artifact `add`s it and owns it; any
// later rule touching it `modify`s it. When a modify targets an artifact owned
// by a *different* feature, that's a derived cross-feature change (the "handles
// a change for feature 1 and 12" relationship) — never encoded in a name.
const DELTA_KINDS = ['entities', 'endpoints', 'slices', 'components', 'selectors'];
const ownerOf = {}; // `${kind}::${target}` -> { feature, slug }
for (const r of all) { // `all` is in seq order
  const delta = {};
  const modifiesFeatures = new Set();
  for (const kind of DELTA_KINDS) {
    for (const t of r.touches[kind] ?? []) {
      const key = `${kind}::${t}`;
      const op = ownerOf[key] ? 'modify' : 'add';
      if (op === 'add') ownerOf[key] = { feature: r.feature, slug: r.slug };
      else if (ownerOf[key].feature !== r.feature) modifiesFeatures.add(ownerOf[key].feature);
      ((delta[kind] ??= {})[op] ??= []).push(t);
    }
  }
  r.delta = delta;
  r.modifiesFeatures = [...modifiesFeatures];
}

// ── render a rule file ───────────────────────────────────────────────────────
const yamlList = (arr) => `[${arr.join(', ')}]`;

/** Render the delta as indented YAML for frontmatter (only non-empty parts). */
function renderDeltaYaml(delta) {
  const kinds = Object.keys(delta);
  if (!kinds.length) return 'delta: {}';
  const lines = ['delta:'];
  for (const kind of kinds) {
    lines.push(`  ${kind}:`);
    for (const op of ['add', 'modify', 'remove']) {
      const items = delta[kind][op];
      if (items?.length) lines.push(`    ${op}: ${yamlList(items.map((s) => JSON.stringify(s)))}`);
    }
  }
  return lines.join('\n');
}

const TOUCH_ROWS = [
  ['entities', 'entities'], ['endpoints', 'endpoints'], ['slices', 'slices'],
  ['selectors', 'selectors'], ['components', 'components'], ['mockups', 'mockups'],
];

function renderRule(r) {
  const deps = r.deps ?? [];
  const fm = [
    '---',
    `name: ${r.slug}`,
    `seq: "${r.newSeq}"`,
    `features: ${yamlList([r.feature])}`,
    `modifiesFeatures: ${yamlList(r.modifiesFeatures)}`,
    `dependsOn: ${yamlList(deps)}`,
    `category: ${r.category}`,
    renderDeltaYaml(r.delta),
    `legacyId: ${r.legacyId}`,
    `legacyUc: ${r.legacyUc}`,
    '---',
    '',
    '# Rule',
    '',
    r.rule,
    '',
    '## Delta',
    '',
    '<!-- Provisional deltas from first-touch classification of the old `touches`.',
    '     The br-synthesizer agent enriches these with field-level detail. -->',
  ];
  const deltaLines = [];
  for (const [key, label] of TOUCH_ROWS) {
    if (key === 'mockups') continue;
    const d = r.delta[key];
    if (!d) continue;
    if (d.add?.length) deltaLines.push(`- **+ ${label}:** ${d.add.join(', ')}`);
    if (d.modify?.length) deltaLines.push(`- **~ ${label}:** ${d.modify.join(', ')}`);
  }
  if (r.modifiesFeatures.length) {
    deltaLines.push(`- **changes features:** ${r.modifiesFeatures.join(', ')}`);
  }
  fm.push(deltaLines.length ? deltaLines.join('\n') : '_no structural change (behavioural / constraint rule)_');
  fm.push('', '## Acceptance / tests', '');
  const tests = r.touches.tests ?? [];
  fm.push(tests.length ? tests.map((t) => `- ${t}`).join('\n') : '_none captured_');
  fm.push('');
  return fm.join('\n');
}

// ── write ─────────────────────────────────────────────────────────────────────
if (!dry) {
  // reset only the generated rules folder (nothing hand-authored lives here yet)
  fs.rmSync(rulesDir, { recursive: true, force: true });
  fs.mkdirSync(rulesDir, { recursive: true });
}

const features = [...new Set(all.map((r) => r.feature))];
let written = 0;
for (const r of all) {
  const outPath = path.join(rulesDir, `${r.slug}.md`);
  if (dry) continue;
  fs.writeFileSync(outPath, renderRule(r), 'utf-8');
  written++;
}

// machine-readable index (generated cache: the fold input + Phase-3 app cache)
if (!dry) {
  const index = all.map((r) => ({
    name: r.slug, seq: r.newSeq, features: [r.feature],
    modifiesFeatures: r.modifiesFeatures, dependsOn: r.deps, category: r.category,
    delta: r.delta,
  }));
  fs.writeFileSync(path.join(rulesDir, '_index.json'), JSON.stringify(index, null, 2) + '\n', 'utf-8');

  const readme = [
    '# Business Rules', '',
    'Standalone Business Rule files — the atomic unit of the application spec.', '',
    '- **filename** = stable identity (slug), never numbered.',
    '- **`seq`** = Dewey-decimal ordinal string; the sole source of build order.',
    '  Insert between `5` and `6` by writing `5.1`; between `5` and `5.1` by `5.05` — infinitely dense.',
    '- **`dependsOn`** = related rules by slug; context for development + graph edges, NOT ordering.',
    '- **`features`** = the feature(s) a rule introduces into.',
    '- **`delta`** = per-rule `add`/`modify`/`remove` per artifact kind. Composing every',
    '  delta with `seq ≤ cut` yields the app state at that point (see `compose-state.mjs`).',
    '- **`modifiesFeatures`** = features whose artifacts this rule changes (derived from `modify` targets).',
    '- **`_index.json`** = generated cache of all frontmatter for fast folding; regenerate with `extract-brs.mjs`.',
    '',
    `Generated by \`.claude/scripts/extract-brs.mjs\` from \`business-rules.json\`. ${all.length} rules, ${features.length} features.`,
    '',
  ].join('\n');
  fs.writeFileSync(path.join(rulesDir, 'README.md'), readme, 'utf-8');
}

const edges = all.reduce((n, r) => n + (r.deps ?? []).length, 0);
const adds = all.reduce((n, r) => n + DELTA_KINDS.reduce((m, k) => m + (r.delta[k]?.add?.length ?? 0), 0), 0);
const mods = all.reduce((n, r) => n + DELTA_KINDS.reduce((m, k) => m + (r.delta[k]?.modify?.length ?? 0), 0), 0);
const xfeat = all.reduce((n, r) => n + r.modifiesFeatures.length, 0);
console.log(
  `${dry ? 'Would write' : 'Wrote'} ${dry ? all.length : written} rule files + _index.json + README to ${path.relative(root, rulesDir)}\n` +
  `  ${all.length} rules · ${features.length} features · ${edges} dependsOn edges\n` +
  `  deltas: ${adds} adds · ${mods} modifies · ${xfeat} cross-feature changes`,
);
if (dry) {
  console.log('\nSample slugs (first 12):');
  for (const r of all.slice(0, 12)) console.log(`  seq ${r.newSeq.padStart(3)}  [${r.feature}]  ${r.slug}.md`);
}
