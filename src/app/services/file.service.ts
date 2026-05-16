import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { FileTreeNode } from '../models/uc.model';
import { Panel } from '../models/panel.model';

const API_BASE = 'http://localhost:3001';

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

  ping(): Observable<{ ok: boolean }> {
    return this.http.get<{ ok: boolean }>(`${API_BASE}/api/ping`);
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
