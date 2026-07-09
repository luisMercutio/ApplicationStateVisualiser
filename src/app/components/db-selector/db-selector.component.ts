import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog } from '@angular/material/dialog';
import { FormsModule } from '@angular/forms';
import { Store } from '@ngrx/store';
import { toSignal } from '@angular/core/rxjs-interop';
import { ConnectionsActions } from '../../store/connections/connections.actions';
import {
  selectConnections, selectActiveId, selectActiveConnection, selectStoreReady, selectStoreError,
} from '../../store/connections/connections.selectors';
import { DbConnection } from '../../models/db-connection.model';
import { DbManagerDialogComponent } from '../db-manager-dialog/db-manager-dialog.component';
import { DbBrowserDialogComponent } from '../db-browser-dialog/db-browser-dialog.component';

// Toolbar control that switches which target database (B…Z) the app retrieves
// state from, plus quick access to browse the active one and manage the list.
@Component({
  selector: 'app-db-selector',
  standalone: true,
  imports: [
    MatButtonModule, MatIconModule, MatSelectModule, MatFormFieldModule,
    MatTooltipModule, FormsModule,
  ],
  template: `
    <mat-form-field appearance="outline" class="db-select" subscriptSizing="dynamic">
      <mat-label>Database</mat-label>
      <mat-select [ngModel]="activeId()" (ngModelChange)="setActive($event)"
                  [disabled]="!storeReady()" placeholder="None">
        @for (c of connections(); track c.id) {
          <mat-option [value]="c.id">{{ c.name }}</mat-option>
        }
      </mat-select>
    </mat-form-field>

    <button mat-icon-button matTooltip="Browse active database state"
            [disabled]="!activeConnection()" (click)="browse()">
      <mat-icon>table_view</mat-icon>
    </button>

    <button mat-icon-button [matTooltip]="storeReady() ? 'Manage database connections' : (storeError() || 'Store A unavailable')"
            (click)="manage()">
      <mat-icon [class.warn]="!storeReady()">{{ storeReady() ? 'storage' : 'error_outline' }}</mat-icon>
    </button>
  `,
  styles: [`
    :host { display: inline-flex; align-items: center; gap: 2px; }
    .db-select { width: 190px; color: white; --mdc-outlined-text-field-label-text-color: rgba(255,255,255,0.8); }
    .db-select ::ng-deep .mat-mdc-select-value { color: white; }
    .db-select ::ng-deep .mat-mdc-select-disabled .mat-mdc-select-value { color: rgba(255,255,255,0.5); }
    .db-select ::ng-deep .mat-mdc-notched-outline > * { border-color: rgba(255,255,255,0.5) !important; }
    .warn { color: #ffcc80; }
  `],
})
export class DbSelectorComponent {
  private store = inject(Store);
  private dialog = inject(MatDialog);

  connections = toSignal(this.store.select(selectConnections), { initialValue: [] as DbConnection[] });
  activeId = toSignal(this.store.select(selectActiveId), { initialValue: null });
  activeConnection = toSignal(this.store.select(selectActiveConnection), { initialValue: null });
  storeReady = toSignal(this.store.select(selectStoreReady), { initialValue: false });
  storeError = toSignal(this.store.select(selectStoreError), { initialValue: null });

  setActive(id: string | null): void {
    this.store.dispatch(ConnectionsActions.setActive({ id }));
  }

  browse(): void {
    const conn = this.activeConnection();
    if (conn) this.dialog.open(DbBrowserDialogComponent, { data: conn });
  }

  manage(): void {
    this.dialog.open(DbManagerDialogComponent);
  }
}
