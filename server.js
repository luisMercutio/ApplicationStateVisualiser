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

app.listen(PORT, () => console.log(`UC Arch Viewer server on http://localhost:${PORT}`));
