import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Application, ApplicationInput, DbStoreStatus } from '../models/application.model';
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

  // ── Applications (rows in the single store DB) ──
  listApplications(): Observable<{ applications: Application[] }> {
    return this.http.get<{ applications: Application[] }>(`${API_BASE}/api/applications`);
  }

  createApplication(input: ApplicationInput): Observable<Application> {
    return this.http.post<Application>(`${API_BASE}/api/applications`, input);
  }

  updateApplication(appId: string, input: ApplicationInput): Observable<Application> {
    return this.http.put<Application>(`${API_BASE}/api/applications/${appId}`, input);
  }

  deleteApplication(appId: string): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(`${API_BASE}/api/applications/${appId}`);
  }

  // ── Active selection (which application drives data retrieval) ──
  getActive(): Observable<{ activeId: string | null }> {
    return this.http.get<{ activeId: string | null }>(`${API_BASE}/api/applications/active`);
  }

  setActive(id: string | null): Observable<{ activeId: string | null }> {
    return this.http.put<{ activeId: string | null }>(`${API_BASE}/api/applications/active`, { id });
  }

  // ── Epics (scoped to the active application) ──
  listEpics(appId: string): Observable<{ epics: Epic[] }> {
    return this.http.get<{ epics: Epic[] }>(`${API_BASE}/api/applications/${appId}/epics`);
  }

  createEpic(appId: string, input: EpicInput): Observable<Epic> {
    return this.http.post<Epic>(`${API_BASE}/api/applications/${appId}/epics`, input);
  }

  updateEpic(appId: string, epicId: string, input: EpicInput): Observable<Epic> {
    return this.http.put<Epic>(`${API_BASE}/api/applications/${appId}/epics/${epicId}`, input);
  }

  deleteEpic(appId: string, epicId: string): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(`${API_BASE}/api/applications/${appId}/epics/${epicId}`);
  }

  // ── Notes (scoped to the active application) ──
  listNotes(appId: string): Observable<{ notes: Note[] }> {
    return this.http.get<{ notes: Note[] }>(`${API_BASE}/api/applications/${appId}/notes`);
  }

  createNote(appId: string, input: NoteInput): Observable<Note> {
    return this.http.post<Note>(`${API_BASE}/api/applications/${appId}/notes`, input);
  }

  updateNote(appId: string, noteId: string, input: NoteInput): Observable<Note> {
    return this.http.put<Note>(`${API_BASE}/api/applications/${appId}/notes/${noteId}`, input);
  }

  deleteNote(appId: string, noteId: string): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(`${API_BASE}/api/applications/${appId}/notes/${noteId}`);
  }

  // ── Live activity feed (ntfy mirror over WebSocket) ──
  // Mirrors API_BASE's host derivation so it works over Tailscale (wss on https).
  activityWsUrl(): string {
    const proto = typeof window !== 'undefined' && window.location?.protocol === 'https:' ? 'wss' : 'ws';
    const host = typeof window !== 'undefined' && window.location?.hostname ? window.location.hostname : 'localhost';
    return `${proto}://${host}:${API_PORT}/api/activity`;
  }

  // ── Business rules (scoped to the active application) ──
  listBusinessRules(appId: string): Observable<{ rules: AppBusinessRule[] }> {
    return this.http.get<{ rules: AppBusinessRule[] }>(`${API_BASE}/api/applications/${appId}/business-rules`);
  }

  createBusinessRule(appId: string, input: AppBusinessRuleInput): Observable<AppBusinessRule> {
    return this.http.post<AppBusinessRule>(`${API_BASE}/api/applications/${appId}/business-rules`, input);
  }

  updateBusinessRule(appId: string, brId: string, input: AppBusinessRuleInput): Observable<AppBusinessRule> {
    return this.http.put<AppBusinessRule>(`${API_BASE}/api/applications/${appId}/business-rules/${brId}`, input);
  }

  deleteBusinessRule(appId: string, brId: string): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(`${API_BASE}/api/applications/${appId}/business-rules/${brId}`);
  }

  // ── Additional agent information (extra context attached to a BR) ──
  listAgentInfo(appId: string): Observable<{ info: BrAgentInfo[] }> {
    return this.http.get<{ info: BrAgentInfo[] }>(`${API_BASE}/api/applications/${appId}/agent-info`);
  }

  createAgentInfo(appId: string, input: BrAgentInfoInput): Observable<BrAgentInfo> {
    return this.http.post<BrAgentInfo>(`${API_BASE}/api/applications/${appId}/agent-info`, input);
  }

  updateAgentInfo(appId: string, infoId: string, input: BrAgentInfoInput): Observable<BrAgentInfo> {
    return this.http.put<BrAgentInfo>(`${API_BASE}/api/applications/${appId}/agent-info/${infoId}`, input);
  }

  deleteAgentInfo(appId: string, infoId: string): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(`${API_BASE}/api/applications/${appId}/agent-info/${infoId}`);
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
