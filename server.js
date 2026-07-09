const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const http = require('http');
const { execFile } = require('child_process');
const { WebSocketServer } = require('ws');
const pty = require('node-pty');
const dbStore = require('./db-store');

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

app.get('/api/ping', (_req, res) => res.json({ ok: true }));

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

// ── Database connections (Store A + target B…Z registry) ──────────────────────
// Store A is the viewer's own MariaDB database; it holds the encrypted profiles
// for the target application databases whose state we display. The selector in
// the UI flips which target the browse endpoints read from. All handlers funnel
// errors through a shared helper so a downed MariaDB surfaces as 503, a bad body
// as 400, and everything else as 500.
function sendDbError(res, err) {
  res.status(err.status || 500).json({ error: err.message });
}

app.get('/api/db/status', (_req, res) => res.json(dbStore.status()));

app.get('/api/db/connections', async (_req, res) => {
  try { res.json(await dbStore.listConnections()); } catch (err) { sendDbError(res, err); }
});

app.post('/api/db/connections', async (req, res) => {
  try { res.status(201).json(await dbStore.createConnection(req.body || {})); } catch (err) { sendDbError(res, err); }
});

// Test arbitrary (unsaved) parameters — lets the form verify before saving.
app.post('/api/db/connections/test', async (req, res) => {
  try { res.json(await dbStore.testParams(req.body || {})); } catch (err) { sendDbError(res, err); }
});

app.put('/api/db/connections/:id', async (req, res) => {
  try {
    const updated = await dbStore.updateConnection(req.params.id, req.body || {});
    if (!updated) return res.status(404).json({ error: 'connection not found' });
    res.json(updated);
  } catch (err) { sendDbError(res, err); }
});

app.delete('/api/db/connections/:id', async (req, res) => {
  try {
    const ok = await dbStore.deleteConnection(req.params.id);
    if (!ok) return res.status(404).json({ error: 'connection not found' });
    res.json({ ok: true });
  } catch (err) { sendDbError(res, err); }
});

app.post('/api/db/connections/:id/test', async (req, res) => {
  try { res.json(await dbStore.testExisting(req.params.id)); } catch (err) { sendDbError(res, err); }
});

// Active selection — which target the app currently retrieves state from.
app.get('/api/db/active', async (_req, res) => {
  try { res.json({ activeId: await dbStore.getActiveId() }); } catch (err) { sendDbError(res, err); }
});

app.put('/api/db/active', async (req, res) => {
  try { res.json({ activeId: await dbStore.setActiveId((req.body || {}).id ?? null) }); } catch (err) { sendDbError(res, err); }
});

// Browse the target: list its tables, then preview rows of one.
app.get('/api/db/connections/:id/tables', async (req, res) => {
  try { res.json({ tables: await dbStore.listTables(req.params.id) }); } catch (err) { sendDbError(res, err); }
});

app.get('/api/db/connections/:id/tables/:table/rows', async (req, res) => {
  try { res.json(await dbStore.previewTable(req.params.id, req.params.table, req.query.limit)); } catch (err) { sendDbError(res, err); }
});

// ── Application data: Epics + Business Rules (in the target app's own DB) ──────
// Every route is scoped to a connection id: the viewer flips the active
// connection to switch which application's epics/BRs it reads and edits. The
// tables are auto-provisioned in the target's DB on first touch.
app.get('/api/db/connections/:id/epics', async (req, res) => {
  try { res.json({ epics: await dbStore.listEpics(req.params.id) }); } catch (err) { sendDbError(res, err); }
});

app.post('/api/db/connections/:id/epics', async (req, res) => {
  try { res.status(201).json(await dbStore.createEpic(req.params.id, req.body || {})); } catch (err) { sendDbError(res, err); }
});

app.put('/api/db/connections/:id/epics/:epicId', async (req, res) => {
  try {
    const updated = await dbStore.updateEpic(req.params.id, req.params.epicId, req.body || {});
    if (!updated) return res.status(404).json({ error: 'epic not found' });
    res.json(updated);
  } catch (err) { sendDbError(res, err); }
});

app.delete('/api/db/connections/:id/epics/:epicId', async (req, res) => {
  try {
    const ok = await dbStore.deleteEpic(req.params.id, req.params.epicId);
    if (!ok) return res.status(404).json({ error: 'epic not found' });
    res.json({ ok: true });
  } catch (err) { sendDbError(res, err); }
});

app.get('/api/db/connections/:id/business-rules', async (req, res) => {
  try { res.json({ rules: await dbStore.listBusinessRules(req.params.id) }); } catch (err) { sendDbError(res, err); }
});

