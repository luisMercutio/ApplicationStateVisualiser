#!/usr/bin/env node
// One-time backfill: import Claude Code's EXISTING session transcripts for this repo
// into the in-project store (.claude/conversations/), so the Claude Sessions tab shows
// history that predates the sync hook fix. This is a manual, run-once maintenance
// script — NOT an ongoing sync (the Stop/SessionEnd hook, sync-transcript.sh, keeps
// the store current from here on). Run it from the repo root:  node .claude/hooks/backfill-conversations.js
//
// Claude persists every session at <home>/.claude/projects/<projectSlug>/<uuid>.jsonl,
// where <projectSlug> is the working-dir path with every non-alphanumeric char turned
// into '-'. We mirror each into .claude/conversations/<prefix>__<uuid>.jsonl using the
// SAME naming the hook uses (prefix = basename of the transcript's own cwd), so the two
// paths are interchangeable and the server lists them uniformly.
const fs = require('fs');
const os = require('os');
const path = require('path');

const repoRoot = process.cwd();
const outDir = path.join(repoRoot, '.claude', 'conversations');
const projectsBase = path.join(os.homedir(), '.claude', 'projects');

// The native store dir for THIS repo's main tree (matches claudeProjectSlug on the
// repo's own path). Per-BR worktrees live under sibling slugs; we scan every project
// dir and keep only transcripts whose recorded cwd is inside this repo tree or its
// ASV-worktrees sibling, so we import all of this project's sessions but nothing else.
const repoName = path.basename(repoRoot);
const worktreesSibling = path.resolve(repoRoot, '..', 'ASV-worktrees');

// Pull the first `cwd` recorded in a transcript (it appears within the first few lines).
function transcriptCwd(file) {
  let fd;
  try { fd = fs.openSync(file, 'r'); } catch { return null; }
  try {
    const buf = Buffer.alloc(65536);
    const n = fs.readSync(fd, buf, 0, buf.length, 0);
    for (const line of buf.slice(0, n).toString('utf8').split(/\r?\n/)) {
      if (!line.trim()) continue;
      try { const o = JSON.parse(line); if (o.cwd) return String(o.cwd); } catch { /* partial last line */ }
    }
  } finally { fs.closeSync(fd); }
  return null;
}

function inThisProject(cwd) {
  if (!cwd) return false;
  const c = cwd.replace(/[\\/]+$/, '').toLowerCase();
  return c === repoRoot.toLowerCase()
      || c.startsWith(repoRoot.toLowerCase() + path.sep.toLowerCase())
      || c.startsWith(worktreesSibling.toLowerCase());
}

fs.mkdirSync(outDir, { recursive: true });
let projectDirs = [];
try { projectDirs = fs.readdirSync(projectsBase, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name); }
catch { console.error(`No Claude projects store at ${projectsBase} — nothing to import.`); process.exit(0); }

let imported = 0, skipped = 0, foreign = 0;
for (const proj of projectDirs) {
  const dir = path.join(projectsBase, proj);
  let files;
  try { files = fs.readdirSync(dir).filter(f => f.endsWith('.jsonl')); } catch { continue; }
  for (const f of files) {
    const src = path.join(dir, f);
    const cwd = transcriptCwd(src);
    if (!inThisProject(cwd)) { foreign++; continue; }
    const prefix = cwd ? path.basename(cwd.replace(/[\\/]+$/, '')) : repoName;
    const dest = path.join(outDir, `${prefix}__${f}`);
    try {
      const s = fs.statSync(src);
      let d; try { d = fs.statSync(dest); } catch { d = null; }
      if (d && d.mtimeMs >= s.mtimeMs) { skipped++; continue; } // already current
      fs.copyFileSync(src, dest);
      imported++;
    } catch (e) { console.error(`  ! ${f}: ${e.message}`); }
  }
}
console.log(`Backfill complete: ${imported} imported, ${skipped} already current, ${foreign} skipped (other projects).`);
console.log(`Store: ${outDir}`);
