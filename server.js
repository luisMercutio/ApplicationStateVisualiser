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

// ── ntfy activity feed config ─────────────────────────────────────────────────
// The Claude Code Stop hook POSTs a "chat finished" notification to a self-hosted
// ntfy topic (both the WSL 🐧 and native-Windows 🪟 notifiers fan into the same
// topic). We subscribe to that topic's JSON stream and mirror it to the browser
// over the /api/activity WebSocket — no second hook, no database.
const NTFY_BASE = process.env.NTFY_URL || 'http://100.107.151.8:2586';
const NTFY_TOPIC = process.env.NTFY_TOPIC || 'Luiscomputer_claude';
// How much recent history to replay on first connect (and how many messages to
// keep in memory for clients that connect later). Bounded by ntfy's cache.
const ACTIVITY_BACKFILL = process.env.NTFY_BACKFILL || '12h';
const ACTIVITY_BUFFER_MAX = 200;

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

// ── Applications + their state (single store DB) ──────────────────────────────
// Everything lives in one MariaDB database. `applications` is the top-level
// entity; epics/business-rules/notes/agent-info are scoped by application id.
// The selector in the UI flips which application the state endpoints read/write.
// All handlers funnel errors through a shared helper so a downed MariaDB surfaces
// as 503, a bad body as 400, and everything else as 500.
function sendDbError(res, err) {
  res.status(err.status || 500).json({ error: err.message });
}

app.get('/api/db/status', (_req, res) => res.json(dbStore.status()));

app.get('/api/applications', async (_req, res) => {
  try { res.json({ applications: await dbStore.listApplications() }); } catch (err) { sendDbError(res, err); }
});

app.post('/api/applications', async (req, res) => {
  try { res.status(201).json(await dbStore.createApplication(req.body || {})); } catch (err) { sendDbError(res, err); }
});

// Active selection — which application the app currently shows state for.
app.get('/api/applications/active', async (_req, res) => {
  try { res.json({ activeId: await dbStore.getActiveId() }); } catch (err) { sendDbError(res, err); }
});

app.put('/api/applications/active', async (req, res) => {
  try { res.json({ activeId: await dbStore.setActiveId((req.body || {}).id ?? null) }); } catch (err) { sendDbError(res, err); }
});

