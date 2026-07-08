const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const http = require('http');
const { execFile } = require('child_process');
const { WebSocketServer } = require('ws');
const pty = require('node-pty');

const app = express();
const PORT = process.env.PORT || 3001;

// ── WSL / tmux terminal bridge config ─────────────────────────────────────────
// The viewer runs on Windows; the tmux session lives inside WSL. We shell into it
// with `wsl.exe -d <distro> -- tmux ...`. Both are overridable via env.
const WSL_DISTRO = process.env.WSL_DISTRO || 'Debian';
const DEFAULT_TMUX_SESSION = process.env.TMUX_SESSION || 'applicationStateVisualiser';
// tmux session names we allow attaching to. Args are passed to wsl.exe as an
// array (no shell), so this mainly guards against surprising names, not injection.
const SESSION_RE = /^[A-Za-z0-9_.-]+$/;

function clampInt(value, fallback, min, max) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

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

// BR-first rule index (.claude/rules/_index.json) — the fold input for composed views.
app.get('/api/rules', async (req, res) => {
  const { root } = req.query;
  if (!root) return res.status(400).json({ error: 'root required' });
  try {
    const abs = path.resolve(root, '.claude', 'rules', '_index.json');
    const content = await fs.readFile(abs, 'utf-8');
    res.json(JSON.parse(content));
  } catch {
    res.json([]); // no rules extracted yet
  }
});

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

// ── BR display order (app-owned, drag-to-reorder list) ────────────────────────
// An array of rule names in the user's chosen order. Same ownership rules as
// br-positions: stored with the target project, written only by the viewer.
app.get('/api/br-order', async (req, res) => {
  const { root } = req.query;
  if (!root) return res.status(400).json({ error: 'root required' });
  try {
    const abs = safePath(root, 'br-order.json');
    const content = await fs.readFile(abs, 'utf-8');
    res.json(JSON.parse(content));
  } catch {
    res.json([]); // no custom order yet
  }
});

app.put('/api/br-order', async (req, res) => {
  const { root } = req.query;
  if (!root) return res.status(400).json({ error: 'root required' });
  if (!Array.isArray(req.body)) return res.status(400).json({ error: 'body must be an array of rule names' });
  try {
    const abs = safePath(root, 'br-order.json');
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, JSON.stringify(req.body, null, 2), 'utf-8');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Methodology (this repo's own .claude dir: agents, commands, schemas, scripts) ──
// The .claude dir IS the single source of truth: Claude Code auto-discovers it,
// and the app serves the very same files (no copies, no build step). Override the
// location with CLAUDE_DIR if needed. Endpoints stay named /api/resources/* for
// backwards compatibility with saved layouts.
const METHODOLOGY_HIDE = new Set(['settings.local.json']);

function claudeBase() {
  return path.resolve(__dirname, process.env.CLAUDE_DIR || '.claude');
}

function safeResourcePath(filePath) {
  const base = claudeBase();
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
      copied.push(...await copyDir(path.join(claudeBase(), sub), path.join(claudeDir, sub), sub));
    }
    res.json({ ok: true, target, count: copied.length, copied });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/resources/tree', async (_req, res) => {
  try {
    const tree = (await buildTree(claudeBase(), '')).filter((n) => !METHODOLOGY_HIDE.has(n.name));
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

// ── tmux terminal bridge ──────────────────────────────────────────────────────
// List the live tmux sessions inside WSL so the UI can offer a picker.
app.get('/api/tmux/sessions', (_req, res) => {
  execFile(
    'wsl.exe',
    ['-d', WSL_DISTRO, '--', 'tmux', 'ls'],
    { timeout: 5000, windowsHide: true },
    (err, stdout) => {
      // `tmux ls` exits non-zero with "no server running" when nothing is up —
      // that's not an error for us, just an empty list. Each line is
      // "name: N windows (...)"; take the part before the first colon.
      const sessions = err
        ? []
        : (stdout || '')
            .split(/\r?\n/)
            .map(l => l.trim())
            .filter(Boolean)
            .map(l => l.split(':')[0].trim())
            .filter(Boolean);
      res.json({ sessions, default: DEFAULT_TMUX_SESSION, distro: WSL_DISTRO });
    },
  );
});

// Serve the SPA + API over one HTTP server so the WebSocket can share the port.
const server = http.createServer(app);

// WebSocket ⇄ PTY bridge. Protocol:
//   server → client : terminal output as BINARY frames; control as TEXT JSON.
//   client → server : keystrokes as BINARY frames; {type:'resize',cols,rows} as TEXT JSON.
const wss = new WebSocketServer({ server, path: '/api/terminal' });

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://localhost');
  const session = url.searchParams.get('session') || DEFAULT_TMUX_SESSION;
  let cols = clampInt(url.searchParams.get('cols'), 80, 20, 500);
  let rows = clampInt(url.searchParams.get('rows'), 24, 5, 300);

  const sendText = (obj) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
  };

  if (!SESSION_RE.test(session)) {
    sendText({ type: 'error', message: `Invalid session name: ${session}` });
    ws.close(1008, 'invalid session name');
    return;
  }

  let term;
  try {
    // `new-session -A` attaches to <session> if it exists, or creates it — so the
    // panel degrades gracefully instead of erroring when the session isn't up yet.
    term = pty.spawn(
      'wsl.exe',
      ['-d', WSL_DISTRO, '--', 'tmux', 'new-session', '-A', '-s', session, '-x', String(cols), '-y', String(rows)],
      // ConPTY (the node-pty default on Windows) is required here: it forwards
      // window-size changes through wsl.exe to the Linux PTY, so resizing the
      // panel actually reflows tmux. The winpty backend stays quiet in headless
      // mode but does NOT propagate resizes. When the server runs without an
      // attached console, node-pty's console-list helper may log a harmless
      // "AttachConsole failed" line — it does not affect the terminal.
      { name: 'xterm-256color', cols, rows, env: process.env },
    );
  } catch (e) {
    sendText({ type: 'error', message: `Failed to start terminal: ${e.message}` });
    ws.close();
    return;
  }

  sendText({ type: 'ready', session, distro: WSL_DISTRO });

  term.onData((data) => {
    if (ws.readyState === ws.OPEN) ws.send(Buffer.from(data, 'utf8'));
  });
  term.onExit(({ exitCode }) => {
    sendText({ type: 'exit', code: exitCode });
    try { ws.close(); } catch { /* already closing */ }
  });

  ws.on('message', (raw, isBinary) => {
    if (isBinary) {
      term.write(raw.toString('utf8'));
      return;
    }
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (msg && msg.type === 'resize') {
      cols = clampInt(msg.cols, cols, 20, 500);
      rows = clampInt(msg.rows, rows, 5, 300);
      try { term.resize(cols, rows); } catch { /* pty gone */ }
    }
  });

  const dispose = () => { try { term.kill(); } catch { /* already dead */ } };
  ws.on('close', dispose);
  ws.on('error', dispose);
});

server.listen(PORT, () =>
  console.log(`UC Arch Viewer server on http://localhost:${PORT} (tmux bridge → WSL:${WSL_DISTRO})`));
