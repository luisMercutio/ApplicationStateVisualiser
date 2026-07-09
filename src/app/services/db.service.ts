import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  DbConnection, DbConnectionInput, DbPreview, DbStoreStatus, DbTableInfo, DbTestResult,
} from '../models/db-connection.model';
import { AppBusinessRule, AppBusinessRuleInput, BrAgentInfo, BrAgentInfoInput, Epic, EpicInput } from '../models/app-data.model';
import { Note, NoteInput } from '../models/note.model';
import { MethodologyFile, MethodologyFileMeta, MethodologyKind } from '../models/methodology-file.model';

// Mirror FileService's host derivation so the DB API works over localhost and
// over the network (e.g. a phone on Tailscale hitting http://<host>:4201 → API
// on :3001) without any per-environment config.
const API_PORT = 3001;
const API_BASE =
  typeof window !== 'undefined' && window.location?.hostname
    ? `${window.location.protocol}//${window.location.hostname}:${API_PORT}`
    : `http://localhost:${API_PORT}`;

@Injectable({ providedIn: 'root' })
export class DbService {
  private http = inject(HttpClient);

  status(): Observable<DbStoreStatus> {
    return this.http.get<DbStoreStatus>(`${API_BASE}/api/db/status`);
  }

  // ── Connection profiles (Store A) ──
  list(): Observable<DbConnection[]> {
    return this.http.get<DbConnection[]>(`${API_BASE}/api/db/connections`);
  }

  create(input: DbConnectionInput): Observable<DbConnection> {
    return this.http.post<DbConnection>(`${API_BASE}/api/db/connections`, input);
  }

  update(id: string, input: DbConnectionInput): Observable<DbConnection> {
    return this.http.put<DbConnection>(`${API_BASE}/api/db/connections/${id}`, input);
  }

