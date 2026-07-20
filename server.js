const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const http = require('http');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { WebSocketServer } = require('ws');
const pty = require('node-pty');
const dbStore = require('./db-store');
const methodology = require('./methodology-store');

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

// ── Claude sessions: per-BR git worktree + tmux `claude` session ───────────────
// "Submit with Claude" from the BR dialog hands a rule to a fresh `claude` CLI
// running in its OWN git worktree, so the work is isolated per BR. tmux, git and
// claude all live inside WSL; the Windows repo path is translated with `wslpath`.
const execFileP = promisify(execFile);

// Run a program (no shell) inside WSL and resolve with { stdout, stderr }.
function wsl(args, opts = {}) {
  return execFileP('wsl.exe', ['-d', WSL_DISTRO, '--', ...args], { timeout: 20000, windowsHide: true, ...opts });
}

// Translate a Windows path to its WSL /mnt/… form. We do this in Node rather than
// shelling out to `wslpath`, because passing a backslashed C:\… path through
// wsl.exe's argument marshalling eats the backslashes. Paths here are always local
// drive paths, so the mapping is deterministic.
function toWslPath(winPath) {
  const abs = path.resolve(winPath);
  const m = /^([A-Za-z]):[\\/]?(.*)$/.exec(abs);
  if (!m) return abs.replace(/\\/g, '/');
  return `/mnt/${m[1].toLowerCase()}/${m[2].replace(/\\/g, '/')}`;
}

// Resolve the MAIN repository working tree, even when this server was launched
// from inside a linked git worktree (e.g. .claude/worktrees/test). A linked
// worktree's `.git` is a FILE ("gitdir: <root>/.git/worktrees/<name>"), not a
// directory; feeding that path to `git` inside WSL mangles the Windows gitdir and
// fails. We parse it in Node instead and always run worktree ops against the real
// repo root, so it works regardless of which worktree started the server. Cached.
let mainRepoRootCache;
async function mainRepoRoot() {
  if (mainRepoRootCache) return mainRepoRootCache;
  const dotGit = path.join(__dirname, '.git');
  let root = __dirname;
  try {
    const stat = await fs.stat(dotGit);
    if (!stat.isDirectory()) {
      // Linked worktree: `.git` points at <root>/.git/worktrees/<name>.
      const m = /^gitdir:\s*(.+)$/m.exec(await fs.readFile(dotGit, 'utf8'));
      if (m) {
        const gitdir = m[1].trim().replace(/\\/g, '/');   // <root>/.git/worktrees/<name>
        root = path.dirname(path.dirname(path.dirname(gitdir))); // → <root>
      }
    }
  } catch { /* fall back to __dirname (assume main checkout) */ }
  mainRepoRootCache = root;
  return root;
}

// Local YYYYMMDD stamp, used to name a fresh per-BR worktree/branch per day.
function yyyymmdd() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

// Derive a filesystem/tmux-safe slug from a BR name. The result feeds the tmux
// session (`claude-<slug>`, must match SESSION_RE), branch (`claude/<slug>`) and
// worktree dir, so keep it to [a-z0-9._-].
function brSlug(name) {
  const slug = String(name || '').trim().toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[-._]+|[-._]+$/g, '')
    .slice(0, 60)
    .replace(/[-._]+$/g, '');
  if (!slug) throw new Error('cannot derive a slug from the BR name');
  return slug;
}

// Is `claude` reachable from a WSL login shell? (It's typically installed via
// nvm/npm-global, only on PATH once the login profile has run.)
async function claudeAvailable() {
  try { await wsl(['bash', '-lc', 'command -v claude']); return true; } catch { return false; }
}

async function tmuxHasSession(session) {
  // `=name` forces an exact match so `claude-foo` can't match `claude-foobar`.
  try { await wsl(['tmux', 'has-session', '-t', `=${session}`]); return true; } catch { return false; }
}

