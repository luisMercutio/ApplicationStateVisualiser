import { Component, Input, OnInit, OnChanges, OnDestroy, SimpleChanges, inject, signal } from '@angular/core';
import { Store } from '@ngrx/store';
import { MatIconModule } from '@angular/material/icon';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Subscription } from 'rxjs';
import { selectFileContent, selectFileLoading, selectFileError } from '../../../store/files/files.selectors';
import { FilesActions } from '../../../store/files/files.actions';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

interface BrSection { id: string; html: SafeHtml; }

@Component({
  selector: 'app-test-state',
  standalone: true,
  imports: [MatIconModule, MatExpansionModule, MatSelectModule, MatFormFieldModule, FormsModule],
  template: `
    <div class="panel-content">
      @if (loading()) {
        <div class="placeholder-empty"><mat-icon>hourglass_top</mat-icon> Loading...</div>
      } @else if (!filePath) {
        <div class="placeholder-empty"><mat-icon>checklist</mat-icon> Select a UC</div>
      } @else if (error()) {
        <div class="placeholder-empty"><mat-icon>checklist</mat-icon> Not yet generated</div>
      } @else {
        <div class="filters">
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Application</mat-label>
            <mat-select [(ngModel)]="filterApp">
              <mat-option value="">All</mat-option>
              <mat-option value="frontend">Frontend</mat-option>
              <mat-option value="backend">Backend</mat-option>
            </mat-select>
          </mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Type</mat-label>
            <mat-select [(ngModel)]="filterType">
              <mat-option value="">All</mat-option>
              <mat-option value="unit">Unit</mat-option>
              <mat-option value="integration">Integration</mat-option>
              <mat-option value="component">Component</mat-option>
              <mat-option value="e2e">E2E</mat-option>
            </mat-select>
          </mat-form-field>
        </div>
        <mat-accordion multi>
          @for (br of sections(); track br.id) {
            <mat-expansion-panel [expanded]="true">
              <mat-expansion-panel-header>
                <mat-panel-title>{{ br.id }}</mat-panel-title>
              </mat-expansion-panel-header>
              <div [innerHTML]="br.html"></div>
            </mat-expansion-panel>
          }
        </mat-accordion>
      }
    </div>
  `,
  styles: [`
    .filters { display: flex; gap: 12px; margin-bottom: 12px; }
    .filters mat-form-field { flex: 1; }
  `],
})
export class TestStateComponent implements OnInit, OnChanges, OnDestroy {
  @Input() filePath = '';
  private store = inject(Store);
  private sanitizer = inject(DomSanitizer);
  private subs: Subscription[] = [];

  loading = signal(false);
  error = signal<string | null>(null);
  sections = signal<BrSection[]>([]);
  filterApp = '';
  filterType = '';

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
        const secs = parseBrSections(content);
        this.sections.set(secs.map(s => ({
          id: s.id,
          html: this.sanitizer.bypassSecurityTrustHtml(DOMPurify.sanitize(marked.parse(s.body) as string)),
        })));
      }),
    );
  }
}

function parseBrSections(md: string): Array<{ id: string; body: string }> {
  const lines = md.split('\n');
  const sections: Array<{ id: string; body: string }> = [];
  let current: { id: string; lines: string[] } | null = null;
  for (const line of lines) {
    const match = line.match(/^#{1,3}\s+(BR[-\s]\S+)/i);
    if (match) {
      if (current) sections.push({ id: current.id, body: current.lines.join('\n') });
      current = { id: match[1], lines: [] };
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (current) sections.push({ id: current.id, body: current.lines.join('\n') });
  return sections;
}
