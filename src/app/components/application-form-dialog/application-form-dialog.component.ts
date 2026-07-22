import { Component, inject } from '@angular/core';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { FormsModule } from '@angular/forms';
import { Store } from '@ngrx/store';
import { ApplicationsActions } from '../../store/applications/applications.actions';
import { Application, ApplicationInput } from '../../models/application.model';

// Create or edit the registered application: its display name, an optional
// description, and the root directory where its source lives on disk.
@Component({
  selector: 'app-application-form-dialog',
  standalone: true,
  imports: [
    MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, FormsModule,
  ],
  template: `
    <h2 mat-dialog-title>{{ editing ? 'Edit application' : 'Add application' }}</h2>
    <mat-dialog-content>
      <div class="form-grid">
        <mat-form-field appearance="outline">
          <mat-label>Name</mat-label>
          <input matInput [(ngModel)]="name" placeholder="e.g. Orders service" autocomplete="off" />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Description</mat-label>
          <textarea matInput [(ngModel)]="description" rows="3"
                    placeholder="What this application does (optional)"></textarea>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Root directory</mat-label>
          <input matInput [(ngModel)]="rootDir" placeholder="e.g. C:\\path\\to\\app (optional)" autocomplete="off" />
        </mat-form-field>
      </div>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancel</button>
      <button mat-flat-button [disabled]="!isValid()" (click)="save()">Save</button>
    </mat-dialog-actions>
  `,
  styles: [`
    mat-dialog-content { min-width: 460px; padding-top: 8px !important; }
    .form-grid { display: grid; grid-template-columns: 1fr; gap: 4px; }
  `],
})
export class ApplicationFormDialogComponent {
  private store = inject(Store);
  private dialogRef = inject(MatDialogRef<ApplicationFormDialogComponent>);
  private data = inject<Application | null>(MAT_DIALOG_DATA, { optional: true });

  editing = !!this.data;

  name = this.data?.name ?? '';
  description = this.data?.description ?? '';
  rootDir = this.data?.rootDir ?? '';

  private buildInput(): ApplicationInput {
    const description = this.description.trim();
    const rootDir = this.rootDir.trim();
    return {
      name: this.name.trim(),
      description: description || null,
      rootDir: rootDir || null,
    };
  }

  isValid(): boolean {
    return !!this.buildInput().name;
  }

  save(): void {
    if (!this.isValid()) return;
    const input = this.buildInput();
    if (this.editing && this.data) {
      this.store.dispatch(ApplicationsActions.updateApplication({ id: this.data.id, input }));
    } else {
      this.store.dispatch(ApplicationsActions.createApplication({ input }));
    }
    this.dialogRef.close(true);
  }
}
