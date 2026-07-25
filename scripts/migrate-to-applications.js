#!/usr/bin/env node
// ── One-time migration: per-app databases → single store with applications ─────
//
// The old model kept a `db_connections` registry in Store A and stored each
// registered application's epics/business_rules/notes/agent-info in that
// application's OWN separate database. The new model keeps everything in the one
// store DB (app_state_visualiser), with every row scoped by `application_id`.
//
// This script, run once, turns each old connection into an `applications` row and
// copies that target DB's state into the store tables under the new id. It is
// idempotent at the application level: a connection whose name already exists as
// an application is skipped, so a partial run can be re-run safely.
//
// It reads the old `db_connections` table and `.db-secret.key` directly — those
// artifacts are intentionally left in place until you have verified the result.
// After verifying, drop the `db_connections` table and delete `.db-secret.key`.
//
//   node scripts/migrate-to-applications.js
//
// Honours the same ASV_STORE_* / ASV_SECRET_KEY env vars as the server.
const mysql = require('mysql2/promise');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const dbStore = require('../db-store');

function clampInt(value, fallback, min, max) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

const STORE = {
  host: process.env.ASV_STORE_HOST || '127.0.0.1',
  port: clampInt(process.env.ASV_STORE_PORT, 3306, 1, 65535),
  user: process.env.ASV_STORE_USER || 'root',
  password: process.env.ASV_STORE_PASSWORD || '',
  database: process.env.ASV_STORE_DB || 'app_state_visualiser',
};

// Mirror of db-store's AES-256-GCM decrypt so we can reach the old targets.
const KEY_FILE = path.resolve(__dirname, '..', '.db-secret.key');
function loadKey() {
  const env = process.env.ASV_SECRET_KEY;
  if (env) {
    const buf = Buffer.from(env, /^[0-9a-fA-F]{64}$/.test(env) ? 'hex' : 'base64');
    if (buf.length !== 32) throw new Error('ASV_SECRET_KEY must decode to exactly 32 bytes');
    return buf;
  }
  const saved = fs.readFileSync(KEY_FILE);
  if (saved.length !== 32) throw new Error('.db-secret.key is not a 32-byte key');
  return saved;
}
function decrypt(key, blob) {
  if (!blob) return '';
  const [ivB, tagB, dataB] = String(blob).split(':');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(dataB, 'base64')), decipher.final()]).toString('utf8');
}

// Read every row of `table` from the target pool; missing table → empty (a
// connection may have been registered but never provisioned).
async function readAll(pool, table) {
  try {
    const [rows] = await pool.query(`SELECT * FROM \`${table}\``);
    return rows;
  } catch (err) {
    if (err.code === 'ER_NO_SUCH_TABLE') return [];
    throw err;
  }
}

// Business Rules use `creation_index` as their identity and the integer
// `execution_order` for position. An even older schema line keyed them by `id`
// with a Dewey `seq` string; normalise either source shape to the current one so
// both migrate cleanly. `execution_order` is backfilled from a numeric `seq` when
// only the old ordering is present (nulls stay null → sorted to the end).
function normaliseBrRow(r) {
  const seqNum = r.seq == null || !Number.isFinite(Number(r.seq)) ? null : Math.trunc(Number(r.seq));
  return {
    creation_index: r.creation_index ?? r.id,
    name: r.name,
    epic_id: r.epic_id ?? null,
    execution_order: r.execution_order ?? seqNum,
    rule: r.rule,
    rationale: r.rationale ?? null,
    category: r.category ?? null,
    features: r.features ?? null,
    modifies_features: r.modifies_features ?? null,
    depends_on: r.depends_on ?? null,
    touches: r.touches ?? null,
    delta: r.delta ?? null,
    needs_to_be_established: r.needs_to_be_established ?? 0,
    created_at: r.created_at ?? null,
    updated_at: r.updated_at ?? null,
  };
}

