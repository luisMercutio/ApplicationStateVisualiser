import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Panel } from '../models/panel.model';
import { ClaudeSession } from '../models/app-data.model';

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

  // The live claude-* tmux sessions (running state derived from tmux server-side).
  getClaudeSessions(): Observable<ClaudeSession[]> {
    return this.http.get<{ sessions: ClaudeSession[] }>(
      `${API_BASE}/api/claude/sessions`, { headers: { 'Cache-Control': 'no-cache' } })
      .pipe(map(r => r.sessions));
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
