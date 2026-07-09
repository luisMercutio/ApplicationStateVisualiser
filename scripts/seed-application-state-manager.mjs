// Seed ApplicationStateManager's own Epics + Business Rules into its database.
//
// These are the *real* business rules of this application (the ApplicationState
// visualiser itself), read out of its code — server.js, db-store.js, the NgRx
// slices and components — and grouped into Epics. Run it against a running
// server; it targets the connection named "ApplicationStateManager" and is
// idempotent (existing epics/rules, matched by key/name, are left untouched).
//
//   node scripts/seed-application-state-manager.mjs            (uses http://localhost:3001)
//   ASV_API=http://localhost:3099 node scripts/seed-application-state-manager.mjs
const BASE = process.env.ASV_API || 'http://localhost:3001';
const CONN_NAME = process.env.ASV_CONN || 'ApplicationStateManager';

const EPICS = [
  { key: 'EPIC-001', seq: '1', title: 'Connection Registry (Master Store)',
    description: 'Register, encrypt, test and manage the target application database connections held in the master store.' },
  { key: 'EPIC-002', seq: '2', title: 'Application Switching & Browse',
    description: 'Choose the active application and safely browse its live tables and rows.' },
  { key: 'EPIC-003', seq: '3', title: 'Per-Application Epics & Business Rules',
    description: "Each application's own database holds its epics and business_rules, edited through the active connection." },
  { key: 'EPIC-004', seq: '4', title: 'Methodology Authoring',
    description: 'Agent and command files backed by the master database, editable in-app and synced to disk and target projects.' },
  { key: 'EPIC-005', seq: '5', title: 'BR-First Spec Visualisation',
    description: 'Business Rules as the atomic spec unit; composed state, ordering and layout are app-owned.' },
  { key: 'EPIC-006', seq: '6', title: 'Panel Workspace & Layouts',
    description: 'A grid of view panels with named, saveable layouts and network-friendly API access.' },
  { key: 'EPIC-007', seq: '7', title: 'WSL Terminal Bridge',
    description: 'An interactive tmux terminal inside WSL, bridged to the browser over a WebSocket/PTY channel.' },
  { key: 'EPIC-008', seq: '8', title: 'Architecture Artifact Access',
    description: 'Serve and edit the .claude architecture artifacts with path-traversal protection.' },
];

