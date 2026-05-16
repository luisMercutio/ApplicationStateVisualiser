import { Component, Input, OnInit, OnChanges, OnDestroy, SimpleChanges, inject, signal } from '@angular/core';
import { Store } from '@ngrx/store';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { MatIconModule } from '@angular/material/icon';
import { Subscription } from 'rxjs';
import { selectFileContent, selectFileLoading, selectFileError } from '../../../store/files/files.selectors';
import { FilesActions } from '../../../store/files/files.actions';
import { LoadingStateComponent } from '../../loading-state/loading-state.component';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

interface Frontmatter { type?: string; uc?: string; status?: string; updated?: string; }

@Component({
  selector: 'app-suggestion',
  standalone: true,
  imports: [MatIconModule, LoadingStateComponent],
  template: `
    <div class="panel-content">
      @if (loading() || error()) {
        <app-loading-state [loading]="loading()" [error]="error()"></app-loading-state>
      } @else if (!filePath) {
        <div class="placeholder-empty"><mat-icon>description</mat-icon> Select a UC</div>
      } @else if (fm()) {
        <div class="fm-banner" [class]="'status-' + (fm()?.status ?? 'draft').toLowerCase()">
          <span class="uc-chip">{{ fm()?.uc }}</span>
          <span class="status-chip">{{ fm()?.status }}</span>
          <span class="updated">Updated: {{ fm()?.updated }}</span>
        </div>
        <div class="md-body" [innerHTML]="html()"></div>
      }
    </div>
  `,
  styles: [`
    .fm-banner { display: flex; align-items: center; gap: 10px; padding: 8px 12px; border-radius: 6px; margin-bottom: 12px; flex-wrap: wrap; }
    .fm-banner.status-draft { background: #f5f5f5; border: 1px solid #e0e0e0; }
    .fm-banner.status-approved { background: #e3f2fd; border: 1px solid #90caf9; }
    .fm-banner.status-implemented { background: #e8f5e9; border: 1px solid #a5d6a7; }
    .uc-chip { font-weight: 700; color: #3f51b5; font-family: monospace; font-size: 14px; }
    .status-chip { padding: 2px 10px; border-radius: 12px; font-size: 12px; font-weight: 600; background: rgba(0,0,0,0.08); }
    .updated { font-size: 12px; color: #888; margin-left: auto; }
    .md-body { font-size: 14px; line-height: 1.6; }
    .md-body ::ng-deep h1,h2,h3 { margin-top: 1em; }
    .md-body ::ng-deep code { background: #f5f5f5; padding: 2px 4px; border-radius: 3px; font-size: 12px; }
    .md-body ::ng-deep pre { background: #f5f5f5; padding: 12px; border-radius: 6px; overflow-x: auto; }
    .md-body ::ng-deep table { border-collapse: collapse; width: 100%; }
    .md-body ::ng-deep th, .md-body ::ng-deep td { border: 1px solid #e0e0e0; padding: 6px 10px; }
  `],
})
export class SuggestionComponent implements OnInit, OnChanges, OnDestroy {
  @Input() filePath = '';
  private store = inject(Store);
  private sanitizer = inject(DomSanitizer);
  private subs: Subscription[] = [];

  loading = signal(false);
  error = signal<string | null>(null);
  fm = signal<Frontmatter | null>(null);
  html = signal<SafeHtml>('');

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
      this.store.select(selectFileContent(this.filePath)).subscribe(c => {
        if (!c) return;
        const { frontmatter, body } = parseFrontmatter(c);
        this.fm.set(frontmatter);
        const raw = marked.parse(body) as string;
        this.html.set(this.sanitizer.bypassSecurityTrustHtml(DOMPurify.sanitize(raw)));
      }),
    );
  }
}

function parseFrontmatter(content: string): { frontmatter: Frontmatter; body: string } {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: content };
  const fm: Frontmatter = {};
  match[1].split('\n').forEach(line => {
    const idx = line.indexOf(':');
    if (idx > 0) fm[line.slice(0, idx).trim() as keyof Frontmatter] = line.slice(idx + 1).trim();
  });
  return { frontmatter: fm, body: match[2] };
}
