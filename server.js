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