// Create the worktree + branch for a BR, idempotently: reuse the worktree if it
// (or the branch) already exists, so re-submitting the same BR never 500s.
async function ensureWorktree(repoWsl, worktreeWsl, branch) {
  const listed = await wsl(['git', '-C', repoWsl, 'worktree', 'list', '--porcelain']).catch(() => ({ stdout: '' }));
  if (listed.stdout.split(/\r?\n/).some(l => l.trim() === `worktree ${worktreeWsl}`)) return;
  const attempts = [
    ['git', '-C', repoWsl, 'worktree', 'add', '-b', branch, worktreeWsl], // fresh branch
    ['git', '-C', repoWsl, 'worktree', 'add', worktreeWsl, branch],       // branch already exists
  ];
  let lastErr;
  for (const a of attempts) {
    try { await wsl(a); return; } catch (e) {
      lastErr = e;
      if (/already (exists|used|checked out)/i.test(`${e.stderr || ''}${e.message || ''}`)) return;
    }
  }
  throw new Error(`git worktree add failed: ${(lastErr.stderr || lastErr.message || '').trim()}`);
}

// Spawn (or reuse) a Claude session for a Business Rule.
app.post('/api/claude/sessions', async (req, res) => {
  try {
    const brName = String(req.body?.brName || '').trim();
    const rule = String(req.body?.rule || '').trim();
    const description = req.body?.description == null ? '' : String(req.body.description).trim();
    if (!brName) return res.status(400).json({ error: 'brName is required' });
    if (!rule) return res.status(400).json({ error: 'rule is required' });

    const slug = brSlug(brName);
    const session = `claude-${slug}`;
    if (!SESSION_RE.test(session)) return res.status(400).json({ error: `invalid session name: ${session}` });

    if (!(await claudeAvailable())) {
      return res.status(400).json({ error: 'the `claude` CLI was not found on PATH inside WSL — install it or check your login shell' });
    }

    // The tmux session name stays deterministic (`claude-<slug>`) so the Claude
    // Sessions page can join it back to its BR. If a session for this BR is already
    // live, reuse it rather than spinning up a second worktree for the same rule.
    if (await tmuxHasSession(session)) {
      return res.status(200).json({ session, branch: `claude/${slug}`, worktree: null, reused: true });
    }

    // A fresh, isolated worktree per BR: `<slug>-YYYYMMDD` checked out on its own
    // branch. Crucially this runs against the MAIN repo root (resolved above), not
    // `__dirname` — so it works even when the server was launched from inside a
    // linked worktree, whose `.git` is a file git-in-WSL can't dereference.
    const worktreeName = `${slug}-${yyyymmdd()}`;
    const branch = `claude/${worktreeName}`;
    const root = await mainRepoRoot();
    const repoWsl = toWslPath(root);
    const worktreeWsl = toWslPath(path.resolve(root, '..', 'ASV-worktrees', worktreeName));
    await ensureWorktree(repoWsl, worktreeWsl, branch);

    // Start a detached tmux session that runs `claude` seeded with the rule. We
    // launch through `bash -lc 'exec claude "$1"' _ <prompt>` so: (a) the login
    // shell puts claude on PATH, (b) the prompt is passed as a positional arg —
    // never interpolated into a shell string, so arbitrary rule text is safe, and
    // (c) `exec` makes claude the pane's process (clean exit semantics).
    const prompt = description ? `${rule}\n\n${description}` : rule;
    await wsl(['tmux', 'new-session', '-d', '-s', session, '-c', worktreeWsl,
      'bash', '-lc', 'exec claude "$1"', 'claude-seed', prompt]);
    res.status(201).json({ session, branch, worktree: worktreeWsl });
  } catch (err) {
    res.status(500).json({ error: err.message || String(err) });
  }
});

