// ── The visualiser's single MariaDB store ─────────────────────────────────────
// This module owns everything database-related for the app. Everything lives in
// ONE database (Store A, `app_state_visualiser` by default):
//   • applications  — the registered applications whose "state" we visualise.
//   • epics / business_rules / notes / br_additional_agent_information — the
//     state of each application, every row scoped by application_id.
//   • app_settings      — small key/value store (e.g. the active application).
//   • methodology_files — the agents + commands, editable from within the app.
//
// There are no per-application databases and no external connection registry:
// selecting an application simply filters the single store. Store A itself is
// reached with env-configured credentials so no secret is ever committed.
const mysql = require('mysql2/promise');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function clampInt(value, fallback, min, max) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

// The methodology files (agents + commands) live under this repo's .claude dir.
// The store DB becomes their source of truth, but we also write edits back to
// disk so Claude Code (which auto-discovers .claude/) always sees the live copy.
const CLAUDE_DIR = path.resolve(__dirname, process.env.CLAUDE_DIR || '.claude');
const METHODOLOGY_KINDS = { agent: 'agents', command: 'commands' }; // kind -> subdir

// ── Store connection settings (env-configured, never persisted) ───────────────
const STORE = {
  host: process.env.ASV_STORE_HOST || '127.0.0.1',
  port: clampInt(process.env.ASV_STORE_PORT, 3306, 1, 65535),
  user: process.env.ASV_STORE_USER || 'root',
  password: process.env.ASV_STORE_PASSWORD || '',
  database: process.env.ASV_STORE_DB || 'app_state_visualiser',
};

