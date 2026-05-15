import { Component, Input, OnInit, OnChanges, OnDestroy, SimpleChanges, inject, signal } from '@angular/core';
import { Store } from '@ngrx/store';
import { MatIconModule } from '@angular/material/icon';
import { MatExpansionModule } from '@angular/material/expansion';
import { Subscription } from 'rxjs';
import { selectFileContent, selectFileLoading, selectFileError } from '../../../store/files/files.selectors';
import { FilesActions } from '../../../store/files/files.actions';
import * as yaml from 'js-yaml';

interface Endpoint { method: string; path: string; summary: string; description: string; parameters?: any[]; responses?: any; requestBody?: any; }
interface ApiInfo { title: string; version: string; description?: string; }

@Component({
  selector: 'app-openapi-view',
  standalone: true,
  imports: [MatIconModule, MatExpansionModule],
  template: `
    <div class="panel-content">
      @if (loading()) {
        <div class="placeholder-empty"><mat-icon>hourglass_top</mat-icon> Loading...</div>
      } @else if (!filePath) {
        <div class="placeholder-empty"><mat-icon>api</mat-icon> Select a UC</div>
      } @else if (error()) {
        <div class="placeholder-empty"><mat-icon>api</mat-icon> Not yet generated</div>
      } @else if (info()) {
        <div class="api-info">
          <h3>{{ info()!.title }}</h3>
          <span class="version">v{{ info()!.version }}</span>
          @if (info()!.description) { <p class="desc">{{ info()!.description }}</p> }
        </div>
        <mat-accordion multi>
          @for (ep of endpoints(); track ep.path + ep.method) {
            <mat-expansion-panel>
              <mat-expansion-panel-header>
                <div class="ep-header">
                  <span class="method-badge" [class]="'method-' + ep.method.toLowerCase()">{{ ep.method.toUpperCase() }}</span>
                  <span class="ep-path">{{ ep.path }}</span>
                  <span class="ep-summary">{{ ep.summary }}</span>
                </div>
              </mat-expansion-panel-header>
              @if (ep.description) { <p class="ep-desc">{{ ep.description }}</p> }
              @if (ep.parameters?.length) {
                <div class="section-label">Parameters</div>
                <table class="param-table">
                  <thead><tr><th>Name</th><th>In</th><th>Type</th><th>Req</th><th>Description</th></tr></thead>
                  <tbody>
                    @for (p of ep.parameters!; track p.name) {
                      <tr>
                        <td class="mono">{{ p.name }}</td>
                        <td>{{ p.in }}</td>
                        <td class="mono">{{ p.schema?.type ?? '-' }}</td>
                        <td>{{ p.required ? '✓' : '' }}</td>
                        <td>{{ p.description ?? '' }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              }
              @if (ep.responses) {
                <div class="section-label">Responses</div>
                @for (code of responseKeys(ep.responses); track code) {
                  <div class="response-row">
                    <span class="resp-code" [class.resp-ok]="code.startsWith('2')" [class.resp-err]="code.startsWith('4') || code.startsWith('5')">{{ code }}</span>
                    <span>{{ ep.responses[code]?.description }}</span>
                  </div>
                }
              }
            </mat-expansion-panel>
          }
        </mat-accordion>
      }
    </div>
  `,
  styles: [`
    .api-info { padding: 8px 0 12px; border-bottom: 1px solid #eee; margin-bottom: 12px; }
    .api-info h3 { margin: 0 0 4px; font-size: 16px; }
    .version { font-size: 11px; background: #e8eaf6; color: #3f51b5; padding: 2px 8px; border-radius: 10px; }
    .desc { margin: 8px 0 0; font-size: 13px; color: #666; }
    .ep-header { display: flex; align-items: center; gap: 10px; width: 100%; flex-wrap: wrap; }
    .method-badge { padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; color: white; white-space: nowrap; }
    .method-get { background: #4caf50; } .method-post { background: #2196f3; }
    .method-put { background: #ff9800; } .method-patch { background: #ff9800; } .method-delete { background: #f44336; }
    .ep-path { font-family: monospace; font-size: 13px; font-weight: 500; }
    .ep-summary { font-size: 12px; color: #888; }
    .ep-desc { font-size: 13px; color: #555; margin: 0 0 8px; }
    .section-label { font-size: 11px; font-weight: 700; text-transform: uppercase; color: #888; margin: 12px 0 6px; letter-spacing: 0.5px; }
    .param-table { border-collapse: collapse; width: 100%; font-size: 12px; }
    .param-table th, .param-table td { border: 1px solid #e0e0e0; padding: 4px 8px; text-align: left; }
    .param-table th { background: #f5f5f5; }
    .mono { font-family: monospace; }
    .response-row { display: flex; align-items: center; gap: 10px; padding: 4px 0; font-size: 13px; }
    .resp-code { padding: 2px 8px; border-radius: 4px; font-family: monospace; font-weight: 600; background: #eee; }
    .resp-ok { background: #c8e6c9; color: #2e7d32; } .resp-err { background: #ffcdd2; color: #c62828; }
  `],
})
export class OpenApiViewComponent implements OnInit, OnChanges, OnDestroy {
  @Input() filePath = '';
  private store = inject(Store);
  private subs: Subscription[] = [];

  loading = signal(false);
  error = signal<string | null>(null);
  info = signal<ApiInfo | null>(null);
  endpoints = signal<Endpoint[]>([]);

  ngOnInit(): void { this.subscribe(); }
  ngOnChanges(c: SimpleChanges): void {
    if (c['filePath'] && !c['filePath'].firstChange) { this.clearSubs(); this.subscribe(); }
  }
  ngOnDestroy(): void { this.clearSubs(); }
  private clearSubs(): void { this.subs.forEach(s => s.unsubscribe()); this.subs = []; }

  private subscribe(): void {
    if (!this.filePath) return;
    this.store.dispatch(FilesActions.loadFile({ path: this.filePath }));
    this.subs.push(
      this.store.select(selectFileLoading(this.filePath)).subscribe(v => this.loading.set(v)),
      this.store.select(selectFileError(this.filePath)).subscribe(v => this.error.set(v)),
      this.store.select(selectFileContent(this.filePath)).subscribe(content => {
        if (!content) return;
        try {
          const spec = yaml.load(content) as any;
          this.info.set({ title: spec?.info?.title ?? 'API', version: spec?.info?.version ?? '', description: spec?.info?.description });
          const eps: Endpoint[] = [];
          for (const [path, methods] of Object.entries<any>(spec?.paths ?? {})) {
            for (const [method, op] of Object.entries<any>(methods)) {
              if (op && typeof op === 'object') {
                eps.push({ method, path, summary: op.summary ?? '', description: op.description ?? '', parameters: op.parameters, responses: op.responses, requestBody: op.requestBody });
              }
            }
          }
          this.endpoints.set(eps);
        } catch {}
      }),
    );
  }

  responseKeys(responses: any): string[] { return Object.keys(responses ?? {}); }
}