// ── Claude session archive (conversation transcripts) ──────────────────────────
// The Stop/SessionEnd hook (.claude/hooks/sync-transcript.sh) mirrors each session's
// transcript into ONE central store in the main working tree as
// `<prefix>__<sessionUuid>.jsonl`, where <prefix> is the source worktree's basename.
// A per-BR worktree is `<slug>-YYYYMMDD`, so its archives carry the dated prefix;
// baseSlug() strips the date to rejoin them to the tmux session (`claude-<slug>`).
// Everything resolves against the MAIN repo root so it works when the server was
// launched from inside a linked worktree (e.g. .claude/worktrees/test).
async function conversationsDir() {
  return path.resolve(await mainRepoRoot(), '.claude', 'conversations');
}
async function asvWorktreesDir() {
  return path.resolve(await mainRepoRoot(), '..', 'ASV-worktrees');
}

// A per-BR worktree/branch/archive is named `<slug>-YYYYMMDD`, but its tmux session
// and BR slug drop the date. Strip an optional trailing date so every artifact keys
// back to the base slug the Claude Sessions page joins on (claude-<baseSlug>).
function baseSlug(name) {
  return name.replace(/-\d{8}$/, '');
}

// Map a WSL cwd to Claude Code's per-project transcript dir name: every
// non-alphanumeric char becomes '-' (verified against ~/.claude/projects/*).
function claudeProjectSlug(wslPath) {
  return wslPath.replace(/[^A-Za-z0-9]/g, '-');
}

// Archived transcripts keyed by BASE slug → [{ file, uuid, mtimeMs }], newest usable
// via a sort. `dated` holds the base slugs that came from a `<slug>-YYYYMMDD` prefix
// — i.e. per-BR sessions — so archives from dev worktrees (the main tree, `test`, …)
// don't masquerade as Claude sessions. Missing dir → empty (nothing archived yet).
async function listArchives() {
  const dir = await conversationsDir();
  let files;
  try { files = await fs.readdir(dir); } catch { return { bySlug: new Map(), dated: new Set() }; }
  const bySlug = new Map();
  const dated = new Set();
  for (const f of files) {
    if (!f.endsWith('.jsonl')) continue;
    const sep = f.indexOf('__');
    if (sep <= 0) continue;
    const prefix = f.slice(0, sep);
    const uuid = f.slice(sep + 2, -('.jsonl'.length));
    const slug = baseSlug(prefix);
    if (prefix !== slug) dated.add(slug); // had a -YYYYMMDD suffix → a per-BR session
    let mtimeMs = 0;
    try { mtimeMs = (await fs.stat(path.join(dir, f))).mtimeMs; } catch { /* ignore */ }
    const arr = bySlug.get(slug) || [];
    arr.push({ file: f, uuid, mtimeMs });
    bySlug.set(slug, arr);
  }
  return { bySlug, dated };
}

// Base slugs of the per-BR worktrees that currently exist on disk (../ASV-worktrees/*,
// each named `<slug>-YYYYMMDD`). Resolved against the main repo root.
async function worktreeSlugs() {
  try {
    const entries = await fs.readdir(await asvWorktreesDir(), { withFileTypes: true });
    return entries.filter(e => e.isDirectory()).map(e => baseSlug(e.name));
  } catch { return []; }
}

// Live claude-* tmux session names (empty when no tmux server is running).
function liveClaudeSessions() {
  return new Promise(resolve => {
    execFile('wsl.exe', ['-d', WSL_DISTRO, '--', 'tmux', 'ls'],
      { timeout: 5000, windowsHide: true }, (err, stdout) => {
        const names = err ? [] : (stdout || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean)
          .map(l => l.split(':')[0].trim()).filter(Boolean);
        resolve(names.filter(n => n.startsWith('claude-')));
      });
  });
}