async function main() {
  const key = loadKey();

  // Ensure the new schema exists (applications + the four data tables).
  await dbStore.init();

  const store = mysql.createPool({
    host: STORE.host, port: STORE.port, user: STORE.user, password: STORE.password,
    database: STORE.database, waitForConnections: true, connectionLimit: 5, connectTimeout: 8000,
  });

  let connections;
  try {
    [connections] = await store.query('SELECT * FROM db_connections ORDER BY name');
  } catch (err) {
    if (err.code === 'ER_NO_SUCH_TABLE') {
      console.log('No db_connections table found — nothing to migrate.');
      await store.end();
      return;
    }
    throw err;
  }

  console.log(`Found ${connections.length} connection(s) to migrate.\n`);

  for (const conn of connections) {
    // Skip if an application with this name already exists (idempotent re-run).
    const [[existing]] = await store.query('SELECT id FROM applications WHERE name = ?', [conn.name]);
    if (existing) {
      console.log(`• ${conn.name}: application already exists (${existing.id}) — skipping.`);
      continue;
    }

    // One transaction per application on a dedicated connection: a target that
    // fails mid-copy rolls back cleanly (no orphan application/epics) so the whole
    // script can be re-run.
    const link = await store.getConnection();
    let target;
    try {
      const appId = crypto.randomUUID();
      target = mysql.createPool({
        host: conn.host, port: conn.port, user: conn.username,
        password: decrypt(key, conn.password_enc), database: conn.database_name,
        ssl: conn.use_ssl ? { rejectUnauthorized: false } : undefined,
        waitForConnections: true, connectionLimit: 3, connectTimeout: 8000,
      });

      const epics = await readAll(target, 'epics');
      const rules = (await readAll(target, 'business_rules')).map(normaliseBrRow);
      const agentInfo = await readAll(target, 'br_additional_agent_information');
      const notes = await readAll(target, 'notes');

      await link.beginTransaction();
      await link.query(
        'INSERT INTO applications (id, name, description, root_dir) VALUES (?, ?, ?, ?)',
        [appId, conn.name, null, null],
      );
      // epics first (BRs reference them), then BRs, then agent-info (references BRs).
      for (const e of epics) {
        await link.query(
          `INSERT INTO epics (id, application_id, epic_key, title, description, seq, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [e.id, appId, e.epic_key, e.title, e.description, e.seq, e.created_at, e.updated_at],
        );
      }
      for (const b of rules) {
        await link.query(
          `INSERT INTO business_rules
             (creation_index, application_id, name, epic_id, execution_order, rule, rationale, category,
              features, modifies_features, depends_on, touches, delta, needs_to_be_established, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [b.creation_index, appId, b.name, b.epic_id, b.execution_order, b.rule, b.rationale, b.category,
            b.features, b.modifies_features, b.depends_on, b.touches, b.delta, b.needs_to_be_established, b.created_at, b.updated_at],
        );
      }
      for (const a of agentInfo) {
        await link.query(
          `INSERT INTO br_additional_agent_information
             (id, application_id, business_rule_id, description, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [a.id, appId, a.business_rule_id, a.description, a.created_at, a.updated_at],
        );
      }
      for (const n of notes) {
        await link.query(
          `INSERT INTO notes (id, application_id, title, description, related_brs, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [n.id, appId, n.title, n.description, n.related_brs, n.created_at, n.updated_at],
        );
      }
      await link.commit();

      console.log(`• ${conn.name} → application ${appId}`);
      console.log(`    epics: ${epics.length}, business rules: ${rules.length}, agent-info: ${agentInfo.length}, notes: ${notes.length}`);
    } catch (err) {
      try { await link.rollback(); } catch { /* ignore */ }
      console.error(`• ${conn.name}: FAILED — ${err.message} (rolled back, skipped)`);
    } finally {
      link.release();
      if (target) { try { await target.end(); } catch { /* ignore */ } }
    }
  }

  console.log('\nMigration complete. Verify counts above, then drop the db_connections');
  console.log('table and delete .db-secret.key when you are satisfied.');
  await store.end();
}

main().then(() => process.exit(0)).catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