const RULES = [
  // EPIC-001 — Connection Registry
  { name: 'BR-001', epic: 'EPIC-001', seq: '1.1', category: 'data', features: ['connections'],
    rule: 'Store A (the viewer’s own MariaDB database) is auto-provisioned on startup: the database and its tables are created if missing.' },
  { name: 'BR-002', epic: 'EPIC-001', seq: '1.2', category: 'integration', features: ['connections'],
    rule: 'If MariaDB is unavailable, /api/db/* returns HTTP 503 while the rest of the app keeps working.' },
  { name: 'BR-003', epic: 'EPIC-001', seq: '1.3', category: 'auth', features: ['connections'],
    rule: 'Target database credentials are encrypted at rest with AES-256-GCM; the key comes from ASV_SECRET_KEY or an auto-generated, gitignored keyfile.' },
  { name: 'BR-004', epic: 'EPIC-001', seq: '1.4', category: 'auth', features: ['connections'], dependsOn: ['BR-003'],
    rule: 'The API never returns stored passwords; connection DTOs only expose whether a password is on file.' },
  { name: 'BR-005', epic: 'EPIC-001', seq: '1.5', category: 'validation', features: ['connections'],
    rule: 'Connection display names are unique.' },
  { name: 'BR-006', epic: 'EPIC-001', seq: '1.6', category: 'validation', features: ['connections'], dependsOn: ['BR-003'],
    rule: 'On edit, a blank password keeps the previously stored one.' },
  { name: 'BR-007', epic: 'EPIC-001', seq: '1.7', category: 'validation', features: ['connections'],
    rule: 'Port numbers are clamped to the range 1–65535.' },
  { name: 'BR-008', epic: 'EPIC-001', seq: '1.8', category: 'integration', features: ['connections'],
    rule: 'A connection test opens a real connection to the target and reports the server version or the failure reason.' },

  // EPIC-002 — Application Switching & Browse
  { name: 'BR-009', epic: 'EPIC-002', seq: '2.1', category: 'workflow', features: ['connections'],
    rule: 'Exactly one connection is active at a time (or none); the selection is persisted in the master store.' },
  { name: 'BR-010', epic: 'EPIC-002', seq: '2.2', category: 'validation', features: ['connections'], dependsOn: ['BR-009'],
    rule: 'A stale active selection pointing at a deleted connection is dropped.' },
  { name: 'BR-011', epic: 'EPIC-002', seq: '2.3', category: 'workflow', features: ['connections'], dependsOn: ['BR-009'],
    rule: 'Deleting the active connection clears the active selection.' },
  { name: 'BR-012', epic: 'EPIC-002', seq: '2.4', category: 'data', features: ['browse'],
    rule: 'Browsing lists only the base tables of the active target’s own schema.' },
  { name: 'BR-013', epic: 'EPIC-002', seq: '2.5', category: 'validation', features: ['browse'], dependsOn: ['BR-012'],
    rule: 'Table names are whitelisted against the live catalogue before use in a query, guarding against SQL injection.' },
  { name: 'BR-014', epic: 'EPIC-002', seq: '2.6', category: 'data', features: ['browse'], dependsOn: ['BR-012'],
    rule: 'Row previews clamp the limit to 1–500 (default 50) and flatten cells to display-safe primitives.' },
  { name: 'BR-015', epic: 'EPIC-002', seq: '2.7', category: 'data', features: ['connections'],
    rule: 'Per-target connection pools are cached and invalidated when a connection is edited or deleted.' },

  // EPIC-003 — Per-Application Epics & Business Rules
  { name: 'BR-016', epic: 'EPIC-003', seq: '3.1', category: 'data', features: ['br-data'],
    rule: 'Each application’s own database holds its epics and business_rules; the master database only holds connection parameters and methodology files.' },
  { name: 'BR-017', epic: 'EPIC-003', seq: '3.2', category: 'data', features: ['br-data'], dependsOn: ['BR-016'],
    rule: 'The epics and business_rules tables are auto-created in the target database on first touch, creating the target schema itself if missing.' },
  { name: 'BR-018', epic: 'EPIC-003', seq: '3.3', category: 'workflow', features: ['br-data'], dependsOn: ['BR-016'],
    rule: 'Deleting an epic keeps its business rules; their epic link is set to null (ON DELETE SET NULL).' },
  { name: 'BR-019', epic: 'EPIC-003', seq: '3.4', category: 'validation', features: ['br-data'], dependsOn: ['BR-016'],
    rule: 'Business rule names are unique per application; array and object fields are stored as JSON.' },
  { name: 'BR-020', epic: 'EPIC-003', seq: '3.5', category: 'workflow', features: ['br-data'], dependsOn: ['BR-009', 'BR-016'],
    rule: 'All epic and business-rule reads and writes are scoped to the active connection.' },

  // EPIC-004 — Methodology Authoring
  { name: 'BR-021', epic: 'EPIC-004', seq: '4.1', category: 'data', features: ['methodology'],
    rule: 'The master database is the source of truth for agent and command files, seeded once from .claude on first initialisation.' },
  { name: 'BR-022', epic: 'EPIC-004', seq: '4.2', category: 'workflow', features: ['methodology'], dependsOn: ['BR-021'],
    rule: 'Editing a methodology file writes to the database and writes through to the on-disk .claude copy so Claude Code stays in sync.' },
  { name: 'BR-023', epic: 'EPIC-004', seq: '4.3', category: 'validation', features: ['methodology'], dependsOn: ['BR-021'],
    rule: 'Methodology file names are validated and only the ‘agent’ and ‘command’ kinds are accepted.' },
  { name: 'BR-024', epic: 'EPIC-004', seq: '4.4', category: 'data', features: ['resources'],
    rule: 'The file-based resources editor treats .claude as the single source of truth, served directly with no copies or build step.' },
  { name: 'BR-025', epic: 'EPIC-004', seq: '4.5', category: 'integration', features: ['methodology'],
    rule: 'Methodology sync copies agents and commands into a target project’s .claude directory.' },

  // EPIC-005 — BR-First Spec Visualisation
  { name: 'BR-026', epic: 'EPIC-005', seq: '5.1', category: 'workflow', features: ['composed-state'],
    rule: 'Business Rules are the atomic spec unit; application state is composed by folding rule deltas up to a Dewey-sequence cut.' },
  { name: 'BR-027', epic: 'EPIC-005', seq: '5.2', category: 'workflow', features: ['composed-state'], dependsOn: ['BR-026'],
    rule: 'An active feature’s cut is its highest-sequence rule; the fold includes every rule at or before that cut.' },
  { name: 'BR-028', epic: 'EPIC-005', seq: '5.3', category: 'data', features: ['br-list'],
    rule: 'BR display order is app-owned (br-order.json), travels with the project, and is never clobbered by regeneration.' },
  { name: 'BR-029', epic: 'EPIC-005', seq: '5.4', category: 'data', features: ['br-graph'],
    rule: 'BR node positions are app-owned (br-positions.json), kept separate from generated rule data.' },

  // EPIC-006 — Panel Workspace & Layouts
  { name: 'BR-030', epic: 'EPIC-006', seq: '6.1', category: 'ui', features: ['layouts'],
    rule: 'Panels are arranged on a grid; named layouts can be saved, loaded, and deleted.' },
  { name: 'BR-031', epic: 'EPIC-006', seq: '6.2', category: 'validation', features: ['layouts'], dependsOn: ['BR-030'],
    rule: 'Layout names are whitelisted.' },
  { name: 'BR-032', epic: 'EPIC-006', seq: '6.3', category: 'integration', features: ['layouts'],
    rule: 'The client derives the API base from the browser host so it works over localhost and over Tailscale.' },

  // EPIC-007 — WSL Terminal Bridge
  { name: 'BR-033', epic: 'EPIC-007', seq: '7.1', category: 'integration', features: ['terminal'],
    rule: 'The terminal panel attaches to (or creates) a tmux session inside WSL over a WebSocket/PTY bridge.' },
  { name: 'BR-034', epic: 'EPIC-007', seq: '7.2', category: 'validation', features: ['terminal'], dependsOn: ['BR-033'],
    rule: 'tmux session names are validated against a safe pattern before attaching.' },
  { name: 'BR-035', epic: 'EPIC-007', seq: '7.3', category: 'integration', features: ['terminal'], dependsOn: ['BR-033'],
    rule: 'Terminal output is sent as binary frames and control messages as JSON text; panel resizes propagate to the Linux PTY.' },

  // EPIC-008 — Architecture Artifact Access
  { name: 'BR-036', epic: 'EPIC-008', seq: '8.1', category: 'validation', features: ['resources'],
    rule: 'Architecture files are served and edited under .claude/architecture with path-traversal protection.' },
];