// Convenience read for the develop agents: the applicable agent info for the
// ACTIVE application, filtered to development progress via ?uptoSeq=<seq>.
app.get('/api/applications/active/agent-info', async (req, res) => {
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

app.put('/api/applications/:appId', async (req, res) => {
  try {
    const updated = await dbStore.updateApplication(req.params.appId, req.body || {});
    if (!updated) return res.status(404).json({ error: 'application not found' });
    res.json(updated);
  } catch (err) { sendDbError(res, err); }
});

app.delete('/api/applications/:appId', async (req, res) => {
  try {
    const ok = await dbStore.deleteApplication(req.params.appId);
    if (!ok) return res.status(404).json({ error: 'application not found' });
    res.json({ ok: true });
  } catch (err) { sendDbError(res, err); }
});

// ── Application state: Epics + Business Rules + Notes ──────────────────────────
// Every route is scoped to an application id: the viewer flips the active
// application to switch which epics/BRs it reads and edits.
app.get('/api/applications/:appId/epics', async (req, res) => {
  try { res.json({ epics: await dbStore.listEpics(req.params.appId) }); } catch (err) { sendDbError(res, err); }
});

app.post('/api/applications/:appId/epics', async (req, res) => {
  try { res.status(201).json(await dbStore.createEpic(req.params.appId, req.body || {})); } catch (err) { sendDbError(res, err); }
});

app.put('/api/applications/:appId/epics/:epicId', async (req, res) => {
  try {
    const updated = await dbStore.updateEpic(req.params.appId, req.params.epicId, req.body || {});
    if (!updated) return res.status(404).json({ error: 'epic not found' });
    res.json(updated);
  } catch (err) { sendDbError(res, err); }
});

app.delete('/api/applications/:appId/epics/:epicId', async (req, res) => {
  try {
    const ok = await dbStore.deleteEpic(req.params.appId, req.params.epicId);
    if (!ok) return res.status(404).json({ error: 'epic not found' });
    res.json({ ok: true });
  } catch (err) { sendDbError(res, err); }
});

// Notes — free-form ideas kept against the active application, same application
// scoping as epics/business-rules.
app.get('/api/applications/:appId/notes', async (req, res) => {
  try { res.json({ notes: await dbStore.listNotes(req.params.appId) }); } catch (err) { sendDbError(res, err); }
});

app.post('/api/applications/:appId/notes', async (req, res) => {
  try { res.status(201).json(await dbStore.createNote(req.params.appId, req.body || {})); } catch (err) { sendDbError(res, err); }
});

app.put('/api/applications/:appId/notes/:noteId', async (req, res) => {
  try {
    const updated = await dbStore.updateNote(req.params.appId, req.params.noteId, req.body || {});
    if (!updated) return res.status(404).json({ error: 'note not found' });
    res.json(updated);
  } catch (err) { sendDbError(res, err); }
});

app.delete('/api/applications/:appId/notes/:noteId', async (req, res) => {
  try {
    const ok = await dbStore.deleteNote(req.params.appId, req.params.noteId);
    if (!ok) return res.status(404).json({ error: 'note not found' });
    res.json({ ok: true });
  } catch (err) { sendDbError(res, err); }
});

app.get('/api/applications/:appId/business-rules', async (req, res) => {
  try { res.json({ rules: await dbStore.listBusinessRules(req.params.appId) }); } catch (err) { sendDbError(res, err); }
});

app.post('/api/applications/:appId/business-rules', async (req, res) => {
  try { res.status(201).json(await dbStore.createBusinessRule(req.params.appId, req.body || {})); } catch (err) { sendDbError(res, err); }
});

app.put('/api/applications/:appId/business-rules/:brId', async (req, res) => {
  try {
    const updated = await dbStore.updateBusinessRule(req.params.appId, req.params.brId, req.body || {});
    if (!updated) return res.status(404).json({ error: 'business rule not found' });
    res.json(updated);
  } catch (err) { sendDbError(res, err); }
});

app.delete('/api/applications/:appId/business-rules/:brId', async (req, res) => {
  try {
    const ok = await dbStore.deleteBusinessRule(req.params.appId, req.params.brId);
    if (!ok) return res.status(404).json({ error: 'business rule not found' });
    res.json({ ok: true });
  } catch (err) { sendDbError(res, err); }
});

// ── Additional agent information (extra agent-facing context per Business Rule) ─
// `?uptoSeq=<seq>` filters to entries whose referenced BR has been reached by
// development (referenced BR seq <= uptoSeq) — what the develop agents load.
app.get('/api/applications/:appId/agent-info', async (req, res) => {
  try {
    const { uptoSeq } = req.query;
    const info = uptoSeq != null
      ? await dbStore.listAgentInfoUpToSeq(req.params.appId, String(uptoSeq))
      : await dbStore.listAgentInfo(req.params.appId);
    res.json({ info });
  } catch (err) { sendDbError(res, err); }
});

app.post('/api/applications/:appId/agent-info', async (req, res) => {
  try { res.status(201).json(await dbStore.createAgentInfo(req.params.appId, req.body || {})); } catch (err) { sendDbError(res, err); }
});

app.put('/api/applications/:appId/agent-info/:infoId', async (req, res) => {
  try {
    const updated = await dbStore.updateAgentInfo(req.params.appId, req.params.infoId, req.body || {});
    if (!updated) return res.status(404).json({ error: 'agent information not found' });
    res.json(updated);
  } catch (err) { sendDbError(res, err); }
});

app.delete('/api/applications/:appId/agent-info/:infoId', async (req, res) => {
  try {
    const ok = await dbStore.deleteAgentInfo(req.params.appId, req.params.infoId);
    if (!ok) return res.status(404).json({ error: 'agent information not found' });
    res.json({ ok: true });
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

// ── ntfy activity feed ────────────────────────────────────────────────────────
// One persistent upstream connection to ntfy's JSON stream, mirrored to every
// connected browser. Kept in an in-memory ring buffer so a client that opens the
// panel later still sees recent history. Purely in-memory — nothing is persisted.
const activityBuffer = [];        // recent { id, time, title, message, tags, priority }
const activityClients = new Set(); // open /api/activity WebSockets
let ntfyLastId = null;            // resume point so reconnects don't gap or duplicate
let ntfyReconnectTimer = null;

function broadcastActivity(msg) {
  // Dedupe by id — a reconnect with `since=<id>` can re-deliver the boundary msg.
  if (msg.id && activityBuffer.some((m) => m.id === msg.id)) return;
  activityBuffer.push(msg);
  if (activityBuffer.length > ACTIVITY_BUFFER_MAX) activityBuffer.shift();
  if (msg.id) ntfyLastId = msg.id;
  const frame = JSON.stringify({ type: 'message', event: msg });
  for (const ws of activityClients) {
    if (ws.readyState === ws.OPEN) ws.send(frame);
  }
}

function scheduleNtfyReconnect() {
  if (ntfyReconnectTimer) return; // already pending — don't stack reconnects
  ntfyReconnectTimer = setTimeout(() => {
    ntfyReconnectTimer = null;
    subscribeNtfy();
  }, 5000);
}

function subscribeNtfy() {
  // Resume from the last seen id after the first successful run so reconnects
  // don't replay the whole backfill window; use the time window on a cold start.
  const since = ntfyLastId ? encodeURIComponent(ntfyLastId) : ACTIVITY_BACKFILL;
  const url = `${NTFY_BASE}/${NTFY_TOPIC}/json?since=${since}`;
  const lib = url.startsWith('https:') ? require('https') : http;

  let buf = '';
  const req = lib.get(url, (res) => {
    if (res.statusCode !== 200) {
      res.resume();
      scheduleNtfyReconnect();
      return;
    }
    res.setEncoding('utf8');
    res.on('data', (chunk) => {
      // ntfy streams newline-delimited JSON: one object per line.
      buf += chunk;
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        let obj;
        try { obj = JSON.parse(line); } catch { continue; }
        // Stream also carries open/keepalive/poll_request events — ignore those.
        if (obj.event !== 'message') continue;
        broadcastActivity({
          id: obj.id,
          time: obj.time || 0,
          title: obj.title || '',
          message: obj.message || '',
          tags: Array.isArray(obj.tags) ? obj.tags : [],
          priority: obj.priority || 3,
        });
      }
    });
    res.on('end', scheduleNtfyReconnect);
    res.on('error', scheduleNtfyReconnect);
  });
  req.on('error', scheduleNtfyReconnect);
  // Long-lived stream: don't let an idle-socket timeout kill it (ntfy sends
  // keepalive events, but be explicit).
  req.setTimeout(0);
}

// Serve the SPA + API over one HTTP server so the WebSockets can share the port.
const server = http.createServer(app);

// Two WebSocket endpoints share the one HTTP server. Run both in noServer mode
// and route upgrades by path ourselves — if each attached to the server with its
// own `path`, whichever fired first would abort the other endpoint's handshake.
const wss = new WebSocketServer({ noServer: true });
const activityWss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  let pathname;
  try { pathname = new URL(req.url, 'http://localhost').pathname; } catch { pathname = req.url; }
  if (pathname === '/api/terminal') {
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  } else if (pathname === '/api/activity') {
    activityWss.handleUpgrade(req, socket, head, (ws) => activityWss.emit('connection', ws, req));
  } else {
    socket.destroy();
  }
});

// Activity feed: on connect, replay the in-memory backlog, then stream live
// messages as they arrive from ntfy. Read-only — clients send nothing.
activityWss.on('connection', (ws) => {
  activityClients.add(ws);
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify({ type: 'backlog', events: activityBuffer }));
  }
  const drop = () => activityClients.delete(ws);
  ws.on('close', drop);
  ws.on('error', drop);
});

