import { Component, Input, OnInit, OnChanges, OnDestroy, SimpleChanges, inject, signal } from '@angular/core';
import { Store } from '@ngrx/store';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { MatIconModule } from '@angular/material/icon';
import { Subscription } from 'rxjs';
import { selectFileContent, selectFileLoading, selectFileError } from '../../../store/files/files.selectors';
import { FilesActions } from '../../../store/files/files.actions';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

@Component({
  selector: 'app-diff-view',
  standalone: true,
  imports: [MatIconModule],
  template: `
    <div class="panel-content">
      @if (loading()) {
        <div class="placeholder-empty"><mat-icon>hourglass_top</mat-icon> Loading...</div>
      } @else if (!filePath) {
        <div class="placeholder-empty"><mat-icon>difference</mat-icon> Select a UC</div>
      } @else if (error()) {
        <div class="placeholder-empty"><mat-icon>difference</mat-icon> Not yet generated</div>
      } @else {
        <div class="diff-body" [innerHTML]="html()"></div>
      }
    </div>
  `,
  styles: [`
    .diff-body { font-size: 13px; line-height: 1.6; }
    .diff-body ::ng-deep .diff-section-new { background: rgba(40,167,69,0.08); border-left: 4px solid #28a745; padding: 6px 10px; margin: 8px 0; border-radius: 0 4px 4px 0; }
    .diff-body ::ng-deep .diff-section-modified { background: rgba(255,193,7,0.12); border-left: 4px solid #ffc107; padding: 6px 10px; margin: 8px 0; border-radius: 0 4px 4px 0; }
    .diff-body ::ng-deep .diff-section-removed { background: rgba(220,53,69,0.08); border-left: 4px solid #dc3545; padding: 6px 10px; margin: 8px 0; border-radius: 0 4px 4px 0; }
    .diff-body ::ng-deep h2, .diff-body ::ng-deep h3 { margin: 12px 0 4px; font-size: 14px; }
    .diff-body ::ng-deep code { background: #f5f5f5; padding: 1px 4px; border-radius: 3px; font-size: 12px; }
    .diff-body ::ng-deep table { border-collapse: collapse; width: 100%; font-size: 12px; }
    .diff-body ::ng-deep th, .diff-body ::ng-deep td { border: 1px solid #e0e0e0; padding: 4px 8px; }
  `],
})
export class DiffViewComponent implements OnInit, OnChanges, OnDestroy {
  @Input() filePath = '';
  private store = inject(Store);
  private sanitizer = inject(DomSanitizer);
  private subs: Subscription[] = [];

  loading = signal(false);
  error = signal<string | null>(null);
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
      this.store.select(selectFileContent(this.filePath)).subscribe(content => {
        if (!content) return;
        const wrapped = wrapDiffSections(content);
        const raw = marked.parse(wrapped) as string;
        this.html.set(this.sanitizer.bypassSecurityTrustHtml(DOMPurify.sanitize(raw, { ADD_ATTR: ['class'] })));
      }),
    );
  }
}

function wrapDiffSections(md: string): string {
  const lines = md.split('\n');
  const out: string[] = [];
  let inSection = false;
  for (const line of lines) {
    const m = line.match(/^#{1,3}\s+(NEW|MODIFIED|REMOVED)\b/i);
    if (m) {
      if (inSection) out.push('</div>');
      out.push(`<div class="diff-section-${m[1].toLowerCase()}">`);
      out.push(line);
      inSection = true;
    } else if (inSection && /^#{1,3}\s+/.test(line) && !/(NEW|MODIFIED|REMOVED)/i.test(line)) {
      out.push('</div>');
      inSection = false;
      out.push(line);
    } else {
      out.push(line);
    }
  }
  if (inSection) out.push('</div>');
  return out.join('\n');
}
