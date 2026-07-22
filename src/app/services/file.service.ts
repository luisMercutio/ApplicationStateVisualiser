import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Panel } from '../models/panel.model';
import { ClaudeSession, ConversationMessage } from '../models/app-data.model';
import { GitCommit, GitWorktree } from '../models/git.model';

// Derive the API host from the page's own host so the app works both on
// localhost and when reached over the network (e.g. a phone on Tailscale
// loading http://<tailscale-ip>:4201 → API at http://<tailscale-ip>:3001).
const API_PORT = 3001;
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

  // The archived conversation for a session, reduced to prompt/answer turns only.
  getClaudeConversation(session: string):
    Observable<{ session: string; sessionId: string; messages: ConversationMessage[] }> {
    return this.http.get<{ session: string; sessionId: string; messages: ConversationMessage[] }>(
      `${API_BASE}/api/claude/sessions/${encodeURIComponent(session)}/conversation`,
      { headers: { 'Cache-Control': 'no-cache' } });
  }

  // ── Git history + worktrees (read-only views over the repo's own git) ──
  getGitWorktrees(): Observable<GitWorktree[]> {
    return this.http.get<{ worktrees: GitWorktree[] }>(
      `${API_BASE}/api/git/worktrees`, { headers: { 'Cache-Control': 'no-cache' } })
      .pipe(map(r => r.worktrees));
  }

  // ref: a branch name or sha to scope the log to one worktree (omit for HEAD).
  getGitLog(ref?: string, limit = 100): Observable<GitCommit[]> {
    let params = new HttpParams().set('limit', String(limit));
    if (ref) params = params.set('ref', ref);
    return this.http.get<{ commits: GitCommit[] }>(
      `${API_BASE}/api/git/log`, { params, headers: { 'Cache-Control': 'no-cache' } })
      .pipe(map(r => r.commits));
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