// List Claude sessions: running (live in tmux) AND dead (a worktree or an archived
// transcript exists, but no live tmux session). Liveness is derived from tmux, not
// stored, so it survives a server restart. The BR/branch join happens client-side.
app.get('/api/claude/sessions', async (_req, res) => {
  try {
    const [live, wts, arch] = await Promise.all([liveClaudeSessions(), worktreeSlugs(), listArchives()]);
    const bySession = new Map();
    const add = (name, running, hasTranscript) => {
      const cur = bySession.get(name);
      if (cur) { cur.running = cur.running || running; cur.hasTranscript = cur.hasTranscript || hasTranscript; }
      else bySession.set(name, { name, running, hasTranscript });
    };
    for (const name of live) add(name, true, false);
    for (const slug of wts) add(`claude-${slug}`, false, arch.bySlug.has(slug));
    // Dead sessions whose worktree was removed but a dated transcript survives.
    for (const slug of arch.dated) add(`claude-${slug}`, false, true);
    // Live sessions may also have an archive from an earlier Stop.
    for (const [name, s] of bySession) {
      if (arch.bySlug.has(name.slice('claude-'.length))) s.hasTranscript = true;
    }
    res.json({ sessions: [...bySession.values()] });
  } catch (err) {
    res.status(500).json({ error: err.message || String(err) });
  }
});

// Reduce a Claude Code transcript JSONL to the prompt/answer thread: user text and
// assistant text only — no thinking, tool_use or tool_result blocks.
function textFromContent(content) {
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    return content.filter(b => b && b.type === 'text' && typeof b.text === 'string')
      .map(b => b.text).join('\n').trim();
  }
  return '';
}

function parseTranscript(raw) {
  const out = [];
  for (const line of raw.split(/\r?\n/)) {
    const s = line.trim();
    if (!s) continue;
    let obj;
    try { obj = JSON.parse(s); } catch { continue; }
    if (obj.isMeta || !obj.message) continue;
    if (obj.type === 'user') {
      // Skip tool_result echoes (user-role messages that only carry tool output).
      if (Array.isArray(obj.message.content) && obj.message.content.every(b => b && b.type === 'tool_result')) continue;
      const text = textFromContent(obj.message.content);
      if (text) out.push({ role: 'user', text, at: obj.timestamp || null });
    } else if (obj.type === 'assistant') {
      const text = textFromContent(obj.message.content);
      if (text) out.push({ role: 'assistant', text, at: obj.timestamp || null });
    }
  }
  return out;
}

// The archived conversation for a session (most recent transcript), prompt/answer only.
app.get('/api/claude/sessions/:session/conversation', async (req, res) => {
  try {
    const session = String(req.params.session || '');
    if (!SESSION_RE.test(session) || !session.startsWith('claude-')) {
      return res.status(400).json({ error: `invalid session name: ${session}` });
    }
    const slug = session.slice('claude-'.length);
    const list = (await listArchives()).bySlug.get(slug);
    if (!list || !list.length) return res.status(404).json({ error: 'no transcript has been archived for this session yet' });
    list.sort((a, b) => b.mtimeMs - a.mtimeMs);
    const chosen = list[0];
    const raw = await fs.readFile(path.join(await conversationsDir(), chosen.file), 'utf-8');
    res.json({ session, sessionId: chosen.uuid, file: chosen.file, messages: parseTranscript(raw) });
  } catch (err) {
    res.status(500).json({ error: err.message || String(err) });
  }
});

