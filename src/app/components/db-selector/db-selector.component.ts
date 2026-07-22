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
import { ApplicationsActions } from '../../store/applications/applications.actions';
import {
  selectApplications, selectActiveId, selectStoreReady, selectStoreError,
} from '../../store/applications/applications.selectors';
import { Application } from '../../models/application.model';
import { ApplicationsManagerDialogComponent } from '../applications-manager-dialog/applications-manager-dialog.component';

// Toolbar control that switches which application the app retrieves state from,
// plus quick access to manage the registered applications.
@Component({
  selector: 'app-db-selector',
  standalone: true,
  imports: [
    MatButtonModule, MatIconModule, MatSelectModule, MatFormFieldModule,
    MatTooltipModule, FormsModule,
  ],
  template: `
    <mat-form-field appearance="outline" class="db-select" subscriptSizing="dynamic">
      <mat-label>Application</mat-label>
      <mat-select [ngModel]="activeId()" (ngModelChange)="setActive($event)"
                  [disabled]="!storeReady()" placeholder="None">
        @for (a of applications(); track a.id) {
          <mat-option [value]="a.id">{{ a.name }}</mat-option>
        }
      </mat-select>
    </mat-form-field>

    <button mat-icon-button [matTooltip]="storeReady() ? 'Manage applications' : (storeError() || 'Store database unavailable')"
            (click)="manage()">
      <mat-icon [class.warn]="!storeReady()">{{ storeReady() ? 'apps' : 'error_outline' }}</mat-icon>
    </button>
  `,
  styles: [`
    :host { display: inline-flex; align-items: center; gap: 2px; }
    .db-select { width: 190px; color: white; --mdc-outlined-text-field-label-text-color: rgba(255,255,255,0.8); }
    .db-select ::ng-deep .mat-mdc-select-value { color: white; }
    .db-select ::ng-deep .mat-mdc-select-disabled .mat-mdc-select-value { color: rgba(255,255,255,0.5); }
    .db-select ::ng-deep .mat-mdc-notched-outline > * { border-color: rgba(255,255,255,0.5) !important; }
    .warn { color: #ffcc80; }
    @media (max-width: 768px) { .db-select { width: 130px; } }
  `],
})
export class DbSelectorComponent {
  private store = inject(Store);
  private dialog = inject(MatDialog);

  applications = toSignal(this.store.select(selectApplications), { initialValue: [] as Application[] });
  activeId = toSignal(this.store.select(selectActiveId), { initialValue: null });
  storeReady = toSignal(this.store.select(selectStoreReady), { initialValue: false });
  storeError = toSignal(this.store.select(selectStoreError), { initialValue: null });

  setActive(id: string | null): void {
    this.store.dispatch(ApplicationsActions.setActive({ id }));
  }

  manage(): void {
    this.dialog.open(ApplicationsManagerDialogComponent);
  }
}
