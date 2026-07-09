import { Component, inject, signal } from '@angular/core';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { FormsModule } from '@angular/forms';
import { Store } from '@ngrx/store';
import { ConnectionsActions } from '../../store/connections/connections.actions';
import { DbService } from '../../services/db.service';
import { DbConnection, DbConnectionInput, DbTestResult } from '../../models/db-connection.model';

// Create or edit a single target database (B…Z). The password field is left
// blank on edit — submitting it blank keeps whatever is already encrypted in
// Store A, matching the backend's "blank means keep" contract.
@Component({
  selector: 'app-db-connection-form-dialog',
  standalone: true,
  imports: [
    MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule,
    MatCheckboxModule, MatIconModule, MatProgressSpinnerModule, FormsModule,
  ],
  template: `
    <h2 mat-dialog-title>{{ editing ? 'Edit database connection' : 'Add database connection' }}</h2>
    <mat-dialog-content>
      <div class="form-grid">
        <mat-form-field appearance="outline" class="col-span-2">
          <mat-label>Display name</mat-label>
          <input matInput [(ngModel)]="name" placeholder="e.g. Orders service (staging)" autocomplete="off" />
        </mat-form-field>

        <mat-form-field appearance="outline" class="host">
          <mat-label>Host</mat-label>
          <input matInput [(ngModel)]="host" placeholder="127.0.0.1" autocomplete="off" />
        </mat-form-field>

        <mat-form-field appearance="outline" class="port">
          <mat-label>Port</mat-label>
          <input matInput type="number" [(ngModel)]="port" placeholder="3306" />
        </mat-form-field>

        <mat-form-field appearance="outline" class="col-span-2">
          <mat-label>Database</mat-label>
          <input matInput [(ngModel)]="database" placeholder="schema name" autocomplete="off" />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Username</mat-label>
          <input matInput [(ngModel)]="username" autocomplete="off" />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Password</mat-label>
          <input matInput type="password" [(ngModel)]="password"
                 [placeholder]="editing ? '•••••• (unchanged)' : ''" autocomplete="new-password" />
          @if (editing) { <mat-hint>Leave blank to keep the stored password.</mat-hint> }
        </mat-form-field>

        <mat-checkbox class="col-span-2" [(ngModel)]="useSsl">Use SSL/TLS</mat-checkbox>
      </div>

      @if (testResult(); as r) {
        <div class="test-result" [class.ok]="r.ok" [class.bad]="!r.ok">
          <mat-icon>{{ r.ok ? 'check_circle' : 'error' }}</mat-icon>
          <span>{{ r.ok ? 'Connected — server ' + r.version : r.error }}</span>
        </div>
      }
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button (click)="test()" [disabled]="!canTest() || testing()">
        @if (testing()) { <mat-spinner diameter="16"></mat-spinner> } @else { <mat-icon>bolt</mat-icon> }
        Test connection
      </button>
      <span class="spacer"></span>
      <button mat-button mat-dialog-close>Cancel</button>
      <button mat-flat-button [disabled]="!isValid()" (click)="save()">Save</button>
    </mat-dialog-actions>
  `,
  styles: [`
    mat-dialog-content { min-width: 460px; padding-top: 8px !important; }
    .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 12px; }
    .col-span-2 { grid-column: 1 / -1; }
    .host { grid-column: 1 / 2; }
    .port { grid-column: 2 / 3; }
    .test-result { display: flex; align-items: center; gap: 8px; margin-top: 4px;
                   padding: 8px 12px; border-radius: 6px; font-size: 13px; }
    .test-result.ok { background: #e8f5e9; color: #1b5e20; }
    .test-result.bad { background: #fdecea; color: #b71c1c; }
    .test-result mat-icon { font-size: 20px; height: 20px; width: 20px; }
    mat-dialog-actions .spacer { flex: 1; }
    mat-dialog-actions button mat-spinner { display: inline-block; margin-right: 6px; }
  `],
})
export class DbConnectionFormDialogComponent {
  private store = inject(Store);
  private db = inject(DbService);
  private dialogRef = inject(MatDialogRef<DbConnectionFormDialogComponent>);
  private data = inject<DbConnection | null>(MAT_DIALOG_DATA, { optional: true });

  editing = !!this.data;

  name = this.data?.name ?? '';
  host = this.data?.host ?? '127.0.0.1';
  port = this.data?.port ?? 3306;
  database = this.data?.database ?? '';
  username = this.data?.username ?? '';
  password = '';
  useSsl = this.data?.useSsl ?? false;

  testing = signal(false);
  testResult = signal<DbTestResult | null>(null);

  private buildInput(): DbConnectionInput {
    return {
      name: this.name.trim(),
      host: this.host.trim(),
      port: Number(this.port) || 3306,
      database: this.database.trim(),
      username: this.username.trim(),
      password: this.password,
      useSsl: this.useSsl,
    };
  }

  isValid(): boolean {
    const i = this.buildInput();
    return !!(i.name && i.host && i.database && i.username);
  }

  // Testing needs a password to actually authenticate. On edit we don't have the
  // stored one client-side, so only allow the ad-hoc test when a password is typed.
  canTest(): boolean {
    return this.isValid() && (!this.editing || this.password.length > 0);
  }

  test(): void {
    this.testing.set(true);
    this.testResult.set(null);
    this.db.testParams(this.buildInput()).subscribe({
      next: r => { this.testResult.set(r); this.testing.set(false); },
      error: err => {
        this.testResult.set({ ok: false, error: err.error?.error ?? err.message ?? 'Test failed' });
        this.testing.set(false);
      },
    });
  }

  save(): void {
    if (!this.isValid()) return;
    const input = this.buildInput();
    if (this.editing && this.data) {
      this.store.dispatch(ConnectionsActions.updateConnection({ id: this.data.id, input }));
    } else {
      this.store.dispatch(ConnectionsActions.createConnection({ input }));
    }
    this.dialogRef.close(true);
  }
}