// A store identifier is only ever an internal name we control, but quote-escape
// defensively before interpolating it into DDL (identifiers can't be bound).
function backtick(id) {
  return '`' + String(id).replace(/`/g, '``') + '`';
}

let storePool = null;
let ready = false;
let initError = null;

async function init() {
  try {
    // Connect without a database first so we can create the store on a fresh box.
    const admin = await mysql.createConnection({
      host: STORE.host, port: STORE.port, user: STORE.user, password: STORE.password,
      connectTimeout: 8000,
    });
    await admin.query(`CREATE DATABASE IF NOT EXISTS ${backtick(STORE.database)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await admin.end();

    storePool = mysql.createPool({
      host: STORE.host, port: STORE.port, user: STORE.user, password: STORE.password,
      database: STORE.database, waitForConnections: true, connectionLimit: 5, connectTimeout: 8000,
    });

    // applications — the top-level entity. Everything else references it.
    await storePool.query(`
      CREATE TABLE IF NOT EXISTS applications (
        id          VARCHAR(36)   NOT NULL PRIMARY KEY,
        name        VARCHAR(190)  NOT NULL UNIQUE,
        description TEXT,
        root_dir    VARCHAR(1024),
        created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

    await storePool.query(`
      CREATE TABLE IF NOT EXISTS app_settings (
        k VARCHAR(64) NOT NULL PRIMARY KEY,
        v TEXT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

    await storePool.query(`
      CREATE TABLE IF NOT EXISTS methodology_files (
        kind       VARCHAR(32)  NOT NULL,
        name       VARCHAR(190) NOT NULL,
        content    LONGTEXT,
        updated_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (kind, name)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

    await ensureAppDataSchema();

    ready = true;
    initError = null;
    await seedMethodology(); // best-effort; never blocks readiness
  } catch (err) {
    ready = false;
    initError = err.message;
    throw err;
  }
}

// The per-application "state" tables. Every row carries an application_id and is
// removed with its application (ON DELETE CASCADE). epic_key / BR name are unique
// *per application*, so two applications can each own an "EPIC-001" or a "BR-001".
// Array/object BR fields are stored as JSON text and (de)serialised in this
// module so the shape survives a round-trip on MariaDB (JSON == LONGTEXT).
async function ensureAppDataSchema() {
  // epics first — business_rules.epic_id references it.
  await storePool.query(`
    CREATE TABLE IF NOT EXISTS epics (
      id             VARCHAR(36)  NOT NULL PRIMARY KEY,
      application_id VARCHAR(36)  NOT NULL,
      epic_key       VARCHAR(64),
      title          VARCHAR(255) NOT NULL,
      description    TEXT,
      seq            VARCHAR(64),
      created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_epic_app_key (application_id, epic_key),
      KEY idx_epic_app (application_id),
      CONSTRAINT fk_epic_app FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await storePool.query(`
    CREATE TABLE IF NOT EXISTS business_rules (
      id                VARCHAR(36)  NOT NULL PRIMARY KEY,
      application_id    VARCHAR(36)  NOT NULL,
      name              VARCHAR(190) NOT NULL,
      epic_id           VARCHAR(36),
      seq               VARCHAR(64),
      rule              TEXT         NOT NULL,
      rationale         TEXT,
      category          VARCHAR(32),
      features          LONGTEXT,
      modifies_features LONGTEXT,
      depends_on        LONGTEXT,
      touches           LONGTEXT,
      delta             LONGTEXT,
      created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_br_app_name (application_id, name),
      KEY idx_br_epic (epic_id),
      KEY idx_br_app (application_id),
      CONSTRAINT fk_br_app FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE,
      CONSTRAINT fk_br_epic FOREIGN KEY (epic_id) REFERENCES epics(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  // Extra, agent-facing context attached to a Business Rule. Each row references
  // one BR and carries a free-text description. During development this is loaded
  // into the developer agents once the BR under development has reached (seq >=)
  // the referenced BR — see listAgentInfoUpToSeq.
  await storePool.query(`
    CREATE TABLE IF NOT EXISTS br_additional_agent_information (
      id               VARCHAR(36) NOT NULL PRIMARY KEY,
      application_id   VARCHAR(36) NOT NULL,
      business_rule_id VARCHAR(36) NOT NULL,
      description      TEXT        NOT NULL,
      created_at       DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at       DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_agentinfo_br (business_rule_id),
      KEY idx_agentinfo_app (application_id),
      CONSTRAINT fk_agentinfo_app FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE,
      CONSTRAINT fk_agentinfo_br FOREIGN KEY (business_rule_id) REFERENCES business_rules(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  // Free-form notes / ideas kept against an application. `related_brs` is an
  // OPTIONAL JSON array of BR references (free-form strings, not FKs), so a note
  // stays valid regardless of which BRs exist. Independent of epics/business_rules.
  await storePool.query(`
    CREATE TABLE IF NOT EXISTS notes (
      id             VARCHAR(36)  NOT NULL PRIMARY KEY,
      application_id VARCHAR(36)  NOT NULL,
      title          VARCHAR(255) NOT NULL,
      description    LONGTEXT,
      related_brs    LONGTEXT,
      created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_notes_app (application_id),
      CONSTRAINT fk_notes_app FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
}

function status() {
  return { ready, error: initError, store: { host: STORE.host, port: STORE.port, database: STORE.database } };
}

function ensureReady() {
  if (!ready) {
    const e = new Error(initError ? `Store unavailable: ${initError}` : 'Store not initialised');
    e.status = 503;
    throw e;
  }
}

function badRequest(msg) {
  const e = new Error(msg);
  e.status = 400;
  return e;
}

// ── Applications ──────────────────────────────────────────────────────────────
function appRowToDto(r) {
  return {
    id: r.id,
    name: r.name,
    description: r.description ?? null,
    rootDir: r.root_dir ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function normaliseApplication(input) {
  const name = String(input?.name ?? '').trim();
  if (!name) throw badRequest('name is required');
  return {
    name,
    description: input?.description == null ? null : String(input.description),
    rootDir: input?.rootDir == null ? null : String(input.rootDir).trim() || null,
  };
}

async function listApplications() {
  ensureReady();
  const [rows] = await storePool.query('SELECT * FROM applications ORDER BY name');
  return rows.map(appRowToDto);
}

async function getApplicationRow(id) {
  const [rows] = await storePool.query('SELECT * FROM applications WHERE id = ?', [id]);
  return rows[0] || null;
}

async function getApplication(id) {
  ensureReady();
  const row = await getApplicationRow(id);
  return row ? appRowToDto(row) : null;
}

// Guard: reject data operations aimed at an application that doesn't exist, so a
// stale client id surfaces as 400 instead of silently writing an orphan row.
async function assertApplication(id) {
  ensureReady();
  const row = await getApplicationRow(id);
  if (!row) throw badRequest('application not found');
  return row;
}

async function createApplication(input) {
  ensureReady();
  const a = normaliseApplication(input);
  const id = crypto.randomUUID();
  try {
    await storePool.query(
      'INSERT INTO applications (id, name, description, root_dir) VALUES (?, ?, ?, ?)',
      [id, a.name, a.description, a.rootDir],
    );
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw badRequest(`An application named "${a.name}" already exists`);
    throw err;
  }
  return getApplication(id);
}

async function updateApplication(id, input) {
  ensureReady();
  const existing = await getApplicationRow(id);
  if (!existing) return null;
  const a = normaliseApplication(input);
  try {
    await storePool.query(
      'UPDATE applications SET name = ?, description = ?, root_dir = ? WHERE id = ?',
      [a.name, a.description, a.rootDir, id],
    );
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw badRequest(`An application named "${a.name}" already exists`);
    throw err;
  }
  return getApplication(id);
}

async function deleteApplication(id) {
  ensureReady();
  // CASCADE removes the application's epics / BRs / notes / agent-info.
  const [res] = await storePool.query('DELETE FROM applications WHERE id = ?', [id]);
  const active = await getActiveId();
  if (active === id) await setActiveId(null);
  return res.affectedRows > 0;
}

// ── Active selection (which application the app currently shows) ───────────────
const ACTIVE_KEY = 'active_application_id';

async function getActiveId() {
  ensureReady();
  const [rows] = await storePool.query('SELECT v FROM app_settings WHERE k = ?', [ACTIVE_KEY]);
  return rows.length ? rows[0].v : null;
}

async function setActiveId(id) {
  ensureReady();
  if (id) await assertApplication(id);
  await storePool.query(
    'INSERT INTO app_settings (k, v) VALUES (?, ?) ON DUPLICATE KEY UPDATE v = VALUES(v)',
    [ACTIVE_KEY, id ?? null],
  );
  return id ?? null;
}

function toJsonText(v) { return JSON.stringify(v ?? null); }
function fromJsonText(v, fallback) {
  if (v == null) return fallback;
  if (typeof v === 'object') return v; // some drivers pre-parse JSON columns
  try { const p = JSON.parse(v); return p == null ? fallback : p; } catch { return fallback; }
}

// ── Epics ─────────────────────────────────────────────────────────────────────
function epicRowToDto(r) {
  return {
    id: r.id,
    key: r.epic_key ?? null,
    title: r.title,
    description: r.description ?? null,
    seq: r.seq ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function normaliseEpic(input) {
  const title = String(input?.title ?? '').trim();
  if (!title) throw badRequest('title is required');
  const key = input?.key == null ? '' : String(input.key).trim();
  return {
    title,
    key: key || null,
    description: input?.description == null ? null : String(input.description),
    seq: input?.seq == null ? null : String(input.seq).trim() || null,
  };
}

async function listEpics(appId) {
  await assertApplication(appId);
  const [rows] = await storePool.query(
    'SELECT * FROM epics WHERE application_id = ? ORDER BY seq IS NULL, seq, title', [appId]);
  return rows.map(epicRowToDto);
}

async function createEpic(appId, input) {
  await assertApplication(appId);
  const e = normaliseEpic(input);
  const epicId = crypto.randomUUID();
  try {
    await storePool.query(
      'INSERT INTO epics (id, application_id, epic_key, title, description, seq) VALUES (?, ?, ?, ?, ?, ?)',
      [epicId, appId, e.key, e.title, e.description, e.seq],
    );
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw badRequest(`An epic with key "${e.key}" already exists`);
    throw err;
  }
  const [rows] = await storePool.query('SELECT * FROM epics WHERE id = ?', [epicId]);
  return epicRowToDto(rows[0]);
}

async function updateEpic(appId, epicId, input) {
  await assertApplication(appId);
  const e = normaliseEpic(input);
  const [res] = await storePool.query(
    'UPDATE epics SET epic_key = ?, title = ?, description = ?, seq = ? WHERE id = ? AND application_id = ?',
    [e.key, e.title, e.description, e.seq, epicId, appId],
  ).catch(err => {
    if (err.code === 'ER_DUP_ENTRY') throw badRequest(`An epic with key "${e.key}" already exists`);
    throw err;
  });
  if (res.affectedRows === 0) return null;
  const [rows] = await storePool.query('SELECT * FROM epics WHERE id = ?', [epicId]);
  return epicRowToDto(rows[0]);
}

async function deleteEpic(appId, epicId) {
  await assertApplication(appId);
  // FK is ON DELETE SET NULL, so member BRs survive un-grouped.
  const [res] = await storePool.query(
    'DELETE FROM epics WHERE id = ? AND application_id = ?', [epicId, appId]);
  return res.affectedRows > 0;
}

// ── Notes ─────────────────────────────────────────────────────────────────────
function noteRowToDto(r) {
  return {
    id: r.id,
    title: r.title,
    description: r.description ?? null,
    relatedBrs: fromJsonText(r.related_brs, []),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function normaliseNote(input) {
  const title = String(input?.title ?? '').trim();
  if (!title) throw badRequest('title is required');
  const related = Array.isArray(input?.relatedBrs)
    ? input.relatedBrs.map((s) => String(s).trim()).filter(Boolean)
    : [];
  return {
    title,
    description: input?.description == null ? null : String(input.description),
    relatedBrs: [...new Set(related)],
  };
}

async function listNotes(appId) {
  await assertApplication(appId);
  const [rows] = await storePool.query(
    'SELECT * FROM notes WHERE application_id = ? ORDER BY updated_at DESC, title', [appId]);
  return rows.map(noteRowToDto);
}

async function createNote(appId, input) {
  await assertApplication(appId);
  const n = normaliseNote(input);
  const noteId = crypto.randomUUID();
  await storePool.query(
    'INSERT INTO notes (id, application_id, title, description, related_brs) VALUES (?, ?, ?, ?, ?)',
    [noteId, appId, n.title, n.description, toJsonText(n.relatedBrs)],
  );
  const [rows] = await storePool.query('SELECT * FROM notes WHERE id = ?', [noteId]);
  return noteRowToDto(rows[0]);
}

async function updateNote(appId, noteId, input) {
  await assertApplication(appId);
  const n = normaliseNote(input);
  const [res] = await storePool.query(
    'UPDATE notes SET title = ?, description = ?, related_brs = ? WHERE id = ? AND application_id = ?',
    [n.title, n.description, toJsonText(n.relatedBrs), noteId, appId],
  );
  if (res.affectedRows === 0) return null;
  const [rows] = await storePool.query('SELECT * FROM notes WHERE id = ?', [noteId]);
  return noteRowToDto(rows[0]);
}

async function deleteNote(appId, noteId) {
  await assertApplication(appId);
  const [res] = await storePool.query(
    'DELETE FROM notes WHERE id = ? AND application_id = ?', [noteId, appId]);
  return res.affectedRows > 0;
}

// ── Business rules ────────────────────────────────────────────────────────────
function brRowToDto(r) {
  return {
    id: r.id,
    name: r.name,
    epicId: r.epic_id ?? null,
    seq: r.seq ?? null,
    rule: r.rule,
    rationale: r.rationale ?? null,
    category: r.category ?? null,
    features: fromJsonText(r.features, []),
    modifiesFeatures: fromJsonText(r.modifies_features, []),
    dependsOn: fromJsonText(r.depends_on, []),
    touches: fromJsonText(r.touches, {}),
    delta: fromJsonText(r.delta, {}),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function normaliseBr(input) {
  const name = String(input?.name ?? '').trim();
  const rule = String(input?.rule ?? '').trim();
  if (!name) throw badRequest('name is required');
  if (!rule) throw badRequest('rule is required');
  const strArr = (v) => (Array.isArray(v) ? v.map(String) : []);
  return {
    name, rule,
    epicId: input?.epicId ? String(input.epicId) : null,
    seq: input?.seq == null ? null : String(input.seq).trim() || null,
    rationale: input?.rationale == null ? null : String(input.rationale),
    category: input?.category ? String(input.category) : null,
    features: strArr(input?.features),
    modifiesFeatures: strArr(input?.modifiesFeatures),
    dependsOn: strArr(input?.dependsOn),
    touches: input?.touches && typeof input.touches === 'object' ? input.touches : {},
    delta: input?.delta && typeof input.delta === 'object' ? input.delta : {},
  };
}

async function listBusinessRules(appId) {
  await assertApplication(appId);
  const [rows] = await storePool.query(
    'SELECT * FROM business_rules WHERE application_id = ? ORDER BY seq IS NULL, seq, name', [appId]);
  return rows.map(brRowToDto);
}

async function getBrRow(brId) {
  const [rows] = await storePool.query('SELECT * FROM business_rules WHERE id = ?', [brId]);
  return rows[0] || null;
}

async function createBusinessRule(appId, input) {
  await assertApplication(appId);
  const b = normaliseBr(input);
  const brId = crypto.randomUUID();
  try {
    await storePool.query(
      `INSERT INTO business_rules
         (id, application_id, name, epic_id, seq, rule, rationale, category, features, modifies_features, depends_on, touches, delta)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [brId, appId, b.name, b.epicId, b.seq, b.rule, b.rationale, b.category,
        toJsonText(b.features), toJsonText(b.modifiesFeatures), toJsonText(b.dependsOn),
        toJsonText(b.touches), toJsonText(b.delta)],
    );
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw badRequest(`A business rule named "${b.name}" already exists`);
    if (err.code === 'ER_NO_REFERENCED_ROW_2' || err.code === 'ER_NO_REFERENCED_ROW') throw badRequest('epicId does not match an existing epic');
    throw err;
  }
  return brRowToDto(await getBrRow(brId));
}

async function updateBusinessRule(appId, brId, input) {
  await assertApplication(appId);
  const b = normaliseBr(input);
  let res;
  try {
    [res] = await storePool.query(
      `UPDATE business_rules SET
         name = ?, epic_id = ?, seq = ?, rule = ?, rationale = ?, category = ?,
         features = ?, modifies_features = ?, depends_on = ?, touches = ?, delta = ?
       WHERE id = ? AND application_id = ?`,
      [b.name, b.epicId, b.seq, b.rule, b.rationale, b.category,
        toJsonText(b.features), toJsonText(b.modifiesFeatures), toJsonText(b.dependsOn),
        toJsonText(b.touches), toJsonText(b.delta), brId, appId],
    );
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw badRequest(`A business rule named "${b.name}" already exists`);
    if (err.code === 'ER_NO_REFERENCED_ROW_2' || err.code === 'ER_NO_REFERENCED_ROW') throw badRequest('epicId does not match an existing epic');
    throw err;
  }
  if (res.affectedRows === 0) return null;
  return brRowToDto(await getBrRow(brId));
}

async function deleteBusinessRule(appId, brId) {
  await assertApplication(appId);
  const [res] = await storePool.query(
    'DELETE FROM business_rules WHERE id = ? AND application_id = ?', [brId, appId]);
  return res.affectedRows > 0;
}

// ── Additional agent information (extra context attached to a Business Rule) ───
// Numeric-aware seq compare: nulls sort last. Mirrors the Dewey ordering the BRs
// use elsewhere so "seq >= referenced seq" means "development has reached this BR".
function seqCompare(a, b) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  const A = String(a).split('.').map(Number);
  const B = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(A.length, B.length); i++) {
    const x = Number.isFinite(A[i]) ? A[i] : -1;
    const y = Number.isFinite(B[i]) ? B[i] : -1;
    if (x !== y) return x - y;
  }
  return 0;
}

function agentInfoRowToDto(r) {
  return {
    id: r.id,
    businessRuleId: r.business_rule_id,
    description: r.description,
    brName: r.br_name ?? null,
    brSeq: r.br_seq ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// Every read joins the BR so callers get the referenced rule's name + seq.
const AGENT_INFO_SELECT = `
  SELECT ai.*, br.name AS br_name, br.seq AS br_seq
    FROM br_additional_agent_information ai
    JOIN business_rules br ON br.id = ai.business_rule_id`;

async function listAgentInfo(appId) {
  await assertApplication(appId);
  const [rows] = await storePool.query(
    `${AGENT_INFO_SELECT} WHERE ai.application_id = ? ORDER BY br.seq IS NULL, br.seq, ai.created_at`, [appId]);
  return rows.map(agentInfoRowToDto);
}

function normaliseAgentInfo(input) {
  const businessRuleId = String(input?.businessRuleId ?? '').trim();
  const description = String(input?.description ?? '').trim();
  if (!businessRuleId) throw badRequest('businessRuleId is required');
  if (!description) throw badRequest('description is required');
  return { businessRuleId, description };
}

async function createAgentInfo(appId, input) {
  await assertApplication(appId);
  const a = normaliseAgentInfo(input);
  const infoId = crypto.randomUUID();
  try {
    await storePool.query(
      'INSERT INTO br_additional_agent_information (id, application_id, business_rule_id, description) VALUES (?, ?, ?, ?)',
      [infoId, appId, a.businessRuleId, a.description],
    );
  } catch (err) {
    if (err.code === 'ER_NO_REFERENCED_ROW_2' || err.code === 'ER_NO_REFERENCED_ROW') throw badRequest('businessRuleId does not match an existing Business Rule');
    throw err;
  }
  const [rows] = await storePool.query(`${AGENT_INFO_SELECT} WHERE ai.id = ?`, [infoId]);
  return agentInfoRowToDto(rows[0]);
}

async function updateAgentInfo(appId, infoId, input) {
  await assertApplication(appId);
  const a = normaliseAgentInfo(input);
  let res;
  try {
    [res] = await storePool.query(
      'UPDATE br_additional_agent_information SET business_rule_id = ?, description = ? WHERE id = ? AND application_id = ?',
      [a.businessRuleId, a.description, infoId, appId],
    );
  } catch (err) {
    if (err.code === 'ER_NO_REFERENCED_ROW_2' || err.code === 'ER_NO_REFERENCED_ROW') throw badRequest('businessRuleId does not match an existing Business Rule');
    throw err;
  }
  if (res.affectedRows === 0) return null;
  const [rows] = await storePool.query(`${AGENT_INFO_SELECT} WHERE ai.id = ?`, [infoId]);
  return agentInfoRowToDto(rows[0]);
}

async function deleteAgentInfo(appId, infoId) {
  await assertApplication(appId);
  const [res] = await storePool.query(
    'DELETE FROM br_additional_agent_information WHERE id = ? AND application_id = ?', [infoId, appId]);
  return res.affectedRows > 0;
}

// The develop-time query: every agent-info entry whose referenced BR has already
// been reached by development, i.e. referenced BR seq <= the seq under development.
// Filtered in JS so the Dewey seq ordering matches the rest of the app.
async function listAgentInfoUpToSeq(appId, seq) {
  const all = await listAgentInfo(appId);
  return all.filter((a) => seqCompare(a.brSeq, seq) <= 0);
}

// ── Methodology files (agents + commands) — store DB is source of truth ───────
// Seed once from disk; thereafter the store DB is authoritative. Edits round-trip
// to disk too so Claude Code keeps working against .claude/ without a build step.
function methodologySubdir(kind) {
  const sub = METHODOLOGY_KINDS[kind];
  if (!sub) throw badRequest(`unknown methodology kind: ${kind}`);
  return sub;
}

function assertFileName(name) {
  if (!/^[A-Za-z0-9._-]+$/.test(String(name || ''))) throw badRequest('invalid file name');
  return name;
}

async function seedMethodology() {
  try {
    const [[{ n }]] = await storePool.query('SELECT COUNT(*) AS n FROM methodology_files');
    if (n > 0) return; // already seeded / user-managed
    for (const [kind, sub] of Object.entries(METHODOLOGY_KINDS)) {
      let entries = [];
      try { entries = await fs.promises.readdir(path.join(CLAUDE_DIR, sub)); } catch { continue; }
      for (const name of entries.filter(f => f.endsWith('.md'))) {
        const content = await fs.promises.readFile(path.join(CLAUDE_DIR, sub, name), 'utf8');
        await storePool.query(
          'INSERT INTO methodology_files (kind, name, content) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE content = VALUES(content)',
          [kind, name, content],
        );
      }
    }
  } catch (err) {
    console.warn(`Methodology seed skipped: ${err.message}`);
  }
}

async function listMethodologyFiles() {
  ensureReady();
  const [rows] = await storePool.query('SELECT kind, name, updated_at FROM methodology_files ORDER BY kind, name');
  return rows.map(r => ({ kind: r.kind, name: r.name, updatedAt: r.updated_at }));
}

async function getMethodologyFile(kind, name) {
  ensureReady();
  methodologySubdir(kind);
  assertFileName(name);
  const [rows] = await storePool.query('SELECT kind, name, content, updated_at FROM methodology_files WHERE kind = ? AND name = ?', [kind, name]);
  if (!rows.length) return null;
  const r = rows[0];
  return { kind: r.kind, name: r.name, content: r.content ?? '', updatedAt: r.updated_at };
}

async function saveMethodologyFile(kind, name, content) {
  ensureReady();
  const sub = methodologySubdir(kind);
  assertFileName(name);
  if (typeof content !== 'string') throw badRequest('content (string) required');
  await storePool.query(
    'INSERT INTO methodology_files (kind, name, content) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE content = VALUES(content)',
    [kind, name, content],
  );
  // Best-effort write-through to disk so the live .claude/ copy stays in sync.
  try {
    const dir = path.join(CLAUDE_DIR, sub);
    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.writeFile(path.join(dir, name), content, 'utf8');
  } catch (err) {
    console.warn(`Methodology disk write-through failed for ${kind}/${name}: ${err.message}`);
  }
  return getMethodologyFile(kind, name);
}

module.exports = {
  init, status,
  listApplications, getApplication, createApplication, updateApplication, deleteApplication,
  getActiveId, setActiveId,
  listEpics, createEpic, updateEpic, deleteEpic,
  listNotes, createNote, updateNote, deleteNote,
  listBusinessRules, createBusinessRule, updateBusinessRule, deleteBusinessRule,
  listAgentInfo, createAgentInfo, updateAgentInfo, deleteAgentInfo, listAgentInfoUpToSeq,
  listMethodologyFiles, getMethodologyFile, saveMethodologyFile,
};