// Reopen a dead session. Claude replays its OWN per-project transcript store
// (~/.claude/projects/<slug>/ inside WSL), so we: (1) resume when that store is
// intact; (2) rehydrate it from our central archive — byte-for-byte the same
// files — then resume when it was pruned; (3) start fresh (seeded with the rule
// when the client supplies it) when there's nothing to replay.
app.post('/api/claude/sessions/:session/reopen', async (req, res) => {
  try {
    const session = String(req.params.session || '');
    if (!SESSION_RE.test(session) || !session.startsWith('claude-')) {
      return res.status(400).json({ error: `invalid session name: ${session}` });
    }
    const slug = session.slice('claude-'.length);
    const rule = req.body?.rule == null ? '' : String(req.body.rule).trim();
    const description = req.body?.description == null ? '' : String(req.body.description).trim();

    if (!(await claudeAvailable())) {
      return res.status(400).json({ error: 'the `claude` CLI was not found on PATH inside WSL — install it or check your login shell' });
    }
    if (await tmuxHasSession(session)) return res.json({ session, branch: `claude/${slug}`, mode: 'already-running' });

    // Reuse the most recent existing dated worktree for this BR (its native transcript
    // store, if intact, gives the cleanest resume); otherwise mint today's worktree.
    const root = await mainRepoRoot();
    const repoWsl = toWslPath(root);
    let worktreeName = null;
    try {
      const entries = await fs.readdir(await asvWorktreesDir(), { withFileTypes: true });
      const mine = entries.filter(e => e.isDirectory() && baseSlug(e.name) === slug).map(e => e.name).sort();
      if (mine.length) worktreeName = mine[mine.length - 1];
    } catch { /* no worktrees dir yet */ }
    if (!worktreeName) worktreeName = `${slug}-${yyyymmdd()}`;
    const branch = `claude/${worktreeName}`;
    const worktreeWsl = toWslPath(path.resolve(root, '..', 'ASV-worktrees', worktreeName));
    await ensureWorktree(repoWsl, worktreeWsl, branch);

    // Is Claude's native transcript store for this worktree still present?
    const nativeDir = `$HOME/.claude/projects/${claudeProjectSlug(worktreeWsl)}`;
    let canResume = false;
    try { await wsl(['bash', '-lc', `ls ${nativeDir}/*.jsonl >/dev/null 2>&1`]); canResume = true; } catch { canResume = false; }

    let mode;
    if (canResume) {
      mode = 'resumed';
    } else {
      const list = (await listArchives()).bySlug.get(slug);
      if (list && list.length) {
        list.sort((a, b) => b.mtimeMs - a.mtimeMs);
        const chosen = list[0];
        const srcWsl = toWslPath(path.join(await conversationsDir(), chosen.file));
        // Restore the native transcript from the archive, then --continue can replay it.
        await wsl(['bash', '-lc', `mkdir -p "${nativeDir}" && cp "$1" "${nativeDir}/$2"`,
          'rehydrate', srcWsl, `${chosen.uuid}.jsonl`]);
        mode = 'rehydrated';
      } else {
        mode = rule ? 'fresh-seeded' : 'fresh';
      }
    }

    if (mode === 'resumed' || mode === 'rehydrated') {
      await wsl(['tmux', 'new-session', '-d', '-s', session, '-c', worktreeWsl,
        'bash', '-lc', 'exec claude --continue']);
    } else if (mode === 'fresh-seeded') {
      const prompt = description ? `${rule}\n\n${description}` : rule;
      await wsl(['tmux', 'new-session', '-d', '-s', session, '-c', worktreeWsl,
        'bash', '-lc', 'exec claude "$1"', 'claude-seed', prompt]);
    } else {
      await wsl(['tmux', 'new-session', '-d', '-s', session, '-c', worktreeWsl,
        'bash', '-lc', 'exec claude']);
    }
    res.status(201).json({ session, branch, worktree: worktreeWsl, mode });
  } catch (err) {
    res.status(500).json({ error: err.message || String(err) });
  }
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

// Notes — free-form ideas kept against the active application, same connection
// scoping as epics/business-rules.
app.get('/api/db/connections/:id/notes', async (req, res) => {
  try { res.json({ notes: await dbStore.listNotes(req.params.id) }); } catch (err) { sendDbError(res, err); }
});

app.post('/api/db/connections/:id/notes', async (req, res) => {
  try { res.status(201).json(await dbStore.createNote(req.params.id, req.body || {})); } catch (err) { sendDbError(res, err); }
});

app.put('/api/db/connections/:id/notes/:noteId', async (req, res) => {
  try {
    const updated = await dbStore.updateNote(req.params.id, req.params.noteId, req.body || {});
    if (!updated) return res.status(404).json({ error: 'note not found' });
    res.json(updated);
  } catch (err) { sendDbError(res, err); }
});

app.delete('/api/db/connections/:id/notes/:noteId', async (req, res) => {
  try {
    const ok = await dbStore.deleteNote(req.params.id, req.params.noteId);
    if (!ok) return res.status(404).json({ error: 'note not found' });
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

// ── BR snapshots (point-in-time copies of the whole Epic + BR set) ────────────
// A snapshot captures the current epics + business rules so they can be diffed
// against the live set later. Scoped per connection like epics/business-rules.
app.get('/api/db/connections/:id/br-snapshots', async (req, res) => {
  try { res.json({ snapshots: await dbStore.listSnapshots(req.params.id) }); } catch (err) { sendDbError(res, err); }
});

app.post('/api/db/connections/:id/br-snapshots', async (req, res) => {
  try { res.status(201).json(await dbStore.createSnapshot(req.params.id, req.body || {})); } catch (err) { sendDbError(res, err); }
});

app.get('/api/db/connections/:id/br-snapshots/:snapId', async (req, res) => {
  try {
    const snapshot = await dbStore.getSnapshot(req.params.id, req.params.snapId);
    if (!snapshot) return res.status(404).json({ error: 'snapshot not found' });
    res.json(snapshot);
  } catch (err) { sendDbError(res, err); }
});

app.delete('/api/db/connections/:id/br-snapshots/:snapId', async (req, res) => {
  try {
    const ok = await dbStore.deleteSnapshot(req.params.id, req.params.snapId);
    if (!ok) return res.status(404).json({ error: 'snapshot not found' });
    res.json({ ok: true });
  } catch (err) { sendDbError(res, err); }
});

// ── Additional agent information (extra agent-facing context per Business Rule) ─
// `?uptoExecutionOrder=<n>` filters to entries whose referenced BR has been
// reached by development (referenced BR execution_order <= n) — what the develop
// agents load.
app.get('/api/db/connections/:id/agent-info', async (req, res) => {
  try {
    const { uptoExecutionOrder } = req.query;
    const info = uptoExecutionOrder != null
      ? await dbStore.listAgentInfoUpToExecutionOrder(req.params.id, String(uptoExecutionOrder))
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
// ACTIVE connection, filtered to development progress via ?uptoExecutionOrder=<n>.
app.get('/api/db/active/agent-info', async (req, res) => {
  try {
    const activeId = await dbStore.getActiveId();
    if (!activeId) return res.json({ info: [], activeId: null });
    const { uptoExecutionOrder } = req.query;
    const info = uptoExecutionOrder != null
      ? await dbStore.listAgentInfoUpToExecutionOrder(activeId, String(uptoExecutionOrder))
      : await dbStore.listAgentInfo(activeId);
    res.json({ info, activeId });
  } catch (err) { sendDbError(res, err); }
});

// ── Methodology files (agents + commands) ─────────────────────────────────────
// Served straight from .claude/ on disk — the filesystem is the single source of
// truth (exactly where Claude Code discovers them), so there is no DB copy to seed
// or keep in sync. Full CRUD: list, read, create/edit, delete, rename. Independent
// of MariaDB, so methodology stays editable even when the database is down.
app.get('/api/methodology', async (_req, res) => {
  try { res.json({ files: await methodology.listMethodologyFiles() }); } catch (err) { sendDbError(res, err); }
});

app.get('/api/methodology/:kind/:name', async (req, res) => {
  try {
    const file = await methodology.getMethodologyFile(req.params.kind, req.params.name);
    if (!file) return res.status(404).json({ error: 'file not found' });
    res.json(file);
  } catch (err) { sendDbError(res, err); }
});

app.put('/api/methodology/:kind/:name', async (req, res) => {
  try { res.json(await methodology.saveMethodologyFile(req.params.kind, req.params.name, (req.body || {}).content)); } catch (err) { sendDbError(res, err); }
});

app.delete('/api/methodology/:kind/:name', async (req, res) => {
  try { res.json(await methodology.deleteMethodologyFile(req.params.kind, req.params.name)); } catch (err) { sendDbError(res, err); }
});

app.post('/api/methodology/:kind/:name/rename', async (req, res) => {
  try { res.json(await methodology.renameMethodologyFile(req.params.kind, req.params.name, (req.body || {}).newName)); } catch (err) { sendDbError(res, err); }
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
