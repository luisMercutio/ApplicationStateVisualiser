import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { FileTreeNode } from '../models/uc.model';
import { Panel } from '../models/panel.model';
import { BrPosition } from '../models/business-rule.model';
import { RuleEntry } from '../models/rule-index.model';

// Derive the API host from the page's own host so the app works both on
// localhost and when reached over the network (e.g. a phone on Tailscale
// loading http://<tailscale-ip>:4201 → API at http://<tailscale-ip>:3001).
// Override with ?apiPort= or a build-time global if the server port changes.
const API_PORT = 3001;
const API_BASE =
  typeof window !== 'undefined' && window.location?.hostname
    ? `${window.location.protocol}//${window.location.hostname}:${API_PORT}`
    : `http://localhost:${API_PORT}`;

@Injectable({ providedIn: 'root' })
export class FileService {
  private http = inject(HttpClient);

  getFile(root: string, filePath: string): Observable<string> {
    const params = new HttpParams().set('root', root).set('path', filePath);
    return this.http.get(`${API_BASE}/api/file`, {
      params,
      responseType: 'text',
      headers: { 'Cache-Control': 'no-cache' },
    });
  }

  getTree(root: string): Observable<{ tree: FileTreeNode[] }> {
    const params = new HttpParams().set('root', root);
    return this.http.get<{ tree: FileTreeNode[] }>(`${API_BASE}/api/tree`, { params });
  }

  getMockupUrl(root: string, filePath: string): string {
    return `${API_BASE}/api/mockup?root=${encodeURIComponent(root)}&path=${encodeURIComponent(filePath)}`;
  }

  // ── Resources (methodology files in this repo: agents, commands, schemas) ──
  getResourcesTree(): Observable<{ tree: FileTreeNode[] }> {
    return this.http.get<{ tree: FileTreeNode[] }>(`${API_BASE}/api/resources/tree`);
  }

  getResourceFile(filePath: string): Observable<string> {
    const params = new HttpParams().set('path', filePath);
    return this.http.get(`${API_BASE}/api/resources/file`, {
      params,
      responseType: 'text',
      headers: { 'Cache-Control': 'no-cache' },
    });
  }

  saveResourceFile(filePath: string, content: string): Observable<void> {
    const params = new HttpParams().set('path', filePath);
    return this.http.put<void>(`${API_BASE}/api/resources/file`, { content }, { params });
  }

  syncMethodology(target: string): Observable<{ count: number; copied: string[]; target: string }> {
    return this.http.post<{ count: number; copied: string[]; target: string }>(
      `${API_BASE}/api/sync-methodology`, { target });
  }

  // ── BR-first rule index (.claude/rules/_index.json) ──
  getRulesIndex(root: string): Observable<RuleEntry[]> {
    const params = new HttpParams().set('root', root);
    return this.http.get<RuleEntry[]>(`${API_BASE}/api/rules`, { params });
  }

  // ── Business Rule node positions (app-owned layout) ──
  getBrPositions(root: string): Observable<Record<string, BrPosition>> {
    const params = new HttpParams().set('root', root);
    return this.http.get<Record<string, BrPosition>>(`${API_BASE}/api/br-positions`, { params });
  }

  saveBrPositions(root: string, positions: Record<string, BrPosition>): Observable<void> {
    const params = new HttpParams().set('root', root);
    return this.http.put<void>(`${API_BASE}/api/br-positions`, positions, { params });
  }

  // ── Business Rule display order (app-owned drag-to-reorder list) ──
  getBrOrder(root: string): Observable<string[]> {
    const params = new HttpParams().set('root', root);
    return this.http.get<string[]>(`${API_BASE}/api/br-order`, { params });
  }

  saveBrOrder(root: string, order: string[]): Observable<void> {
    const params = new HttpParams().set('root', root);
    return this.http.put<void>(`${API_BASE}/api/br-order`, order, { params });
  }

  ping(): Observable<{ ok: boolean }> {
    return this.http.get<{ ok: boolean }>(`${API_BASE}/api/ping`);
  }

  getConfig(): Observable<{ standardUrl: string | null }> {
    return this.http.get<{ standardUrl: string | null }>(`${API_BASE}/api/config`);
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
