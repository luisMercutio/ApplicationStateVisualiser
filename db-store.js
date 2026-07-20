// ── Database A: the visualiser's own MariaDB control store ────────────────────
// This module owns everything database-related for the app:
//   • Store A  — a MariaDB database owned by the viewer that holds the saved
//                connection profiles for the target application databases.
//   • B…Z      — the registered target databases whose data we retrieve to
//                display "different states of different applications".
//
// Credentials for B…Z are encrypted at rest (AES-256-GCM) and never handed
// back to the client. The plaintext only exists in memory when we open a pool
// to a target. Store A itself is reached with env-configured credentials so no
// secret is ever committed to the repo.
const mysql = require('mysql2/promise');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function clampInt(value, fallback, min, max) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

// ── Encryption key ────────────────────────────────────────────────────────────
// Prefer an operator-supplied key (ASV_SECRET_KEY, 32 bytes as hex or base64).
// Otherwise generate one once and persist it to a gitignored keyfile so stored
// credentials survive restarts. Losing the key means the stored passwords can
// no longer be decrypted — treat .db-secret.key like any other secret.
const KEY_FILE = path.resolve(__dirname, '.db-secret.key');

function loadOrCreateKey() {
  const env = process.env.ASV_SECRET_KEY;
  if (env) {
    const buf = Buffer.from(env, /^[0-9a-fA-F]{64}$/.test(env) ? 'hex' : 'base64');
    if (buf.length !== 32) throw new Error('ASV_SECRET_KEY must decode to exactly 32 bytes');
    return buf;
  }
  try {
    const saved = fs.readFileSync(KEY_FILE);
    if (saved.length === 32) return saved;
  } catch { /* no keyfile yet */ }
  const key = crypto.randomBytes(32);
  fs.writeFileSync(KEY_FILE, key, { mode: 0o600 });
  return key;
}

const KEY = loadOrCreateKey();

// Serialised form: ivB64:tagB64:cipherB64. Empty string stays empty so a
// "no password" profile round-trips cleanly.
function encrypt(plain) {
  if (plain == null || plain === '') return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
}

function decrypt(blob) {
  if (!blob) return '';
  const [ivB, tagB, dataB] = String(blob).split(':');
  const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, Buffer.from(ivB, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(dataB, 'base64')), decipher.final()]).toString('utf8');
}

// ── Store A connection settings (env-configured, never persisted) ─────────────
const STORE = {
  host: process.env.ASV_STORE_HOST || '127.0.0.1',
  port: clampInt(process.env.ASV_STORE_PORT, 3306, 1, 65535),
  user: process.env.ASV_STORE_USER || 'root',
  password: process.env.ASV_STORE_PASSWORD || '',
  database: process.env.ASV_STORE_DB || 'app_state_visualiser',
};

