import { Component, inject } from '@angular/core';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatListModule } from '@angular/material/list';
import { Store } from '@ngrx/store';
import { toSignal } from '@angular/core/rxjs-interop';
import { ApplicationsActions } from '../../store/applications/applications.actions';
import {
  selectApplications, selectActiveId, selectStoreReady, selectStoreError,
} from '../../store/applications/applications.selectors';
import { Application } from '../../models/application.model';
import { ApplicationFormDialogComponent } from '../application-form-dialog/application-form-dialog.component';

// Central place to manage the registered applications: add, edit, delete, and
// mark which one is active. The active application is what every Epic / BR /
// Notes view reads from.
@Component({
  selector: 'app-applications-manager-dialog',
  standalone: true,
  imports: [
    MatDialogModule, MatButtonModule, MatIconModule, MatTooltipModule, MatListModule,
  ],
  template: `
    <h2 mat-dialog-title>Applications</h2>
    <mat-dialog-content>
      @if (!storeReady()) {
        <div class="banner bad">
          <mat-icon>error</mat-icon>
          <span>The store database (MariaDB) is unavailable{{ storeError() ? ': ' + storeError() : '' }}. Start MariaDB and reopen.</span>
        </div>
      }

      @if (applications().length === 0) {
        <p class="empty">No applications yet. Add one to start visualising its state.</p>
      } @else {
        <mat-list>
          @for (a of applications(); track a.id) {
            <mat-list-item class="row" [class.active]="a.id === activeId()">
              <mat-icon matListItemIcon>{{ a.id === activeId() ? 'radio_button_checked' : 'apps' }}</mat-icon>
              <div matListItemTitle>{{ a.name }}</div>
              @if (a.description || a.rootDir) {
                <div matListItemLine class="sub">{{ a.description || a.rootDir }}</div>
              }

              <div matListItemMeta class="actions">
                <button mat-icon-button matTooltip="Set active" [disabled]="a.id === activeId()"
                        (click)="setActive(a.id)">
                  <mat-icon>check</mat-icon>
                </button>
                <button mat-icon-button matTooltip="Edit" (click)="edit(a)"><mat-icon>edit</mat-icon></button>
                <button mat-icon-button matTooltip="Delete" (click)="remove(a)"><mat-icon>delete</mat-icon></button>
              </div>
            </mat-list-item>
          }
        </mat-list>
      }
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-flat-button [disabled]="!storeReady()" (click)="add()">
        <mat-icon>add</mat-icon> Add application
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
    .sub { color: rgba(0,0,0,0.6); font-size: 12px; }
    .actions { display: flex; align-items: center; gap: 2px; }
    mat-dialog-actions .spacer { flex: 1; }
  `],
})
export class ApplicationsManagerDialogComponent {
  private store = inject(Store);
  private dialog = inject(MatDialog);

  applications = toSignal(this.store.select(selectApplications), { initialValue: [] as Application[] });
  activeId = toSignal(this.store.select(selectActiveId), { initialValue: null });
  storeReady = toSignal(this.store.select(selectStoreReady), { initialValue: false });
  storeError = toSignal(this.store.select(selectStoreError), { initialValue: null });

  add(): void {
    this.dialog.open(ApplicationFormDialogComponent, { data: null });
  }

  edit(a: Application): void {
    this.dialog.open(ApplicationFormDialogComponent, { data: a });
  }

  remove(a: Application): void {
    if (confirm(`Delete application "${a.name}"? This cannot be undone.`)) {
      this.store.dispatch(ApplicationsActions.deleteApplication({ id: a.id }));
    }
  }

  setActive(id: string): void {
    this.store.dispatch(ApplicationsActions.setActive({ id }));
  }
}
