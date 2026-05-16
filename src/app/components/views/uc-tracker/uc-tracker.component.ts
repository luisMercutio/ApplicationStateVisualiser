import { Component, Input, OnInit, OnChanges, OnDestroy, SimpleChanges, inject, signal } from '@angular/core';
import { Store } from '@ngrx/store';
import { MatIconModule } from '@angular/material/icon';
import { Subscription } from 'rxjs';
import { selectFileContent, selectFileLoading, selectFileError } from '../../../store/files/files.selectors';
import { FilesActions } from '../../../store/files/files.actions';
import { LayoutActions } from '../../../store/layout/layout.actions';
import { UcStatus } from '../../../models/uc.model';
import { LoadingStateComponent } from '../../loading-state/loading-state.component';

interface UcRow { id: string; title: string; status: UcStatus; updated: string; }

@Component({
  selector: 'app-uc-tracker',
  standalone: true,
  imports: [MatIconModule, LoadingStateComponent],
  template: `
    <div class="panel-content">
      @if (loading() || error()) {
        <app-loading-state [loading]="loading()" [error]="error()"></app-loading-state>
      } @else if (!rows().length) {
        <div class="placeholder-empty"><mat-icon>table_chart</mat-icon> No use-cases found in usecases.md</div>
      } @else {
        <table class="uc-table">
          <thead><tr><th>ID</th><th>Title</th><th>Status</th><th>Updated</th></tr></thead>
          <tbody>
            @for (row of rows(); track row.id) {
              <tr (click)="select(row.id)" class="uc-row">
                <td class="uc-id">{{ row.id }}</td>
                <td>{{ row.title }}</td>
                <td><span class="badge" [class]="'badge-' + slugify(row.status)">{{ row.status }}</span></td>
                <td class="date">{{ row.updated }}</td>
              </tr>
            }
          </tbody>
        </table>
      }
    </div>
  `,
  styles: [`
    .uc-table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { text-align: left; padding: 8px 10px; background: #f5f5f5; border-bottom: 2px solid #e0e0e0; font-weight: 600; color: #555; white-space: nowrap; }
    td { padding: 8px 10px; border-bottom: 1px solid #f0f0f0; }
    .uc-row { cursor: pointer; transition: background 0.15s; }
    .uc-row:hover { background: #e8eaf6; }
    .uc-id { font-weight: 600; color: #3f51b5; font-family: monospace; }
    .date { color: #888; font-size: 12px; white-space: nowrap; }
    .badge { padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600; text-transform: uppercase; white-space: nowrap; }
    .badge-draft { background: #e0e0e0; color: #616161; }
    .badge-approved { background: #bbdefb; color: #1565c0; }
    .badge-in-development { background: #fff9c4; color: #f57f17; }
    .badge-testing { background: #b3e5fc; color: #0277bd; }
    .badge-fixing-deprecations { background: #ffe0b2; color: #e65100; }
    .badge-re-testing { background: #fce4ec; color: #c62828; }
    .badge-done { background: #c8e6c9; color: #2e7d32; }
    .badge-needs-human-review { background: #ede7f6; color: #4527a0; }
  `],
})
export class UcTrackerComponent implements OnInit, OnChanges, OnDestroy {
  @Input() filePath = '';
  private store = inject(Store);
  private subs: Subscription[] = [];

  loading = signal(false);
  error = signal<string | null>(null);
  rows = signal<UcRow[]>([]);

  ngOnInit(): void { this.subscribe(); }

  ngOnChanges(c: SimpleChanges): void {
    if (c['filePath'] && !c['filePath'].firstChange) {
      this.clearSubs();
      this.subscribe();
    }
  }

  ngOnDestroy(): void { this.clearSubs(); }

  private clearSubs(): void { this.subs.forEach(s => s.unsubscribe()); this.subs = []; }

  private subscribe(): void {
    if (!this.filePath) return;
    this.store.dispatch(FilesActions.loadFile({ path: this.filePath }));
    this.subs.push(
      this.store.select(selectFileLoading(this.filePath)).subscribe(v => this.loading.set(v)),
      this.store.select(selectFileError(this.filePath)).subscribe(v => this.error.set(v)),
      this.store.select(selectFileContent(this.filePath)).subscribe(c => this.rows.set(c ? parse(c) : [])),
    );
  }

  slugify(status: string): string {
    return status.toLowerCase().replace(/\s+/g, '-');
  }

  select(ucId: string): void {
    this.store.dispatch(LayoutActions.setGlobalUc({ ucId }));
  }
}

function parse(md: string): UcRow[] {
  const lines = md.split('\n');
  const tableLines = lines.filter(l => l.trim().startsWith('|') && !l.includes('---'));
  return tableLines.slice(1).map(line => {
    const cols = line.split('|').map(c => c.trim()).filter(Boolean);
    if (cols.length < 4) return null;
    return { id: cols[0], title: cols[1], status: cols[2] as UcStatus, updated: cols[3] };
  }).filter((r): r is UcRow => r !== null);
}