async function json(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`${method} ${url} -> ${res.status}: ${data?.error ?? text}`);
  return data;
}

async function main() {
  const connections = await json('GET', `${BASE}/api/db/connections`);
  const conn = connections.find((c) => c.name === CONN_NAME);
  if (!conn) throw new Error(`No connection named "${CONN_NAME}". Register it first.`);
  const cid = conn.id;
  console.log(`Seeding "${CONN_NAME}" (${conn.database}) — connection ${cid}`);

  // Epics (idempotent by key).
  const existingEpics = (await json('GET', `${BASE}/api/db/connections/${cid}/epics`)).epics;
  const epicIdByKey = new Map(existingEpics.filter((e) => e.key).map((e) => [e.key, e.id]));
  let epicsCreated = 0;
  for (const e of EPICS) {
    if (epicIdByKey.has(e.key)) continue;
    const created = await json('POST', `${BASE}/api/db/connections/${cid}/epics`, e);
    epicIdByKey.set(e.key, created.id);
    epicsCreated++;
  }
  console.log(`Epics: ${epicsCreated} created, ${EPICS.length - epicsCreated} already present`);

  // Business rules (idempotent by name).
  const existingRules = (await json('GET', `${BASE}/api/db/connections/${cid}/business-rules`)).rules;
  const haveRule = new Set(existingRules.map((r) => r.name));
  let rulesCreated = 0;
  for (const r of RULES) {
    if (haveRule.has(r.name)) continue;
    await json('POST', `${BASE}/api/db/connections/${cid}/business-rules`, {
      name: r.name,
      rule: r.rule,
      seq: r.seq,
      category: r.category,
      epicId: epicIdByKey.get(r.epic) ?? null,
      features: r.features ?? [],
      dependsOn: r.dependsOn ?? [],
    });
    rulesCreated++;
  }
  console.log(`Business rules: ${rulesCreated} created, ${RULES.length - rulesCreated} already present`);
  console.log('Done.');
}

main().catch((err) => { console.error('Seed failed:', err.message); process.exit(1); });
