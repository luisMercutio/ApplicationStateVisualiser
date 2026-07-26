import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Panel } from '../models/panel.model';
import { ClaudeSession, ConversationMessage, RepoSession } from '../models/app-data.model';
import { GitCommit, GitWorktree } from '../models/git.model';
import { AppInstance } from '../models/instance.model';

// Derive the API host from the page's own host so the app works both on
// localhost and when reached over the network (e.g. a phone on Tailscale
// loading http://<tailscale-ip>:4201 → API at http://<tailscale-ip>:3001).
//
// The API *port* is derived from the page's own web port so each worktree instance
// talks to its OWN backend: dev-remote runs every instance with web = api + 1200
// (base pair 4201/3001), so an instance opened on web :4202 reaches its own api
// :3002, not the base API on 3001. Anything outside that scheme falls back to 3001.
const API_OFFSET = 1200;
const API_FALLBACK = 3001;
function deriveApiPort(): number {
  const web = typeof window !== 'undefined' ? parseInt(window.location?.port ?? '', 10) : NaN;
  return Number.isFinite(web) && web - API_OFFSET >= API_FALLBACK ? web - API_OFFSET : API_FALLBACK;
}
const API_PORT = deriveApiPort();
const API_BASE =
  typeof window !== 'undefined' && window.location?.hostname
    ? `${window.location.protocol}//${window.location.hostname}:${API_PORT}`
    : `http://localhost:${API_PORT}`;

// Non-database server endpoints the app still uses: the saved panel layouts and
// the WSL tmux terminal bridge. Everything project-data related now goes through
// DbService (the active connection), not a filesystem project root.
@Injectable({ providedIn: 'root' })
export class FileService {
  private http = inject(HttpClient);

  ping(): Observable<{ ok: boolean }> {
    return this.http.get<{ ok: boolean }>(`${API_BASE}/api/ping`);
  }

  // ── tmux terminal bridge (WSL) ──
  getTmuxSessions(): Observable<{ sessions: string[]; default: string; distro: string }> {
    return this.http.get<{ sessions: string[]; default: string; distro: string }>(
      `${API_BASE}/api/tmux/sessions`, { headers: { 'Cache-Control': 'no-cache' } });
  }

  // WebSocket URL for the PTY bridge, mirroring API_BASE's host derivation so it
  // works over Tailscale (wss when the page is https).
  terminalWsUrl(session: string, cols: number, rows: number): string {
    const proto = typeof window !== 'undefined' && window.location?.protocol === 'https:' ? 'wss' : 'ws';
    const host = typeof window !== 'undefined' && window.location?.hostname ? window.location.hostname : 'localhost';
    const params = new URLSearchParams({ session, cols: String(cols), rows: String(rows) });
    return `${proto}://${host}:${API_PORT}/api/terminal?${params.toString()}`;
  }

  // ── Claude sessions (per-BR git worktree + tmux claude session) ──
  // Hand a Business Rule to a fresh claude CLI running in its own worktree.
  submitToClaude(body: { brName: string; rule: string; description: string | null }):
    Observable<{ session: string; branch: string; worktree: string }> {
    return this.http.post<{ session: string; branch: string; worktree: string }>(
      `${API_BASE}/api/claude/sessions`, body);
  }

  // All claude-* sessions: running ones (live in tmux) plus "dead" ones (a worktree
  // or an archived transcript exists but no live tmux session). Running state and
  // hasTranscript are derived server-side.
  getClaudeSessions(): Observable<ClaudeSession[]> {
    return this.http.get<{ sessions: ClaudeSession[] }>(
      `${API_BASE}/api/claude/sessions`, { headers: { 'Cache-Control': 'no-cache' } })
      .pipe(map(r => r.sessions));
  }

  // Reopen a dead session: resume the prior conversation when it can be restored,
  // otherwise start fresh (seeded with the rule when provided). `mode` reports what
  // actually happened (resumed | rehydrated | fresh-seeded | fresh | already-running).
  reopenClaudeSession(session: string, body: { rule?: string; description?: string | null }):
    Observable<{ session: string; branch: string; worktree?: string; mode: string }> {
    return this.http.post<{ session: string; branch: string; worktree?: string; mode: string }>(
      `${API_BASE}/api/claude/sessions/${encodeURIComponent(session)}/reopen`, body);
  }

  // Kill a running session's tmux session (the claude process exits with it).
  killClaudeSession(session: string): Observable<{ ok: boolean; session: string }> {
    return this.http.post<{ ok: boolean; session: string }>(
      `${API_BASE}/api/claude/sessions/${encodeURIComponent(session)}/kill`, {});
  }

  // Archive a dead session: remove its git worktree(s)+branch(es); the conversation
  // is filed away under .claude/conversations/archived/ (kept on disk).
  archiveClaudeSession(session: string): Observable<{ session: string; mode: string }> {
    return this.http.post<{ session: string; mode: string }>(
      `${API_BASE}/api/claude/sessions/${encodeURIComponent(session)}/archive`, {});
  }

  // Delete a dead session entirely: git worktree(s)+branch(es) AND the conversation.
  deleteClaudeSession(session: string): Observable<{ session: string; mode: string }> {
    return this.http.delete<{ session: string; mode: string }>(
      `${API_BASE}/api/claude/sessions/${encodeURIComponent(session)}`);
  }

  // The archived conversation for a session, reduced to prompt/answer turns only.
  getClaudeConversation(session: string):
    Observable<{ session: string; sessionId: string; messages: ConversationMessage[] }> {
    return this.http.get<{ session: string; sessionId: string; messages: ConversationMessage[] }>(
      `${API_BASE}/api/claude/sessions/${encodeURIComponent(session)}/conversation`,
      { headers: { 'Cache-Control': 'no-cache' } });
  }