app.post('/api/db/connections/:id/business-rules', async (req, res) => {
  try { res.status(201).json(await dbStore.createBusinessRule(req.params.id, req.body || {})); } catch (err) { sendDbError(res, err); }
});

app.put('/api/db/connections/:id/business-rules/:brId', async (req, res) => {
  try {
    const updated = await dbStore.updateBusinessRule(req.params.id, req.params.brId, req.body || {});
    if (!updated) return res.status(404).json({ error: 'business rule not found' });
    res.json(updated);
  } catch (err) { sendDbError(res, err); }
});

app.delete('/api/db/connections/:id/business-rules/:brId', async (req, res) => {
  try {
    const ok = await dbStore.deleteBusinessRule(req.params.id, req.params.brId);
    if (!ok) return res.status(404).json({ error: 'business rule not found' });
    res.json({ ok: true });
  } catch (err) { sendDbError(res, err); }
});

// ── Additional agent information (extra agent-facing context per Business Rule) ─
// `?uptoSeq=<seq>` filters to entries whose referenced BR has been reached by
// development (referenced BR seq <= uptoSeq) — what the develop agents load.
app.get('/api/db/connections/:id/agent-info', async (req, res) => {
  try {
    const { uptoSeq } = req.query;
    const info = uptoSeq != null
      ? await dbStore.listAgentInfoUpToSeq(req.params.id, String(uptoSeq))
      : await dbStore.listAgentInfo(req.params.id);
    res.json({ info });
  } catch (err) { sendDbError(res, err); }
});

app.post('/api/db/connections/:id/agent-info', async (req, res) => {
  try { res.status(201).json(await dbStore.createAgentInfo(req.params.id, req.body || {})); } catch (err) { sendDbError(res, err); }
});

app.put('/api/db/connections/:id/agent-info/:infoId', async (req, res) => {
  try {
    const updated = await dbStore.updateAgentInfo(req.params.id, req.params.infoId, req.body || {});
    if (!updated) return res.status(404).json({ error: 'agent information not found' });
    res.json(updated);
  } catch (err) { sendDbError(res, err); }
});

app.delete('/api/db/connections/:id/agent-info/:infoId', async (req, res) => {
  try {
    const ok = await dbStore.deleteAgentInfo(req.params.id, req.params.infoId);
    if (!ok) return res.status(404).json({ error: 'agent information not found' });
    res.json({ ok: true });
  } catch (err) { sendDbError(res, err); }
});

// Convenience read for the develop agents: the applicable agent info for the
// ACTIVE connection, filtered to development progress via ?uptoSeq=<seq>.
app.get('/api/db/active/agent-info', async (req, res) => {
  try {
    const activeId = await dbStore.getActiveId();
    if (!activeId) return res.json({ info: [], activeId: null });
    const { uptoSeq } = req.query;
    const info = uptoSeq != null
      ? await dbStore.listAgentInfoUpToSeq(activeId, String(uptoSeq))
      : await dbStore.listAgentInfo(activeId);
    res.json({ info, activeId });
  } catch (err) { sendDbError(res, err); }
});

// ── Methodology files in the master DB (agents + commands) ────────────────────
// The master DB is the source of truth; saves also write through to .claude/ on
// disk so Claude Code keeps seeing the live copy. Editable from within the app.
app.get('/api/methodology', async (_req, res) => {
  try { res.json({ files: await dbStore.listMethodologyFiles() }); } catch (err) { sendDbError(res, err); }
});

app.get('/api/methodology/:kind/:name', async (req, res) => {
  try {
    const file = await dbStore.getMethodologyFile(req.params.kind, req.params.name);
    if (!file) return res.status(404).json({ error: 'file not found' });
    res.json(file);
  } catch (err) { sendDbError(res, err); }
});

app.put('/api/methodology/:kind/:name', async (req, res) => {
  try { res.json(await dbStore.saveMethodologyFile(req.params.kind, req.params.name, (req.body || {}).content)); } catch (err) { sendDbError(res, err); }
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

// Provision Store A in the background. A downed MariaDB must not take the whole
// viewer offline — the /api/db/* routes report the failure as 503 and the rest
// of the app (file/tree/terminal endpoints) keeps working.
dbStore.init()
  .then(() => console.log(`Store A ready → MariaDB ${dbStore.status().store.host}:${dbStore.status().store.port}/${dbStore.status().store.database}`))
  .catch(err => console.warn(`Store A unavailable (db features disabled): ${err.message}`));
