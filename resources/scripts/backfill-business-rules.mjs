#!/usr/bin/env node
/**
 * backfill-business-rules.mjs
 *
 * Deterministically seed a `business-rules.json` into every UC folder of a
 * target project's `.claude/architecture`, by parsing the artifacts that
 * already exist (suggestion.md, ClassDiagram.md, testState.md, mockups/, ...).
 *
 * This mirrors what the `br-synthesizer` agent produces, but without an LLM —
 * so an existing project gets real BR-graph data immediately. Going forward,
 * /uc-generate keeps these files fresh (and can enrich dependsOn/touches
 * beyond what pure parsing can infer).
 *
 * Output conforms to resources/schemas/business-rules.schema.json.
 * It never writes node coordinates — the viewer owns br-positions.json.
 *
 * Usage:
 *   node backfill-business-rules.mjs --root "C:/path/to/projectB" [--dry]
 */

import fs from 'node:fs';
import path from 'node:path';

// ── args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function argVal(flag) {
  const i = args.indexOf(flag);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
}
const root = argVal('--root');
const dry = args.includes('--dry');
if (!root) {
  console.error('Usage: node backfill-business-rules.mjs --root <projectRoot> [--dry]');
  process.exit(1);
}
const archBase = path.resolve(root, '.claude', 'architecture');
if (!fs.existsSync(archBase)) {
  console.error(`Not found: ${archBase}`);
  process.exit(1);
}

const today = new Date().toISOString().slice(0, 10);
const read = (p) => { try { return fs.readFileSync(p, 'utf-8'); } catch { return null; } };

// ── discover UC folders (NNN-slug) ──────────────────────────────────────────
const ucFolders = fs.readdirSync(archBase, { withFileTypes: true })
  .filter((e) => e.isDirectory() && /^\d{3}[a-z]?-/.test(e.name))
  .map((e) => e.name)
  .sort();

// usecases.md → title lookup by UC id
const titleByUc = {};
const usecasesMd = read(path.join(archBase, 'usecases.md')) || '';
for (const line of usecasesMd.split('\n')) {
  const m = line.match(/^\|\s*(UC-\d{3}[a-z]?)\s*\|\s*([^|]+?)\s*\|/);
  if (m) titleByUc[m[1]] = m[2].trim();
}

const ucIdFromFolder = (folder) => 'UC-' + folder.slice(0, 3) + (folder[3] >= 'a' && folder[3] <= 'z' ? folder[3] : '');

/** The authoritative UC id is the `uc:` field in suggestion.md frontmatter
 * (folders may have been renumbered by /uc-shift). Fall back to the folder. */
function ucIdOf(folder, sug) {
  const m = sug && sug.match(/^\s*uc:\s*(UC-\d{3}[a-z]?)\s*$/m);
  return m ? m[1] : ucIdFromFolder(folder);
}

// ── parsers ─────────────────────────────────────────────────────────────────

/** Extract the BR rows from the "### Business Rules" table of a suggestion.md. */
function parseBrTable(md) {
  const rules = [];
  if (!md) return rules;
  const lines = md.split('\n');
  let inBr = false;
  for (const line of lines) {
    if (/^#{2,4}\s+Business Rules\b/i.test(line)) { inBr = true; continue; }
    if (inBr && /^#{1,4}\s+/.test(line)) break; // next heading ends the section
    if (!inBr) continue;
    const m = line.match(/^\|\s*(BR-\d{3,})\s*\|\s*(.*?)\s*\|\s*$/);
    if (m) rules.push({ id: m[1], rule: m[2].replace(/\s+/g, ' ').trim() });
  }
  return rules;
}

/** Collect entity/table/class names from a ClassDiagram.md mermaid block. */
function parseEntities(md) {
  const names = new Set();
  if (!md) return names;
  for (const line of md.split('\n')) {
    // erDiagram:  `  billing_part {`   classDiagram: `  class Booking {`
    let m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]{2,})\s*\{/);
    if (m) names.add(m[1]);
    m = line.match(/^\s*class\s+([A-Za-z_][A-Za-z0-9_]{2,})\b/);
    if (m) names.add(m[1]);
  }
  return names;
}