  // ── Repository sessions (every Claude session mirrored for this repo) ──
  // One row per saved transcript UUID, independent of any BR or live tmux session.
  getRepoSessions(): Observable<RepoSession[]> {
    return this.http.get<{ sessions: RepoSession[] }>(
      `${API_BASE}/api/claude/repo-sessions`, { headers: { 'Cache-Control': 'no-cache' } })
      .pipe(map(r => r.sessions));
  }

  // The saved conversation for a repo session (prompt/answer turns only), by UUID.
  getRepoSessionConversation(id: string):
    Observable<{ id: string; file: string; messages: ConversationMessage[] }> {
    return this.http.get<{ id: string; file: string; messages: ConversationMessage[] }>(
      `${API_BASE}/api/claude/repo-sessions/${encodeURIComponent(id)}/conversation`,
      { headers: { 'Cache-Control': 'no-cache' } });
  }

  // Resume a saved repo session (claude --resume <uuid>) in a fresh tmux window; the
  // response's session name can be attached on the Terminal page.
  resumeRepoSession(id: string): Observable<{ session: string; mode: string }> {
    return this.http.post<{ session: string; mode: string }>(
      `${API_BASE}/api/claude/repo-sessions/${encodeURIComponent(id)}/resume`, {});
  }

  // ── Git history + worktrees (read-only views over the repo's own git) ──
  getGitWorktrees(): Observable<GitWorktree[]> {
    return this.http.get<{ worktrees: GitWorktree[] }>(
      `${API_BASE}/api/git/worktrees`, { headers: { 'Cache-Control': 'no-cache' } })
      .pipe(map(r => r.worktrees));
  }

  // Open (or reuse) a plain tmux terminal session rooted in the given worktree, named
  // after the worktree directory. Returns the session name so the caller can attach the
  // Terminal view to it. `reused` is true when a session with that name was already live.
  openWorktreeSession(path: string): Observable<{ session: string; worktree: string; reused?: boolean }> {
    return this.http.post<{ session: string; worktree: string; reused?: boolean }>(
      `${API_BASE}/api/git/worktrees/session`, { path });
  }

  // ref: a branch name or sha to scope the log to one worktree (omit for HEAD).
  getGitLog(ref?: string, limit = 100): Observable<GitCommit[]> {
    let params = new HttpParams().set('limit', String(limit));
    if (ref) params = params.set('ref', ref);
    return this.http.get<{ commits: GitCommit[] }>(
      `${API_BASE}/api/git/log`, { params, headers: { 'Cache-Control': 'no-cache' } })
      .pipe(map(r => r.commits));
  }

  // ── Git mutating actions (drop commit / remove worktree / merge branches) ──
  // Drop a single commit from a branch (rewrites that branch's history).
  dropGitCommit(branch: string, sha: string):
    Observable<{ ok: boolean; branch: string; dropped: string; head: string }> {
    return this.http.post<{ ok: boolean; branch: string; dropped: string; head: string }>(
      `${API_BASE}/api/git/drop-commit`, { branch, sha });
  }

  // Remove a worktree by its path. force retries past uncommitted/untracked changes.
  removeGitWorktree(path: string, force = false):
    Observable<{ ok: boolean; removed: string; branch: string | null }> {
    return this.http.post<{ ok: boolean; removed: string; branch: string | null }>(
      `${API_BASE}/api/git/worktrees/remove`, { path, force });
  }

  // Merge one branch into another (the target must be checked out in a worktree).
  mergeGitBranch(from: string, into: string):
    Observable<{ ok: boolean; from: string; into: string; head: string; output: string }> {
    return this.http.post<{ ok: boolean; from: string; into: string; head: string; output: string }>(
      `${API_BASE}/api/git/merge`, { from, into });
  }

  // ── Worktree instances (dev-remote start/stop/status per worktree) ──
  // Every running (or once-running) instance dev-remote knows about, port-ordered.
  getInstances(): Observable<AppInstance[]> {
    return this.http.get<{ instances: AppInstance[] }>(
      `${API_BASE}/api/instances`, { headers: { 'Cache-Control': 'no-cache' } })
      .pipe(map(r => r.instances));
  }

  // Boot a worktree as its own instance on the next free port pair; the response's
  // `instance` carries the ports it landed on (null if the script reported an error).
  startInstance(worktree: string):
    Observable<{ ok: boolean; stdout: string; stderr: string; instance: AppInstance | null }> {
    return this.http.post<{ ok: boolean; stdout: string; stderr: string; instance: AppInstance | null }>(
      `${API_BASE}/api/instances/${encodeURIComponent(worktree)}/start`, {});
  }

  // Stop a worktree's instance (kills the launcher process tree, clears its state).
  stopInstance(worktree: string): Observable<{ ok: boolean; stdout: string; stderr: string }> {
    return this.http.post<{ ok: boolean; stdout: string; stderr: string }>(
      `${API_BASE}/api/instances/${encodeURIComponent(worktree)}/stop`, {});
  }

  // ── Saved panel layouts ──
  listLayouts(): Observable<string[]> {
    return this.http.get<{ names: string[] }>(`${API_BASE}/api/layouts`).pipe(
      map(r => r.names),
    );
  }

  getLayout(name: string): Observable<Panel[]> {
    return this.http.get<Panel[]>(`${API_BASE}/api/layouts/${encodeURIComponent(name)}`);
  }

  saveLayout(name: string, panels: Panel[]): Observable<void> {
    return this.http.put<void>(`${API_BASE}/api/layouts/${encodeURIComponent(name)}`, panels);
  }

  deleteLayout(name: string): Observable<void> {
    return this.http.delete<void>(`${API_BASE}/api/layouts/${encodeURIComponent(name)}`);
  }
}
