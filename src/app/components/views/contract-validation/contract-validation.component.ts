import { Component, Input, OnInit, OnChanges, OnDestroy, SimpleChanges, inject, signal } from '@angular/core';
import { Store } from '@ngrx/store';
import { MatIconModule } from '@angular/material/icon';
import { Subscription } from 'rxjs';
import { selectFileContent, selectFileLoading, selectFileError } from '../../../store/files/files.selectors';
import { FilesActions } from '../../../store/files/files.actions';
import { LoadingStateComponent } from '../../loading-state/loading-state.component';

interface ValidationResult {
  result: 'PASS' | 'FAIL';
  errors: Array<{ endpoint?: string; issue: string; severity?: string }>;
  warnings: Array<{ endpoint?: string; issue: string; severity?: string }>;
  missingCoverage?: string[];
}

@Component({
  selector: 'app-contract-validation',
  standalone: true,
  imports: [MatIconModule, LoadingStateComponent],
  template: `
    <div class="panel-content cv-panel">
      @if (loading() || error()) {
        <app-loading-state [loading]="loading()" [error]="error()"></app-loading-state>
      } @else if (!filePath) {
        <div class="placeholder-empty"><mat-icon>verified</mat-icon> Select a UC</div>
      } @else if (data()) {
        <div class="result-badge" [class.pass]="data()?.result === 'PASS'" [class.fail]="data()?.result === 'FAIL'">
          <mat-icon>{{ data()?.result === 'PASS' ? 'check_circle' : 'cancel' }}</mat-icon>
          <span>{{ data()?.result }}</span>
        </div>
        @if (data()?.errors?.length) {
          <div class="section-label error-label"><mat-icon>error</mat-icon> Errors ({{ data()!.errors.length }})</div>
          @for (e of data()!.errors; track $index) {
            <div class="card error-card">
              @if (e.endpoint) { <div class="card-endpoint">{{ e.endpoint }}</div> }
              <div class="card-issue">{{ e.issue }}</div>
            </div>
          }
        }
        @if (data()?.warnings?.length) {
          <div class="section-label warn-label"><mat-icon>warning</mat-icon> Warnings ({{ data()!.warnings.length }})</div>
          @for (w of data()!.warnings; track $index) {
            <div class="card warn-card">
              @if (w.endpoint) { <div class="card-endpoint">{{ w.endpoint }}</div> }
              <div class="card-issue">{{ w.issue }}</div>
            </div>
          }
        }
        @if (data()?.missingCoverage?.length) {
          <div class="section-label">Missing Coverage</div>
          @for (m of data()!.missingCoverage!; track $index) {
            <div class="card miss-card">{{ m }}</div>
          }
        }
        @if (!data()?.errors?.length && !data()?.warnings?.length) {
          <p class="all-clear">No issues found.</p>
        }
      }
    </div>
  `,
  styles: [`
    .cv-panel { display: flex; flex-direction: column; gap: 8px; }
    .result-badge { display: flex; align-items: center; justify-content: center; gap: 12px; padding: 20px; border-radius: 10px; font-size: 28px; font-weight: 700; margin-bottom: 8px; }
    .result-badge mat-icon { font-size: 36px; width: 36px; height: 36px; }
    .result-badge.pass { background: #e8f5e9; color: #2e7d32; }
    .result-badge.fail { background: #ffebee; color: #c62828; }
    .section-label { display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; padding: 4px 0; }
    .section-label mat-icon { font-size: 16px; width: 16px; height: 16px; }
    .error-label { color: #c62828; } .warn-label { color: #e65100; }
    .card { border-radius: 6px; padding: 8px 12px; font-size: 13px; margin-bottom: 6px; }
    .error-card { background: #ffebee; border-left: 4px solid #ef5350; }
    .warn-card { background: #fff8e1; border-left: 4px solid #ffb300; }
    .miss-card { background: #f5f5f5; border-left: 4px solid #9e9e9e; }
    .card-endpoint { font-family: monospace; font-size: 11px; color: #888; margin-bottom: 3px; }
    .all-clear { color: #4caf50; font-size: 14px; text-align: center; margin-top: 16px; }
  `],
})
export class ContractValidationComponent implements OnInit, OnChanges, OnDestroy {
  @Input() filePath = '';
  private store = inject(Store);
  private subs: Subscription[] = [];

  loading = signal(false);
  error = signal<string | null>(null);
  data = signal<ValidationResult | null>(null);

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
        try { this.data.set(JSON.parse(content)); } catch {}
      }),
    );
  }
}
