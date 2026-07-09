import { Component, inject, signal } from '@angular/core';
import { MatDialogModule, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatTableModule } from '@angular/material/table';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { DbService } from '../../services/db.service';
import { DbConnection, DbPreview, DbTableInfo } from '../../models/db-connection.model';

// Browse the state of the active target: its tables on the left, a row preview
// of the selected table on the right. This is the "display application state"
// slice — the same view against a different connection shows a different app.
@Component({
  selector: 'app-db-browser-dialog',
  standalone: true,
  imports: [
    MatDialogModule, MatButtonModule, MatIconModule, MatListModule,
    MatTableModule, MatProgressBarModule,
  ],
  template: `
    <h2 mat-dialog-title>
      <mat-icon class="title-icon">storage</mat-icon>
      {{ conn.name }} <span class="dim">— {{ conn.database }}&#64;{{ conn.host }}</span>
    </h2>
    <mat-dialog-content>
      @if (loadingTables()) { <mat-progress-bar mode="indeterminate"></mat-progress-bar> }
      @if (error(); as e) { <div class="err"><mat-icon>error</mat-icon> {{ e }}</div> }

      <div class="browser">
        <div class="tables">
          <div class="tables-head">Tables ({{ tables().length }})</div>
          <mat-nav-list dense>
            @for (t of tables(); track t.name) {
              <a mat-list-item [class.sel]="t.name === selected()" (click)="select(t.name)">
                <span matListItemTitle>{{ t.name }}</span>
                <span matListItemMeta class="dim">~{{ t.approxRows }}</span>
              </a>
            }
          </mat-nav-list>
        </div>

        <div class="preview">
          @if (loadingRows()) { <mat-progress-bar mode="indeterminate"></mat-progress-bar> }
          @if (preview(); as p) {
            <div class="preview-head">{{ p.table }} — first {{ p.rows.length }} rows (limit {{ p.limit }})</div>
            <div class="table-scroll">
              <table mat-table [dataSource]="p.rows">
                @for (col of p.columns; track col) {
                  <ng-container [matColumnDef]="col">
                    <th mat-header-cell *matHeaderCellDef>{{ col }}</th>
                    <td mat-cell *matCellDef="let row">{{ format(row[col]) }}</td>
                  </ng-container>
                }
                <tr mat-header-row *matHeaderRowDef="p.columns; sticky: true"></tr>
                <tr mat-row *matRowDef="let row; columns: p.columns"></tr>
              </table>
              @if (p.rows.length === 0) { <div class="empty">Table is empty.</div> }
            </div>
          } @else if (!loadingRows() && !error()) {
            <div class="empty">Select a table to preview its rows.</div>
          }
        </div>
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Close</button>
    </mat-dialog-actions>
  `,
  styles: [`
    h2 { display: flex; align-items: center; gap: 8px; }
    .title-icon { font-size: 22px; }
    .dim { color: rgba(0,0,0,0.5); font-weight: 400; font-size: 13px; }
    mat-dialog-content { width: 80vw; max-width: 1100px; height: 70vh; }
    .err { display: flex; align-items: center; gap: 6px; color: #b71c1c; padding: 8px 0; }
    .browser { display: grid; grid-template-columns: 240px 1fr; gap: 12px; height: calc(70vh - 60px); }
    .tables { border-right: 1px solid rgba(0,0,0,0.12); overflow: auto; }
    .tables-head, .preview-head { font-weight: 500; padding: 6px 8px; position: sticky; top: 0;
                                  background: #fff; z-index: 1; }
    .sel { background: rgba(63,81,181,0.12); }
    .preview { overflow: hidden; display: flex; flex-direction: column; }
    .table-scroll { overflow: auto; flex: 1; }
    table { width: 100%; }
    th, td { white-space: nowrap; padding: 4px 12px !important; font-size: 12px; }
    .empty { color: rgba(0,0,0,0.5); padding: 24px; text-align: center; }
  `],
})
export class DbBrowserDialogComponent {
  private db = inject(DbService);
  conn = inject<DbConnection>(MAT_DIALOG_DATA);

  tables = signal<DbTableInfo[]>([]);
  selected = signal<string | null>(null);
  preview = signal<DbPreview | null>(null);
  loadingTables = signal(true);
  loadingRows = signal(false);
  error = signal<string | null>(null);

  constructor() {
    this.db.listTables(this.conn.id).subscribe({
      next: ({ tables }) => { this.tables.set(tables); this.loadingTables.set(false); },
      error: err => { this.error.set(err.error?.error ?? err.message ?? 'Failed to list tables'); this.loadingTables.set(false); },
    });
  }

  select(table: string): void {
    this.selected.set(table);
    this.preview.set(null);
    this.loadingRows.set(true);
    this.error.set(null);
    this.db.previewTable(this.conn.id, table, 50).subscribe({
      next: p => { this.preview.set(p); this.loadingRows.set(false); },
      error: err => { this.error.set(err.error?.error ?? err.message ?? 'Failed to load rows'); this.loadingRows.set(false); },
    });
  }

  format(v: unknown): string {
    if (v === null || v === undefined) return '∅';
    return String(v);
  }
}
