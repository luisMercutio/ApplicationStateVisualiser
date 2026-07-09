// ── Methodology files (agents + commands) — the FILESYSTEM is the source of truth ──
// Agent and slash-command definitions live under this repo's .claude/ directory,
// which is exactly where Claude Code auto-discovers them. So the files on disk ARE
// the source of truth: we read, write, create, delete and rename them directly,
// with no database copy to seed, sync or drift out of date. Everything here is
// pure filesystem I/O and does not depend on MariaDB being up.
const fs = require('fs').promises;
const path = require('path');

// .claude/ lives next to this module (override with CLAUDE_DIR for tests/deploys).
const CLAUDE_DIR = path.resolve(__dirname, process.env.CLAUDE_DIR || '.claude');
const KINDS = { agent: 'agents', command: 'commands' }; // kind -> .claude subdirectory

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function subdirFor(kind) {
  const sub = KINDS[kind];
  if (!sub) throw httpError(400, `unknown methodology kind: ${kind}`);
  return sub;
}

// Names are single path segments ending in .md — no directories, no traversal.
function assertName(name) {
  const n = String(name || '');
  if (!/^[A-Za-z0-9._-]+\.md$/.test(n) || n.includes('..')) {
    throw httpError(400, 'file name must match [A-Za-z0-9._-]+.md');
  }
  return n;
}

// Resolve <kind>/<name> to an absolute path, guarding against escaping the dir.
function resolvePath(kind, name) {
  const dir = path.join(CLAUDE_DIR, subdirFor(kind));
  const full = path.join(dir, assertName(name));
  if (full !== dir + path.sep + path.basename(full)) {
    throw httpError(400, 'invalid file path');
  }
  return { dir, full };
}

async function listMethodologyFiles() {
  const out = [];
  for (const [kind, sub] of Object.entries(KINDS)) {
    let entries;
    try {
      entries = await fs.readdir(path.join(CLAUDE_DIR, sub), { withFileTypes: true });
    } catch {
      continue; // subdir may not exist yet
    }
    for (const ent of entries) {
      if (!ent.isFile() || !ent.name.endsWith('.md')) continue;
      let updatedAt = null;
      try {
        updatedAt = (await fs.stat(path.join(CLAUDE_DIR, sub, ent.name))).mtime.toISOString();
      } catch { /* leave null */ }
      out.push({ kind, name: ent.name, updatedAt });
    }
  }
  out.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind.localeCompare(b.kind)));
  return out;
}

async function getMethodologyFile(kind, name) {
  const { full } = resolvePath(kind, name);
  let content, stat;
  try {
    content = await fs.readFile(full, 'utf8');
    stat = await fs.stat(full);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
  return { kind, name, content, updatedAt: stat.mtime.toISOString() };
}

// Create or replace a file (PUT semantics). The subdir is created if missing.
async function saveMethodologyFile(kind, name, content) {
  if (typeof content !== 'string') throw httpError(400, 'content (string) required');
  const { dir, full } = resolvePath(kind, name);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(full, content, 'utf8');
  return getMethodologyFile(kind, name);
}

async function deleteMethodologyFile(kind, name) {
  const { full } = resolvePath(kind, name);
  try {
    await fs.unlink(full);
  } catch (err) {
    if (err.code === 'ENOENT') throw httpError(404, 'file not found');
    throw err;
  }
  return { kind, name, deleted: true };
}

// Rename within the same kind; refuses to clobber an existing target.
async function renameMethodologyFile(kind, name, newName) {
  const { full: from } = resolvePath(kind, name);
  const { full: to } = resolvePath(kind, newName);
  if (from === to) return getMethodologyFile(kind, newName);
  try {
    await fs.access(to);
    throw httpError(409, `a ${kind} named "${newName}" already exists`);
  } catch (err) {
    if (err.status === 409) throw err;
    if (err.code !== 'ENOENT') throw err; // target free → proceed
  }
  try {
    await fs.rename(from, to);
  } catch (err) {
    if (err.code === 'ENOENT') throw httpError(404, 'file not found');
    throw err;
  }
  return getMethodologyFile(kind, newName);
}

module.exports = {
  listMethodologyFiles,
  getMethodologyFile,
  saveMethodologyFile,
  deleteMethodologyFile,
  renameMethodologyFile,
};