/** Map BR id -> array of test descriptions from testState.md (sections `## BR-NNN: ...`). */
function parseTests(md) {
  const byBr = {};
  if (!md) return byBr;
  const lines = md.split('\n');
  let cur = null;
  for (const line of lines) {
    const h = line.match(/^#{2,4}\s+(BR-\d{3,})\b/);
    if (h) { cur = h[1]; byBr[cur] = []; continue; }
    if (!cur) continue;
    if (/^#{1,4}\s+/.test(line)) { cur = null; continue; }
    // table row: | app | type | description |
    const cells = line.split('|').map((c) => c.trim()).filter((_, i, a) => i > 0 && i < a.length - 1);
    if (cells.length >= 3 && !/^-+$/.test(cells[0]) && !/^application$/i.test(cells[0])) {
      byBr[cur].push(cells.slice(1).join(' — '));
    }
  }
  return byBr;
}

const CATEGORY_RULES = [
  ['auth', /\b(JWT|token|role|401|403|auth|permission|MANAGE_|ADMIN|login|password)\b/i],
  ['routing', /\b(redirect|route|guard|navigat|\/access-denied|unknown route)\b/i],
  ['validation', /\b(must|required|400|invalid|reject|>=|<=|min |max |unique|non-null|not found)\b/i],
  ['workflow', /\b(status|state|transition|lock|approve|generat|workflow|step)\b/i],
  ['ui', /\b(display|shown|render|page|badge|column|dialog|button|form)\b/i],
  ['integration', /\b(PDF|email|export|webhook|ZUGFeRD|upload|download|Postman)\b/i],
];
function categorize(rule) {
  for (const [cat, re] of CATEGORY_RULES) if (re.test(rule)) return cat;
  return 'data';
}

// ── PASS 1: collect raw BRs + global vocab ──────────────────────────────────
const allBrs = []; // {id, seq, uc, rule, folder}
const testsByUc = {};
const entityVocab = new Set();

const ucByFolder = {};
for (const folder of ucFolders) {
  const dir = path.join(archBase, folder);
  const sug = read(path.join(dir, 'suggestion.md'));
  const uc = ucIdOf(folder, sug);
  ucByFolder[folder] = uc;
  const brs = parseBrTable(sug);
  for (const b of brs) {
    allBrs.push({ id: b.id, seq: parseInt(b.id.slice(3), 10), uc, rule: b.rule, folder });
  }
  for (const e of parseEntities(read(path.join(dir, 'ClassDiagram.md')))) entityVocab.add(e);
  testsByUc[uc] = parseTests(read(path.join(dir, 'testState.md')));
}
allBrs.sort((a, b) => a.seq - b.seq);

// ── PASS 2: compute touches per BR ──────────────────────────────────────────
const RE = {
  endpoint: /\b(GET|POST|PUT|DELETE|PATCH)\s+(\/[A-Za-z0-9_{}\/\-]*)/g,
  slice: /\b([a-z][A-Za-z0-9]*Feature)\b/g,
  component: /\b([A-Z][A-Za-z0-9]*Component)\b/g,
  selector: /\b(select[A-Z][A-Za-z0-9]*)\b/g,
  relatedUc: /\bUC-\d{3}[a-z]?\b/g,
};
function matchAll(text, re) {
  const out = new Set();
  let m;
  re.lastIndex = 0;
  while ((m = re.exec(text)) !== null) out.add(m[1] ?? m[0]);
  return [...out];
}

for (const br of allBrs) {
  const t = br.rule;
  const endpoints = [...t.matchAll(RE.endpoint)].map((m) => `${m[1]} ${m[2]}`);
  const entities = [...entityVocab].filter((e) => {
    if (e.length < 4) return false;
    return new RegExp(`\\b${e.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(t);
  });
  const components = matchAll(t, RE.component);
  const dir = path.join(archBase, br.folder);
  const mockups = components
    .map((c) => `${c}.html`)
    .filter((f) => fs.existsSync(path.join(dir, 'mockups', f)));
  br.touches = {
    entities: [...new Set(entities)],
    endpoints: [...new Set(endpoints)],
    slices: matchAll(t, RE.slice),
    selectors: matchAll(t, RE.selector),
    components,
    mockups,
    tests: (testsByUc[br.uc] && testsByUc[br.uc][br.id]) || [],
  };
  br.relatedUc = matchAll(t, RE.relatedUc).filter((u) => u !== br.uc);
  br.category = categorize(t);
}

// ── PASS 3: derive dependsOn via "latest earlier BR sharing an anchor" ──────
// A rule builds on the most recent earlier rule that touches the same artifact.
// Edges always point to a strictly lower seq → guaranteed acyclic.
const ANCHOR_KEYS = ['entities', 'endpoints', 'slices', 'components'];
// latest (highest-seq) BR of each UC — used to resolve cross-UC reference edges.
const latestBrOfUc = {};
for (const br of allBrs) latestBrOfUc[br.uc] = br.id; // allBrs is seq-sorted asc
for (let i = 0; i < allBrs.length; i++) {
  const br = allBrs[i];
  const deps = new Set();
  // (a) shared-anchor edges: build on the most recent earlier rule touching the same artifact
  for (const key of ANCHOR_KEYS) {
    for (const val of br.touches[key]) {
      let best = null;
      for (let j = 0; j < i; j++) {
        if (allBrs[j].touches[key].includes(val)) best = allBrs[j]; // last (highest seq) wins
      }
      if (best) deps.add(best.id);
    }
  }
  // (b) cross-UC reference edges: an explicit [[UC-XXX]] mention is a prerequisite
  //     on that UC's work; anchor it to that UC's latest rule (strictly lower seq).
  for (const refUc of br.relatedUc) {
    const anchor = latestBrOfUc[refUc];
    if (anchor && parseInt(anchor.slice(3)) < br.seq) deps.add(anchor);
  }
  br.dependsOn = [...deps].sort((a, b) => parseInt(a.slice(3)) - parseInt(b.slice(3)));
}

// ── write per-UC files ──────────────────────────────────────────────────────
const byFolder = {};
for (const br of allBrs) (byFolder[br.folder] ??= []).push(br);

let written = 0, totalRules = 0;
for (const folder of ucFolders) {
  const list = byFolder[folder] || [];
  if (list.length === 0) continue;
  const uc = ucByFolder[folder];
  const doc = {
    uc,
    title: titleByUc[uc] || '',
    generated: today,
    rules: list
      .sort((a, b) => a.seq - b.seq)
      .map((b) => ({
        id: b.id,
        uc: b.uc,
        seq: b.seq,
        rule: b.rule,
        category: b.category,
        dependsOn: b.dependsOn,
        relatedUc: b.relatedUc,
        touches: b.touches,
      })),
  };
  totalRules += list.length;
  const outPath = path.join(archBase, folder, 'business-rules.json');
  if (dry) {
    console.log(`[dry] ${uc}: ${list.length} rules → ${path.relative(root, outPath)}`);
  } else {
    fs.writeFileSync(outPath, JSON.stringify(doc, null, 2) + '\n', 'utf-8');
    written++;
  }
}

const edges = allBrs.reduce((n, b) => n + b.dependsOn.length, 0);
console.log(
  `${dry ? 'Would write' : 'Wrote'} ${dry ? byFolder && Object.keys(byFolder).length : written} files, ` +
  `${totalRules} rules, ${edges} dependency edges across ${ucFolders.length} UC folders.`,
);