// A Store-A identifier is only ever an internal name we control, but quote-escape
// defensively before interpolating it into DDL (identifiers can't be bound).
function backtick(id) {
  return '`' + String(id).replace(/`/g, '``') + '`';
}

let storePool = null;
let ready = false;
let initError = null;

async function init() {
  try {
    // Connect without a database first so we can create Store A on a fresh box.
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

    await storePool.query(`
      CREATE TABLE IF NOT EXISTS db_connections (
        id            VARCHAR(36)  NOT NULL PRIMARY KEY,
        name          VARCHAR(190) NOT NULL UNIQUE,
        engine        VARCHAR(32)  NOT NULL DEFAULT 'mariadb',
        host          VARCHAR(255) NOT NULL,
        port          INT          NOT NULL DEFAULT 3306,
        database_name VARCHAR(190) NOT NULL,
        username      VARCHAR(190) NOT NULL,
        password_enc  TEXT,
        use_ssl       TINYINT(1)   NOT NULL DEFAULT 0,
        created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

    await storePool.query(`
      CREATE TABLE IF NOT EXISTS app_settings (
        k VARCHAR(64) NOT NULL PRIMARY KEY,
        v TEXT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

    ready = true;
    initError = null;
  } catch (err) {
    ready = false;
    initError = err.message;
    throw err;
  }
}

function status() {
  return { ready, error: initError, store: { host: STORE.host, port: STORE.port, database: STORE.database } };
}

function ensureReady() {
  if (!ready) {
    const e = new Error(initError ? `Store A unavailable: ${initError}` : 'Store A not initialised');
    e.status = 503;
    throw e;
  }
}

// ── Profile shape ─────────────────────────────────────────────────────────────
// The DTO intentionally omits password material; the client only learns whether
// a password is on file (hasPassword) so the edit form can leave it blank.
function rowToDto(r) {
  return {
    id: r.id,
    name: r.name,
    engine: r.engine,
    host: r.host,
    port: r.port,
    database: r.database_name,
    username: r.username,
    useSsl: !!r.use_ssl,
    hasPassword: !!r.password_enc,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function normalise(input) {
  const name = String(input?.name ?? '').trim();
  const host = String(input?.host ?? '').trim();
  const database = String(input?.database ?? '').trim();
  const username = String(input?.username ?? '').trim();
  if (!name) throw badRequest('name is required');
  if (!host) throw badRequest('host is required');
  if (!database) throw badRequest('database is required');
  if (!username) throw badRequest('username is required');
  return {
    name, host, database, username,
    port: clampInt(input?.port, 3306, 1, 65535),
    engine: 'mariadb',
    useSsl: !!input?.useSsl,
    password: input?.password == null ? '' : String(input.password),
  };
}

function badRequest(msg) {
  const e = new Error(msg);
  e.status = 400;
  return e;
}

async function listConnections() {
  ensureReady();
  const [rows] = await storePool.query('SELECT * FROM db_connections ORDER BY name');
  return rows.map(rowToDto);
}

async function getRow(id) {
  const [rows] = await storePool.query('SELECT * FROM db_connections WHERE id = ?', [id]);
  return rows[0] || null;
}

async function getConnection(id) {
  ensureReady();
  const row = await getRow(id);
  return row ? rowToDto(row) : null;
}

async function createConnection(input) {
  ensureReady();
  const c = normalise(input);
  const id = crypto.randomUUID();
  try {
    await storePool.query(
      `INSERT INTO db_connections (id, name, engine, host, port, database_name, username, password_enc, use_ssl)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, c.name, c.engine, c.host, c.port, c.database, c.username, encrypt(c.password), c.useSsl ? 1 : 0],
    );
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw badRequest(`A connection named "${c.name}" already exists`);
    throw err;
  }
  return getConnection(id);
}

async function updateConnection(id, input) {
  ensureReady();
  const existing = await getRow(id);
  if (!existing) return null;
  const c = normalise(input);
  // Blank password on an existing profile means "leave the stored one alone";
  // a non-empty value replaces it. There's no way to blank a password via the
  // API on purpose, which is the safer default for a credentials store.
  const passwordEnc = c.password === '' ? existing.password_enc : encrypt(c.password);
  try {
    await storePool.query(
      `UPDATE db_connections
         SET name = ?, engine = ?, host = ?, port = ?, database_name = ?, username = ?, password_enc = ?, use_ssl = ?
       WHERE id = ?`,
      [c.name, c.engine, c.host, c.port, c.database, c.username, passwordEnc, c.useSsl ? 1 : 0, id],
    );
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw badRequest(`A connection named "${c.name}" already exists`);
    throw err;
  }
  await invalidatePool(id);
  return getConnection(id);
}

async function deleteConnection(id) {
  ensureReady();
  const [res] = await storePool.query('DELETE FROM db_connections WHERE id = ?', [id]);
  await invalidatePool(id);
  const active = await getActiveId();
  if (active === id) await setActiveId(null);
  return res.affectedRows > 0;
}

// ── Active selection (which target the app currently retrieves from) ──────────
const ACTIVE_KEY = 'active_connection_id';

async function getActiveId() {
  ensureReady();
  const [rows] = await storePool.query('SELECT v FROM app_settings WHERE k = ?', [ACTIVE_KEY]);
  return rows.length ? rows[0].v : null;
}

async function setActiveId(id) {
  ensureReady();
  if (id) {
    const row = await getRow(id);
    if (!row) throw badRequest('connection not found');
  }
  await storePool.query(
    'INSERT INTO app_settings (k, v) VALUES (?, ?) ON DUPLICATE KEY UPDATE v = VALUES(v)',
    [ACTIVE_KEY, id ?? null],
  );
  return id ?? null;
}

// ── Target (B…Z) pools ────────────────────────────────────────────────────────
const targetPools = new Map(); // id -> mysql pool

function poolConfigFromRow(row) {
  return {
    host: row.host,
    port: row.port,
    user: row.username,
    password: decrypt(row.password_enc),
    database: row.database_name,
    ssl: row.use_ssl ? { rejectUnauthorized: false } : undefined,
    waitForConnections: true,
    connectionLimit: 3,
    connectTimeout: 8000,
  };
}

async function targetPool(id) {
  if (targetPools.has(id)) return targetPools.get(id);
  const row = await getRow(id);
  if (!row) throw badRequest('connection not found');
  const pool = mysql.createPool(poolConfigFromRow(row));
  targetPools.set(id, pool);
  return pool;
}

async function invalidatePool(id) {
  appSchemaReady.delete(id);
  const pool = targetPools.get(id);
  if (pool) {
    targetPools.delete(id);
    try { await pool.end(); } catch { /* already closing */ }
  }
}

// ── Connectivity test ─────────────────────────────────────────────────────────
async function testParams(input) {
  const c = normalise(input);
  let conn;
  try {
    conn = await mysql.createConnection({
      host: c.host, port: c.port, user: c.username, password: c.password,
      database: c.database, ssl: c.useSsl ? { rejectUnauthorized: false } : undefined,
      connectTimeout: 8000,
    });
    const [rows] = await conn.query('SELECT VERSION() AS version');
    return { ok: true, version: rows[0].version };
  } catch (err) {
    return { ok: false, error: err.message };
  } finally {
    if (conn) { try { await conn.end(); } catch { /* ignore */ } }
  }
}

async function testExisting(id) {
  ensureReady();
  const row = await getRow(id);
  if (!row) throw badRequest('connection not found');
  return testParams({
    name: row.name, host: row.host, port: row.port, database: row.database_name,
    username: row.username, password: decrypt(row.password_enc), useSsl: !!row.use_ssl,
  });
}

// ── State retrieval / browse ──────────────────────────────────────────────────
async function listTables(id) {
  ensureReady();
  const pool = await targetPool(id);
  const [rows] = await pool.query(
    `SELECT table_name AS name, table_rows AS approxRows
       FROM information_schema.tables
      WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE'
      ORDER BY table_name`);
  return rows.map(r => ({ name: r.name, approxRows: Number(r.approxRows ?? 0) }));
}

// Cells can be Buffers, Dates, or JSON objects. Flatten them to display-safe
// primitives so the preview serialises predictably and never dumps raw binary.
function cellForDisplay(v) {
  if (v == null) return null;
  if (Buffer.isBuffer(v)) return `0x${v.toString('hex').slice(0, 64)}`;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') return JSON.stringify(v);
  return v;
}

async function previewTable(id, table, limit) {
  ensureReady();
  // Whitelist the table name against the live catalogue — the only safe way to
  // put an identifier into a query, since identifiers can't be parameter-bound.
  const tables = await listTables(id);
  if (!tables.some(t => t.name === table)) throw badRequest(`unknown table: ${table}`);
  const lim = clampInt(limit, 50, 1, 500);
  const pool = await targetPool(id);
  const [rows, fields] = await pool.query(`SELECT * FROM ${backtick(table)} LIMIT ${lim}`);
  const columns = fields.map(f => f.name);
  const shaped = rows.map(row => {
    const out = {};
    for (const col of columns) out[col] = cellForDisplay(row[col]);
    return out;
  });
  return { table, columns, rows: shaped, limit: lim };
}

// ── Application data: Epics + Business Rules (in each target's own DB) ─────────
// Design decision: each registered application's OWN database holds that
// application's `epics` and `business_rules`. The viewer switches applications by
// switching the active connection; these endpoints are always scoped to a
// connection id and operate on that target's pool. Array/object BR fields are
// stored as JSON text and (de)serialised in this module so the shape survives a
// round-trip on both MariaDB (JSON == LONGTEXT) and MySQL.
const appSchemaReady = new Set(); // connection ids whose tables we've ensured

async function ensureAppSchema(pool) {
  // epics first — business_rules.epic_id references it.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS epics (
      id          VARCHAR(36)  NOT NULL PRIMARY KEY,
      epic_key    VARCHAR(64),
      title       VARCHAR(255) NOT NULL,
      description TEXT,
      seq         VARCHAR(64),
      created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_epic_key (epic_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS business_rules (
      creation_index    VARCHAR(36)  NOT NULL PRIMARY KEY,
      name              VARCHAR(190) NOT NULL,
      epic_id           VARCHAR(36),
      execution_order   INT,
      rule              TEXT         NOT NULL,
      rationale         TEXT,
      category          VARCHAR(32),
      features          LONGTEXT,
      modifies_features LONGTEXT,
      depends_on        LONGTEXT,
      touches           LONGTEXT,
      delta             LONGTEXT,
      needs_to_be_established TINYINT(1) NOT NULL DEFAULT 0,
      created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_br_name (name),
      KEY idx_br_epic (epic_id),
      CONSTRAINT fk_br_epic FOREIGN KEY (epic_id) REFERENCES epics(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  // Bring an existing business_rules table up to the current shape (id →
  // creation_index rename, seq → execution_order) before anything references it.
  await migrateBusinessRulesSchema(pool);

  // Extra, agent-facing context attached to a Business Rule. Each row references
  // one BR (by its creation_index) and carries a free-text description. During
  // development this is loaded into the developer agents once the BR under
  // development has reached (execution_order >=) the referenced BR — see
  // listAgentInfoUpToExecutionOrder. Created after the migration so its FK can
  // always reference business_rules(creation_index).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS br_additional_agent_information (
      id               VARCHAR(36) NOT NULL PRIMARY KEY,
      business_rule_id VARCHAR(36) NOT NULL,
      description      TEXT        NOT NULL,
      created_at       DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at       DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_agentinfo_br (business_rule_id),
      CONSTRAINT fk_agentinfo_br FOREIGN KEY (business_rule_id) REFERENCES business_rules(creation_index) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  // Free-form notes / ideas kept against the application. `related_brs` is an
  // OPTIONAL JSON array of BR references (free-form strings, not FKs), so a note
  // stays valid regardless of which BRs exist. Independent of epics/business_rules.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS notes (
      id          VARCHAR(36)  NOT NULL PRIMARY KEY,
      title       VARCHAR(255) NOT NULL,
      description LONGTEXT,
      related_brs LONGTEXT,
      created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  // Point-in-time snapshots of the whole Epic + Business Rule set. Each row is a
  // self-contained copy (the epics/rules DTO arrays frozen as JSON) so it stays
  // meaningful even after the live rules are reordered, edited or deleted — the
  // basis for the "diff against current" view. Independent of the live tables
  // (no FKs), so a snapshot survives deletion of the BRs it captured.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS br_snapshots (
      id          VARCHAR(36)  NOT NULL PRIMARY KEY,
      label       VARCHAR(255) NOT NULL,
      epics       LONGTEXT     NOT NULL,
      rules       LONGTEXT     NOT NULL,
      epic_count  INT          NOT NULL DEFAULT 0,
      rule_count  INT          NOT NULL DEFAULT 0,
      created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
}

// One-time, idempotent migration of an existing business_rules table to the
// current shape: the UUID primary key `id` becomes `creation_index` (values are
// preserved — still UUIDs), and the Dewey `seq` ordering string becomes an
// integer `execution_order`. A freshly-created table already has the new columns,
// so every branch below is a no-op there.
async function migrateBusinessRulesSchema(pool) {
  const hasColumn = async (table, col) => {
    const [[{ n }]] = await pool.query(
      `SELECT COUNT(*) AS n FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [table, col]);
    return n > 0;
  };

  // 1) id → creation_index. The agent-info FK references the old `id`, so drop it,
  //    rename the column, then re-point the FK at creation_index.
  if ((await hasColumn('business_rules', 'id')) && !(await hasColumn('business_rules', 'creation_index'))) {
    const [fks] = await pool.query(
      `SELECT CONSTRAINT_NAME AS name FROM information_schema.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'br_additional_agent_information'
          AND REFERENCED_TABLE_NAME = 'business_rules'`);
    for (const fk of fks) {
      await pool.query(`ALTER TABLE br_additional_agent_information DROP FOREIGN KEY ${backtick(fk.name)}`);
    }
    await pool.query('ALTER TABLE business_rules CHANGE COLUMN id creation_index VARCHAR(36) NOT NULL');
    if (fks.length) {
      await pool.query(
        `ALTER TABLE br_additional_agent_information
           ADD CONSTRAINT fk_agentinfo_br FOREIGN KEY (business_rule_id)
           REFERENCES business_rules(creation_index) ON DELETE CASCADE`);
    }
  }

  // 2) seq → execution_order. Add the integer column and backfill a global 1..N
  //    order from the prior seq (numeric-aware; nulls last), then drop seq.
  if (!(await hasColumn('business_rules', 'execution_order'))) {
    await pool.query('ALTER TABLE business_rules ADD COLUMN execution_order INT AFTER epic_id');
    const orderBy = (await hasColumn('business_rules', 'seq'))
      ? 'seq IS NULL, CAST(seq AS DECIMAL(20,6)), name'
      : 'name';
    await pool.query(
      `UPDATE business_rules b
         JOIN (
           SELECT creation_index, ROW_NUMBER() OVER (ORDER BY ${orderBy}) AS rn
             FROM business_rules
         ) o ON o.creation_index = b.creation_index
       SET b.execution_order = o.rn`);
  }
  if (await hasColumn('business_rules', 'seq')) {
    await pool.query('ALTER TABLE business_rules DROP COLUMN seq');
  }

  // 3) needs_to_be_established. A boolean flag set when a rule is handed to a
  //    Claude session to be built ("Submit with Claude"); absent on older tables.
  if (!(await hasColumn('business_rules', 'needs_to_be_established'))) {
    await pool.query('ALTER TABLE business_rules ADD COLUMN needs_to_be_established TINYINT(1) NOT NULL DEFAULT 0 AFTER delta');
  }
}

// Ensure the target database itself exists before we open a data pool to it.
// The epics/business_rules tables live in each application's OWN schema, so for a
// freshly-registered app (e.g. applicationstatemanager) we create the schema on
// first touch, mirroring how Store A provisions its own database on startup.
async function ensureTargetDatabase(row) {
  const admin = await mysql.createConnection({
    host: row.host, port: row.port, user: row.username, password: decrypt(row.password_enc),
    ssl: row.use_ssl ? { rejectUnauthorized: false } : undefined, connectTimeout: 8000,
  });
  try {
    await admin.query(`CREATE DATABASE IF NOT EXISTS ${backtick(row.database_name)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  } finally {
    try { await admin.end(); } catch { /* ignore */ }
  }
}

// Open (and lazily provision) the target's pool for application-data work.
async function appPool(id) {
  if (!appSchemaReady.has(id)) {
    const row = await getRow(id);
    if (!row) throw badRequest('connection not found');
    await ensureTargetDatabase(row);
  }
  const pool = await targetPool(id);
  if (!appSchemaReady.has(id)) {
    await ensureAppSchema(pool);
    appSchemaReady.add(id);
  }
  return pool;
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

async function listEpics(id) {
  ensureReady();
  const pool = await appPool(id);
  const [rows] = await pool.query('SELECT * FROM epics ORDER BY seq IS NULL, seq, title');
  return rows.map(epicRowToDto);
}

async function createEpic(id, input) {
  ensureReady();
  const pool = await appPool(id);
  const e = normaliseEpic(input);
  const epicId = crypto.randomUUID();
  try {
    await pool.query(
      'INSERT INTO epics (id, epic_key, title, description, seq) VALUES (?, ?, ?, ?, ?)',
      [epicId, e.key, e.title, e.description, e.seq],
    );
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw badRequest(`An epic with key "${e.key}" already exists`);
    throw err;
  }
  const [rows] = await pool.query('SELECT * FROM epics WHERE id = ?', [epicId]);
  return epicRowToDto(rows[0]);
}

async function updateEpic(id, epicId, input) {
  ensureReady();
  const pool = await appPool(id);
  const e = normaliseEpic(input);
  const [res] = await pool.query(
    'UPDATE epics SET epic_key = ?, title = ?, description = ?, seq = ? WHERE id = ?',
    [e.key, e.title, e.description, e.seq, epicId],
  ).catch(err => {
    if (err.code === 'ER_DUP_ENTRY') throw badRequest(`An epic with key "${e.key}" already exists`);
    throw err;
  });
  if (res.affectedRows === 0) return null;
  const [rows] = await pool.query('SELECT * FROM epics WHERE id = ?', [epicId]);
  return epicRowToDto(rows[0]);
}

async function deleteEpic(id, epicId) {
  ensureReady();
  const pool = await appPool(id);
  // FK is ON DELETE SET NULL, so member BRs survive un-grouped.
  const [res] = await pool.query('DELETE FROM epics WHERE id = ?', [epicId]);
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

async function listNotes(id) {
  ensureReady();
  const pool = await appPool(id);
  const [rows] = await pool.query('SELECT * FROM notes ORDER BY updated_at DESC, title');
  return rows.map(noteRowToDto);
}

async function createNote(id, input) {
  ensureReady();
  const pool = await appPool(id);
  const n = normaliseNote(input);
  const noteId = crypto.randomUUID();
  await pool.query(
    'INSERT INTO notes (id, title, description, related_brs) VALUES (?, ?, ?, ?)',
    [noteId, n.title, n.description, toJsonText(n.relatedBrs)],
  );
  const [rows] = await pool.query('SELECT * FROM notes WHERE id = ?', [noteId]);
  return noteRowToDto(rows[0]);
}

async function updateNote(id, noteId, input) {
  ensureReady();
  const pool = await appPool(id);
  const n = normaliseNote(input);
  const [res] = await pool.query(
    'UPDATE notes SET title = ?, description = ?, related_brs = ? WHERE id = ?',
    [n.title, n.description, toJsonText(n.relatedBrs), noteId],
  );
  if (res.affectedRows === 0) return null;
  const [rows] = await pool.query('SELECT * FROM notes WHERE id = ?', [noteId]);
  return noteRowToDto(rows[0]);
}

async function deleteNote(id, noteId) {
  ensureReady();
  const pool = await appPool(id);
  const [res] = await pool.query('DELETE FROM notes WHERE id = ?', [noteId]);
  return res.affectedRows > 0;
}

// ── Business rules ────────────────────────────────────────────────────────────
function brRowToDto(r) {
  return {
    creationIndex: r.creation_index,
    name: r.name,
    epicId: r.epic_id ?? null,
    executionOrder: r.execution_order ?? null,
    rule: r.rule,
    rationale: r.rationale ?? null,
    category: r.category ?? null,
    features: fromJsonText(r.features, []),
    modifiesFeatures: fromJsonText(r.modifies_features, []),
    dependsOn: fromJsonText(r.depends_on, []),
    touches: fromJsonText(r.touches, {}),
    delta: fromJsonText(r.delta, {}),
    needsToBeEstablished: !!r.needs_to_be_established,
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
  const execRaw = input?.executionOrder;
  const executionOrder = execRaw == null || execRaw === '' || !Number.isFinite(Number(execRaw))
    ? null
    : Math.trunc(Number(execRaw));
  return {
    name, rule,
    epicId: input?.epicId ? String(input.epicId) : null,
    executionOrder,
    rationale: input?.rationale == null ? null : String(input.rationale),
    category: input?.category ? String(input.category) : null,
    features: strArr(input?.features),
    modifiesFeatures: strArr(input?.modifiesFeatures),
    dependsOn: strArr(input?.dependsOn),
    touches: input?.touches && typeof input.touches === 'object' ? input.touches : {},
    delta: input?.delta && typeof input.delta === 'object' ? input.delta : {},
    needsToBeEstablished: input?.needsToBeEstablished === true || input?.needsToBeEstablished === 1,
  };
}

async function listBusinessRules(id) {
  ensureReady();
  const pool = await appPool(id);
  const [rows] = await pool.query('SELECT * FROM business_rules ORDER BY execution_order IS NULL, execution_order, name');
  return rows.map(brRowToDto);
}

async function getBrRow(pool, brId) {
  const [rows] = await pool.query('SELECT * FROM business_rules WHERE creation_index = ?', [brId]);
  return rows[0] || null;
}

async function createBusinessRule(id, input) {
  ensureReady();
  const pool = await appPool(id);
  const b = normaliseBr(input);
  const brId = crypto.randomUUID();
  // execution_order is global; default a new rule to the end of the list.
  let executionOrder = b.executionOrder;
  if (executionOrder == null) {
    const [[{ next }]] = await pool.query('SELECT COALESCE(MAX(execution_order), 0) + 1 AS next FROM business_rules');
    executionOrder = next;
  }
  try {
    await pool.query(
      `INSERT INTO business_rules
         (creation_index, name, epic_id, execution_order, rule, rationale, category, features, modifies_features, depends_on, touches, delta, needs_to_be_established)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [brId, b.name, b.epicId, executionOrder, b.rule, b.rationale, b.category,
        toJsonText(b.features), toJsonText(b.modifiesFeatures), toJsonText(b.dependsOn),
        toJsonText(b.touches), toJsonText(b.delta), b.needsToBeEstablished ? 1 : 0],
    );
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw badRequest(`A business rule named "${b.name}" already exists`);
    if (err.code === 'ER_NO_REFERENCED_ROW_2' || err.code === 'ER_NO_REFERENCED_ROW') throw badRequest('epicId does not match an existing epic');
    throw err;
  }
  return brRowToDto(await getBrRow(pool, brId));
}

async function updateBusinessRule(id, brId, input) {
  ensureReady();
  const pool = await appPool(id);
  const b = normaliseBr(input);
  let res;
  try {
    [res] = await pool.query(
      `UPDATE business_rules SET
         name = ?, epic_id = ?, execution_order = ?, rule = ?, rationale = ?, category = ?,
         features = ?, modifies_features = ?, depends_on = ?, touches = ?, delta = ?, needs_to_be_established = ?
       WHERE creation_index = ?`,
      [b.name, b.epicId, b.executionOrder, b.rule, b.rationale, b.category,
        toJsonText(b.features), toJsonText(b.modifiesFeatures), toJsonText(b.dependsOn),
        toJsonText(b.touches), toJsonText(b.delta), b.needsToBeEstablished ? 1 : 0, brId],
    );
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw badRequest(`A business rule named "${b.name}" already exists`);
    if (err.code === 'ER_NO_REFERENCED_ROW_2' || err.code === 'ER_NO_REFERENCED_ROW') throw badRequest('epicId does not match an existing epic');
    throw err;
  }
  if (res.affectedRows === 0) return null;
  return brRowToDto(await getBrRow(pool, brId));
}

async function deleteBusinessRule(id, brId) {
  ensureReady();
  const pool = await appPool(id);
  const [res] = await pool.query('DELETE FROM business_rules WHERE creation_index = ?', [brId]);
  return res.affectedRows > 0;
}

// ── Additional agent information (extra context attached to a Business Rule) ───
// Numeric compare for execution_order: nulls sort last. Mirrors the ordering the
// BRs use elsewhere so "execution_order >= referenced order" means "development
// has reached this BR".
function executionOrderCompare(a, b) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return Number(a) - Number(b);
}

function agentInfoRowToDto(r) {
  return {
    id: r.id,
    businessRuleId: r.business_rule_id,
    description: r.description,
    brName: r.br_name ?? null,
    brExecutionOrder: r.br_execution_order ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// Every read joins the BR so callers get the referenced rule's name + execution order.
const AGENT_INFO_SELECT = `
  SELECT ai.*, br.name AS br_name, br.execution_order AS br_execution_order
    FROM br_additional_agent_information ai
    JOIN business_rules br ON br.creation_index = ai.business_rule_id`;

async function listAgentInfo(id) {
  ensureReady();
  const pool = await appPool(id);
  const [rows] = await pool.query(`${AGENT_INFO_SELECT} ORDER BY br.execution_order IS NULL, br.execution_order, ai.created_at`);
  return rows.map(agentInfoRowToDto);
}

function normaliseAgentInfo(input) {
  const businessRuleId = String(input?.businessRuleId ?? '').trim();
  const description = String(input?.description ?? '').trim();
  if (!businessRuleId) throw badRequest('businessRuleId is required');
  if (!description) throw badRequest('description is required');
  return { businessRuleId, description };
}

async function createAgentInfo(id, input) {
  ensureReady();
  const pool = await appPool(id);
  const a = normaliseAgentInfo(input);
  const infoId = crypto.randomUUID();
  try {
    await pool.query(
      'INSERT INTO br_additional_agent_information (id, business_rule_id, description) VALUES (?, ?, ?)',
      [infoId, a.businessRuleId, a.description],
    );
  } catch (err) {
    if (err.code === 'ER_NO_REFERENCED_ROW_2' || err.code === 'ER_NO_REFERENCED_ROW') throw badRequest('businessRuleId does not match an existing Business Rule');
    throw err;
  }
  const [rows] = await pool.query(`${AGENT_INFO_SELECT} WHERE ai.id = ?`, [infoId]);
  return agentInfoRowToDto(rows[0]);
}

async function updateAgentInfo(id, infoId, input) {
  ensureReady();
  const pool = await appPool(id);
  const a = normaliseAgentInfo(input);
  let res;
  try {
    [res] = await pool.query(
      'UPDATE br_additional_agent_information SET business_rule_id = ?, description = ? WHERE id = ?',
      [a.businessRuleId, a.description, infoId],
    );
  } catch (err) {
    if (err.code === 'ER_NO_REFERENCED_ROW_2' || err.code === 'ER_NO_REFERENCED_ROW') throw badRequest('businessRuleId does not match an existing Business Rule');
    throw err;
  }
  if (res.affectedRows === 0) return null;
  const [rows] = await pool.query(`${AGENT_INFO_SELECT} WHERE ai.id = ?`, [infoId]);
  return agentInfoRowToDto(rows[0]);
}

async function deleteAgentInfo(id, infoId) {
  ensureReady();
  const pool = await appPool(id);
  const [res] = await pool.query('DELETE FROM br_additional_agent_information WHERE id = ?', [infoId]);
  return res.affectedRows > 0;
}

// The develop-time query: every agent-info entry whose referenced BR has already
// been reached by development, i.e. referenced BR execution_order <= the order
// under development.
async function listAgentInfoUpToExecutionOrder(id, executionOrder) {
  const all = await listAgentInfo(id);
  return all.filter((a) => executionOrderCompare(a.brExecutionOrder, executionOrder) <= 0);
}

// ── BR snapshots (point-in-time copies of the whole Epic + BR set) ────────────
// A snapshot freezes the current epics and business rules as JSON so it can be
// diffed against the live set later. The list view returns only metadata (never
// the heavy JSON bodies); the detail read parses them back into DTO arrays.
function snapshotMetaRowToDto(r) {
  return {
    id: r.id,
    label: r.label,
    epicCount: r.epic_count,
    ruleCount: r.rule_count,
    createdAt: r.created_at,
  };
}

async function listSnapshots(id) {
  ensureReady();
  const pool = await appPool(id);
  const [rows] = await pool.query(
    'SELECT id, label, epic_count, rule_count, created_at FROM br_snapshots ORDER BY created_at DESC, id');
  return rows.map(snapshotMetaRowToDto);
}

async function getSnapshot(id, snapId) {
  ensureReady();
  const pool = await appPool(id);
  const [rows] = await pool.query('SELECT * FROM br_snapshots WHERE id = ?', [snapId]);
  const r = rows[0];
  if (!r) return null;
  return {
    ...snapshotMetaRowToDto(r),
    epics: fromJsonText(r.epics, []),
    rules: fromJsonText(r.rules, []),
  };
}

// Capture the CURRENT epics + business rules as a new snapshot. The label is the
// only caller-supplied field; everything else is read live from the DB so a
// snapshot always reflects the true state at capture time.
async function createSnapshot(id, input) {
  ensureReady();
  const pool = await appPool(id);
  const label = String(input?.label ?? '').trim() || 'Snapshot';
  const epics = await listEpics(id);
  const rules = await listBusinessRules(id);
  const snapId = crypto.randomUUID();
  await pool.query(
    'INSERT INTO br_snapshots (id, label, epics, rules, epic_count, rule_count) VALUES (?, ?, ?, ?, ?, ?)',
    [snapId, label, toJsonText(epics), toJsonText(rules), epics.length, rules.length],
  );
  return getSnapshot(id, snapId);
}

async function deleteSnapshot(id, snapId) {
  ensureReady();
  const pool = await appPool(id);
  const [res] = await pool.query('DELETE FROM br_snapshots WHERE id = ?', [snapId]);
  return res.affectedRows > 0;
}

module.exports = {
  init, status,
  listConnections, getConnection, createConnection, updateConnection, deleteConnection,
  getActiveId, setActiveId,
  testParams, testExisting,
  listTables, previewTable,
  listEpics, createEpic, updateEpic, deleteEpic,
  listNotes, createNote, updateNote, deleteNote,
  listBusinessRules, createBusinessRule, updateBusinessRule, deleteBusinessRule,
  listAgentInfo, createAgentInfo, updateAgentInfo, deleteAgentInfo, listAgentInfoUpToExecutionOrder,
  listSnapshots, getSnapshot, createSnapshot, deleteSnapshot,
};