// WebSocket ⇄ PTY bridge. Protocol:
//   server → client : terminal output as BINARY frames; control as TEXT JSON.
//   client → server : keystrokes as BINARY frames; {type:'resize',cols,rows} as TEXT JSON.
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

// Start mirroring the ntfy activity topic. Failures self-reschedule, so a downed
// ntfy just means an empty feed — it never affects the rest of the server.
subscribeNtfy();

// Provision Store A in the background. A downed MariaDB must not take the whole
// viewer offline — the /api/db/* routes report the failure as 503 and the rest
// of the app (file/tree/terminal endpoints) keeps working.
//
// init() runs once at boot; on a boot-order race (Node up before MariaDB accepts
// connections) it would otherwise fail and pin /api/db/* to 503 until a manual
// restart. Retry with capped exponential backoff so Store A self-heals the moment
// MariaDB becomes reachable. init() is idempotent (CREATE ... IF NOT EXISTS), so
// re-running it is safe.
(function initStoreAWithRetry(attempt = 1) {
  dbStore.init()
    .then(() => console.log(`Store A ready → MariaDB ${dbStore.status().store.host}:${dbStore.status().store.port}/${dbStore.status().store.database}`))
    .catch(err => {
      const delay = Math.min(30000, 1000 * 2 ** (attempt - 1)); // 1s, 2s, 4s… capped at 30s
      console.warn(`Store A unavailable (attempt ${attempt}), retrying in ${delay}ms: ${err.message}`);
      setTimeout(() => initStoreAWithRetry(attempt + 1), delay).unref();
    });
})();