  remove(id: string): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(`${API_BASE}/api/db/connections/${id}`);
  }

  testParams(input: DbConnectionInput): Observable<DbTestResult> {
    return this.http.post<DbTestResult>(`${API_BASE}/api/db/connections/test`, input);
  }

  testExisting(id: string): Observable<DbTestResult> {
    return this.http.post<DbTestResult>(`${API_BASE}/api/db/connections/${id}/test`, {});
  }

  // ── Active selection (which target drives data retrieval) ──
  getActive(): Observable<{ activeId: string | null }> {
    return this.http.get<{ activeId: string | null }>(`${API_BASE}/api/db/active`);
  }

  setActive(id: string | null): Observable<{ activeId: string | null }> {
    return this.http.put<{ activeId: string | null }>(`${API_BASE}/api/db/active`, { id });
  }

  // ── State retrieval / browse ──
  listTables(id: string): Observable<{ tables: DbTableInfo[] }> {
    return this.http.get<{ tables: DbTableInfo[] }>(`${API_BASE}/api/db/connections/${id}/tables`);
  }

  previewTable(id: string, table: string, limit = 50): Observable<DbPreview> {
    const params = new HttpParams().set('limit', String(limit));
    return this.http.get<DbPreview>(
      `${API_BASE}/api/db/connections/${id}/tables/${encodeURIComponent(table)}/rows`, { params });
  }

  // ── Epics (in the active connection's application DB) ──
  listEpics(id: string): Observable<{ epics: Epic[] }> {
    return this.http.get<{ epics: Epic[] }>(`${API_BASE}/api/db/connections/${id}/epics`);
  }

  createEpic(id: string, input: EpicInput): Observable<Epic> {
    return this.http.post<Epic>(`${API_BASE}/api/db/connections/${id}/epics`, input);
  }

  updateEpic(id: string, epicId: string, input: EpicInput): Observable<Epic> {
    return this.http.put<Epic>(`${API_BASE}/api/db/connections/${id}/epics/${epicId}`, input);
  }

  deleteEpic(id: string, epicId: string): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(`${API_BASE}/api/db/connections/${id}/epics/${epicId}`);
  }

  // ── Notes (in the active connection's application DB) ──
  listNotes(id: string): Observable<{ notes: Note[] }> {
    return this.http.get<{ notes: Note[] }>(`${API_BASE}/api/db/connections/${id}/notes`);
  }

  createNote(id: string, input: NoteInput): Observable<Note> {
    return this.http.post<Note>(`${API_BASE}/api/db/connections/${id}/notes`, input);
  }

  updateNote(id: string, noteId: string, input: NoteInput): Observable<Note> {
    return this.http.put<Note>(`${API_BASE}/api/db/connections/${id}/notes/${noteId}`, input);
  }

  deleteNote(id: string, noteId: string): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(`${API_BASE}/api/db/connections/${id}/notes/${noteId}`);
  }

  // ── Live activity feed (ntfy mirror over WebSocket) ──
  // Mirrors API_BASE's host derivation so it works over Tailscale (wss on https).
  activityWsUrl(): string {
    const proto = typeof window !== 'undefined' && window.location?.protocol === 'https:' ? 'wss' : 'ws';
    const host = typeof window !== 'undefined' && window.location?.hostname ? window.location.hostname : 'localhost';
    return `${proto}://${host}:${API_PORT}/api/activity`;
  }

  // ── Business rules (in the active connection's application DB) ──
  listBusinessRules(id: string): Observable<{ rules: AppBusinessRule[] }> {
    return this.http.get<{ rules: AppBusinessRule[] }>(`${API_BASE}/api/db/connections/${id}/business-rules`);
  }

  createBusinessRule(id: string, input: AppBusinessRuleInput): Observable<AppBusinessRule> {
    return this.http.post<AppBusinessRule>(`${API_BASE}/api/db/connections/${id}/business-rules`, input);
  }

  updateBusinessRule(id: string, brId: string, input: AppBusinessRuleInput): Observable<AppBusinessRule> {
    return this.http.put<AppBusinessRule>(`${API_BASE}/api/db/connections/${id}/business-rules/${brId}`, input);
  }

  deleteBusinessRule(id: string, brId: string): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(`${API_BASE}/api/db/connections/${id}/business-rules/${brId}`);
  }

  // ── Additional agent information (extra context attached to a BR) ──
  listAgentInfo(id: string): Observable<{ info: BrAgentInfo[] }> {
    return this.http.get<{ info: BrAgentInfo[] }>(`${API_BASE}/api/db/connections/${id}/agent-info`);
  }

  createAgentInfo(id: string, input: BrAgentInfoInput): Observable<BrAgentInfo> {
    return this.http.post<BrAgentInfo>(`${API_BASE}/api/db/connections/${id}/agent-info`, input);
  }

  updateAgentInfo(id: string, infoId: string, input: BrAgentInfoInput): Observable<BrAgentInfo> {
    return this.http.put<BrAgentInfo>(`${API_BASE}/api/db/connections/${id}/agent-info/${infoId}`, input);
  }

  deleteAgentInfo(id: string, infoId: string): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(`${API_BASE}/api/db/connections/${id}/agent-info/${infoId}`);
  }

  // ── Methodology files (master DB: agents + commands) ──
  listMethodology(): Observable<{ files: MethodologyFileMeta[] }> {
    return this.http.get<{ files: MethodologyFileMeta[] }>(`${API_BASE}/api/methodology`);
  }

  getMethodology(kind: MethodologyKind, name: string): Observable<MethodologyFile> {
    return this.http.get<MethodologyFile>(`${API_BASE}/api/methodology/${kind}/${encodeURIComponent(name)}`);
  }

  saveMethodology(kind: MethodologyKind, name: string, content: string): Observable<MethodologyFile> {
    return this.http.put<MethodologyFile>(`${API_BASE}/api/methodology/${kind}/${encodeURIComponent(name)}`, { content });
  }
}
