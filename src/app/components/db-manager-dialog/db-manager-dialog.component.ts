import { Component, inject, signal } from '@angular/core';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatListModule } from '@angular/material/list';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Store } from '@ngrx/store';
import { toSignal } from '@angular/core/rxjs-interop';
import { ConnectionsActions } from '../../store/connections/connections.actions';
import {
  selectConnections, selectActiveId, selectStoreReady, selectStoreError,
} from '../../store/connections/connections.selectors';
import { DbService } from '../../services/db.service';
import { DbConnection, DbTestResult } from '../../models/db-connection.model';
import { DbConnectionFormDialogComponent } from '../db-connection-form-dialog/db-connection-form-dialog.component';

// Central place to manage the target databases (B…Z): add, edit, test, delete,
// and mark which one is active. The active target is what the browse view and
// any future state-retrieval panels read from.
@Component({
  selector: 'app-db-manager-dialog',
  standalone: true,
  imports: [
    MatDialogModule, MatButtonModule, MatIconModule, MatTooltipModule,
    MatListModule, MatProgressSpinnerModule,
  ],
  template: `
    <h2 mat-dialog-title>Database connections</h2>
    <mat-dialog-content>
      @if (!storeReady()) {
        <div class="banner bad">
          <mat-icon>error</mat-icon>
          <span>Store A (MariaDB) is unavailable{{ storeError() ? ': ' + storeError() : '' }}. Start MariaDB and reopen.</span>
        </div>
      }

      @if (connections().length === 0) {
        <p class="empty">No connections yet. Add one to start visualising an application's state.</p>
      } @else {
        <mat-list>
          @for (c of connections(); track c.id) {
            <mat-list-item class="row" [class.active]="c.id === activeId()">
              <mat-icon matListItemIcon>{{ c.id === activeId() ? 'radio_button_checked' : 'storage' }}</mat-icon>
              <div matListItemTitle>{{ c.name }}</div>
              <div matListItemLine class="sub">{{ c.username }}&#64;{{ c.host }}:{{ c.port }}/{{ c.database }}</div>

              <div matListItemMeta class="actions">
                @if (testResults()[c.id]; as r) {
                  <mat-icon class="test-dot" [class.ok]="r.ok" [class.bad]="!r.ok"
                            [matTooltip]="r.ok ? 'Connected — ' + r.version : (r.error || 'Failed')">
                    {{ r.ok ? 'check_circle' : 'error' }}
                  </mat-icon>
                }
                <button mat-icon-button matTooltip="Set active" [disabled]="c.id === activeId()"
                        (click)="setActive(c.id)">
                  <mat-icon>check</mat-icon>
                </button>
                <button mat-icon-button matTooltip="Test"
                        [disabled]="testing() === c.id" (click)="test(c)">
                  @if (testing() === c.id) { <mat-spinner diameter="18"></mat-spinner> }
                  @else { <mat-icon>bolt</mat-icon> }
                </button>
                <button mat-icon-button matTooltip="Edit" (click)="edit(c)"><mat-icon>edit</mat-icon></button>
                <button mat-icon-button matTooltip="Delete" (click)="remove(c)"><mat-icon>delete</mat-icon></button>
              </div>
            </mat-list-item>
          }
        </mat-list>
      }
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-flat-button [disabled]="!storeReady()" (click)="add()">
        <mat-icon>add</mat-icon> Add connection
      </button>
      <span class="spacer"></span>
      <button mat-button mat-dialog-close>Close</button>
    </mat-dialog-actions>
  `,
  styles: [`
    mat-dialog-content { min-width: 560px; max-width: 720px; }
    .banner { display: flex; align-items: center; gap: 8px; padding: 10px 12px;
              border-radius: 6px; margin-bottom: 8px; font-size: 13px; }
    .banner.bad { background: #fdecea; color: #b71c1c; }
    .empty { color: rgba(0,0,0,0.6); padding: 24px 8px; text-align: center; }
    .row.active { background: rgba(63,81,181,0.08); border-radius: 6px; }
    .sub { color: rgba(0,0,0,0.6); font-size: 12px; font-family: monospace; }
    .actions { display: flex; align-items: center; gap: 2px; }
    .test-dot { font-size: 18px; height: 18px; width: 18px; margin-right: 4px; }
    .test-dot.ok { color: #2e7d32; }
    .test-dot.bad { color: #c62828; }
    .actions mat-spinner { display: inline-block; }
    mat-dialog-actions .spacer { flex: 1; }
  `],
})
export class DbManagerDialogComponent {
  private store = inject(Store);
  private db = inject(DbService);
  private dialog = inject(MatDialog);

  connections = toSignal(this.store.select(selectConnections), { initialValue: [] as DbConnection[] });
  activeId = toSignal(this.store.select(selectActiveId), { initialValue: null });
  storeReady = toSignal(this.store.select(selectStoreReady), { initialValue: false });
  storeError = toSignal(this.store.select(selectStoreError), { initialValue: null });

  testing = signal<string | null>(null);
  testResults = signal<Record<string, DbTestResult>>({});

  add(): void {
    this.dialog.open(DbConnectionFormDialogComponent, { data: null });
  }

  edit(c: DbConnection): void {
    this.dialog.open(DbConnectionFormDialogComponent, { data: c });
  }

  remove(c: DbConnection): void {
    if (confirm(`Delete connection "${c.name}"? This cannot be undone.`)) {
      this.store.dispatch(ConnectionsActions.deleteConnection({ id: c.id }));
    }
  }

  setActive(id: string): void {
    this.store.dispatch(ConnectionsActions.setActive({ id }));
  }

  test(c: DbConnection): void {
    this.testing.set(c.id);
    this.db.testExisting(c.id).subscribe({
      next: r => { this.recordTest(c.id, r); },
      error: err => this.recordTest(c.id, { ok: false, error: err.error?.error ?? err.message ?? 'Failed' }),
    });
  }

  private recordTest(id: string, r: DbTestResult): void {
    this.testResults.update(m => ({ ...m, [id]: r }));
    this.testing.set(null);
  }
}
