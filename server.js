const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

function getArchBase(root) {
  return path.resolve(root, '.claude', 'architecture');
}

function safePath(root, filePath) {
  const base = getArchBase(root);
  const resolved = path.resolve(base, filePath);
  if (!resolved.startsWith(base + path.sep) && resolved !== base) {
    throw new Error('Invalid path');
  }
  return resolved;
}

async function buildTree(dir, rel) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const items = [];
  for (const e of entries) {
    const relPath = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) {
      const children = await buildTree(path.join(dir, e.name), relPath);
      items.push({ name: e.name, path: relPath, type: 'directory', children });
    } else {
      items.push({ name: e.name, path: relPath, type: 'file' });
    }
  }
  return items;
}

app.get('/api/tree', async (req, res) => {
  const { root } = req.query;
  if (!root) return res.status(400).json({ error: 'root required' });
  try {
    const base = getArchBase(root);
    const tree = await buildTree(base, '');
    res.json({ tree });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/file', async (req, res) => {
  const { root, path: filePath } = req.query;
  if (!root || !filePath) return res.status(400).json({ error: 'root and path required' });
  try {
    const abs = safePath(root, filePath);
    const content = await fs.readFile(abs, 'utf-8');
    res.type('text/plain').send(content);
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

app.put('/api/file', async (req, res) => {
  const { root, path: filePath } = req.query;
  const { content } = req.body || {};
  if (!root || !filePath) return res.status(400).json({ error: 'root and path required' });
  if (typeof content !== 'string') return res.status(400).json({ error: 'content (string) required' });
  try {
    const abs = safePath(root, filePath);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, content, 'utf-8');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/mockup', async (req, res) => {
  const { root, path: filePath } = req.query;
  if (!root || !filePath) return res.status(400).json({ error: 'root and path required' });
  try {
    const abs = safePath(root, filePath);
    const content = await fs.readFile(abs, 'utf-8');
    res.type('text/html').send(content);
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

app.get('/api/ping', (_req, res) => res.json({ ok: true }));

app.get('/api/config', (_req, res) => {
  res.json({ standardUrl: process.env.STANDARD_URL || null });
});

// ── BR positions (app-owned layout for the Business Rule graph) ───────────────
// Stored next to the architecture data so it travels with the target project,
// but written/owned by the viewer so /uc-generate never clobbers it.

app.get('/api/br-positions', async (req, res) => {
  const { root } = req.query;
  if (!root) return res.status(400).json({ error: 'root required' });
  try {
    const abs = safePath(root, 'br-positions.json');
    const content = await fs.readFile(abs, 'utf-8');
    res.json(JSON.parse(content));
  } catch {
    res.json({}); // no positions yet
  }
});

app.put('/api/br-positions', async (req, res) => {
  const { root } = req.query;
  if (!root) return res.status(400).json({ error: 'root required' });
  try {
    const abs = safePath(root, 'br-positions.json');
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, JSON.stringify(req.body ?? {}, null, 2), 'utf-8');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Resources (this repo's own methodology files: agents, commands, schemas) ──
// A separate base from the target project; edited in-app and synced to project B.

function resourcesBase() {
  return path.resolve(__dirname, 'resources');
}

function safeResourcePath(filePath) {
  const base = resourcesBase();
  const resolved = path.resolve(base, filePath);
  if (!resolved.startsWith(base + path.sep) && resolved !== base) {
    throw new Error('Invalid path');
  }
  return resolved;
}

async function copyDir(src, dest, rel = '') {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  const out = [];
  for (const e of entries) {
    const s = path.join(src, e.name);
    const d = path.join(dest, e.name);
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...await copyDir(s, d, r));
    else { await fs.copyFile(s, d); out.push(r); }
  }
  return out;
}

// Push the methodology (agents + commands) into a target project's .claude/.
app.post('/api/sync-methodology', async (req, res) => {
  const { target } = req.body || {};
  if (!target) return res.status(400).json({ error: 'target required' });
  try {
    const stat = await fs.stat(target);
    if (!stat.isDirectory()) return res.status(400).json({ error: 'target is not a directory' });
    const claudeDir = path.resolve(target, '.claude');
    const copied = [];
    for (const sub of ['agents', 'commands']) {
      copied.push(...await copyDir(path.join(resourcesBase(), sub), path.join(claudeDir, sub), sub));
    }
    res.json({ ok: true, target, count: copied.length, copied });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/resources/tree', async (_req, res) => {
  try {
    const tree = await buildTree(resourcesBase(), '');
    res.json({ tree });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/resources/file', async (req, res) => {
  const { path: filePath } = req.query;
  if (!filePath) return res.status(400).json({ error: 'path required' });
  try {
    const abs = safeResourcePath(filePath);
    const content = await fs.readFile(abs, 'utf-8');
    res.type('text/plain').send(content);
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

app.put('/api/resources/file', async (req, res) => {
  const { path: filePath } = req.query;
  const { content } = req.body || {};
  if (!filePath) return res.status(400).json({ error: 'path required' });
  if (typeof content !== 'string') return res.status(400).json({ error: 'content (string) required' });
  try {
    const abs = safeResourcePath(filePath);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, content, 'utf-8');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Layouts ──────────────────────────────────────────────────────────────────

function layoutsBase() {
  return path.resolve(__dirname, 'layouts');
}

function safeLayoutPath(name) {
  if (!/^[a-zA-Z0-9 _-]+$/.test(name)) throw new Error('Invalid layout name');
  return path.resolve(layoutsBase(), `${name}.json`);
}

app.get('/api/layouts', async (_req, res) => {
  try {
    const base = layoutsBase();
    let entries;
    try { entries = await fs.readdir(base); } catch { return res.json({ names: [] }); }
    const names = entries.filter(f => f.endsWith('.json')).map(f => f.slice(0, -5)).sort();
    res.json({ names });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/layouts/:name', async (req, res) => {
  const { name } = req.params;
  try {
    const abs = safeLayoutPath(name);
    const content = await fs.readFile(abs, 'utf-8');
    res.json(JSON.parse(content));
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

app.put('/api/layouts/:name', async (req, res) => {
  const { name } = req.params;
  try {
    const abs = safeLayoutPath(name);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, JSON.stringify(req.body, null, 2), 'utf-8');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/layouts/:name', async (req, res) => {
  const { name } = req.params;
  try {
    const abs = safeLayoutPath(name);
    await fs.unlink(abs);
    res.json({ ok: true });
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

app.listen(PORT, () => console.log(`UC Arch Viewer server on http://localhost:${PORT}`));
