import { Component, Input, OnInit, OnChanges, OnDestroy, SimpleChanges, inject, signal } from '@angular/core';
import { Store } from '@ngrx/store';
import { MatIconModule } from '@angular/material/icon';
import { MatExpansionModule } from '@angular/material/expansion';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Subscription } from 'rxjs';
import { selectFileContent, selectFileLoading, selectFileError } from '../../../store/files/files.selectors';
import { FilesActions } from '../../../store/files/files.actions';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

interface ReportSection { heading: string; html: SafeHtml; }

@Component({
  selector: 'app-test-report',
  standalone: true,
  imports: [MatIconModule, MatExpansionModule],
  template: `
    <div class="panel-content">
      @if (loading()) {
        <div class="placeholder-empty"><mat-icon>hourglass_top</mat-icon> Loading...</div>
      } @else if (!filePath) {
        <div class="placeholder-empty"><mat-icon>science</mat-icon> Select a UC</div>
      } @else if (error()) {
        <div class="placeholder-empty"><mat-icon>science</mat-icon> Not yet generated</div>
      } @else {
        <div class="report-header">
          <span class="report-title">{{ title() }}</span>
          @if (status()) {
            <span class="status-badge" [class]="'status-' + status()!.toLowerCase().replace(' ', '-')">
              {{ status() }}
            </span>
          }
        </div>
        <mat-accordion multi>
          @for (sec of sections(); track sec.heading) {
            <mat-expansion-panel [expanded]="true">
              <mat-expansion-panel-header>
                <mat-panel-title>{{ sec.heading }}</mat-panel-title>
              </mat-expansion-panel-header>
              <div class="section-body" [innerHTML]="sec.html"></div>
            </mat-expansion-panel>
          }
        </mat-accordion>
      }
    </div>
  `,
  styles: [`
    .report-header { display: flex; align-items: center; gap: 10px; padding: 10px 12px 6px; }
    .report-title { font-size: 13px; font-weight: 600; color: #333; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .status-badge { padding: 3px 10px; border-radius: 12px; font-size: 11px; font-weight: 700; text-transform: uppercase; flex-shrink: 0; }
    .status-clean { background: #c8e6c9; color: #2e7d32; }
    .status-needs_fix { background: #ffcdd2; color: #c62828; }
    .section-body { font-size: 13px; overflow-x: auto; }
    .section-body table { border-collapse: collapse; width: 100%; margin: 8px 0; }
    .section-body th { background: #f5f5f5; padding: 6px 10px; text-align: left; border-bottom: 2px solid #e0e0e0; font-size: 12px; color: #555; }
    .section-body td { padding: 6px 10px; border-bottom: 1px solid #f0f0f0; vertical-align: top; }
    .section-body code { background: #f5f5f5; padding: 1px 4px; border-radius: 3px; font-size: 12px; }
    .section-body pre { background: #f5f5f5; padding: 10px; border-radius: 4px; overflow-x: auto; font-size: 12px; }
    .section-body ul, .section-body ol { padding-left: 20px; margin: 6px 0; }
    .section-body li { margin: 3px 0; }
  `],
})
export class TestReportComponent implements OnInit, OnChanges, OnDestroy {
  @Input() filePath = '';
  private store = inject(Store);
  private sanitizer = inject(DomSanitizer);
  private subs: Subscription[] = [];

  loading = signal(false);
  error = signal<string | null>(null);
  title = signal('');
  status = signal<string | null>(null);
  sections = signal<ReportSection[]>([]);

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
        const parsed = parseReport(content);
        this.title.set(parsed.title);
        this.status.set(parsed.status);
        this.sections.set(parsed.sections.map(s => ({
          heading: s.heading,
          html: this.sanitizer.bypassSecurityTrustHtml(DOMPurify.sanitize(marked.parse(s.body) as string)),
        })));
      }),
    );
  }
}

interface ParsedReport {
  title: string;
  status: string | null;
  sections: Array<{ heading: string; body: string }>;
}

function parseReport(md: string): ParsedReport {
  const lines = md.split('\n');
  let title = '';
  let status: string | null = null;
  const sections: Array<{ heading: string; body: string }> = [];
  let current: { heading: string; lines: string[] } | null = null;

  for (const line of lines) {
    const h1 = line.match(/^#\s+(.+)/);
    if (h1) { title = h1[1].trim(); continue; }

    const h2 = line.match(/^##\s+(.+)/);
    if (h2) {
      if (current) sections.push({ heading: current.heading, body: current.lines.join('\n') });
      current = { heading: h2[1].trim(), lines: [] };
      continue;
    }

    if (current) {
      // Extract status value from the ## Status section body
      if (current.heading === 'Status') {
        const val = line.trim();
        if (val === 'CLEAN' || val === 'NEEDS_FIX') { status = val; }
      }
      current.lines.push(line);
    }
  }
  if (current) sections.push({ heading: current.heading, body: current.lines.join('\n') });

  return { title, status, sections };
}
