import { Component, inject } from '@angular/core';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { FormsModule } from '@angular/forms';
import { Epic, EpicInput } from '../../models/app-data.model';

// Create or edit one Epic (a group of Business Rules) in the active application's
// DB. Returns an EpicInput to the caller, which owns the connection id.
@Component({
  selector: 'app-epic-form-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, FormsModule],
  template: `
    <h2 mat-dialog-title>{{ editing ? 'Edit Epic' : 'Add Epic' }}</h2>
    <mat-dialog-content>
      <div class="form-grid">
        <mat-form-field appearance="outline">
          <mat-label>Key (optional)</mat-label>
          <input matInput [(ngModel)]="key" placeholder="e.g. EPIC-001" autocomplete="off" />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Seq</mat-label>
          <input matInput [(ngModel)]="seq" placeholder="e.g. 1" autocomplete="off" />
        </mat-form-field>

        <mat-form-field appearance="outline" class="col-span-2">
          <mat-label>Title</mat-label>
          <input matInput [(ngModel)]="title" placeholder="Epic title" autocomplete="off" />
        </mat-form-field>

        <mat-form-field appearance="outline" class="col-span-2">
          <mat-label>Description (optional)</mat-label>
          <textarea matInput [(ngModel)]="description" rows="3"></textarea>
        </mat-form-field>
      </div>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancel</button>
      <button mat-flat-button [disabled]="!isValid()" (click)="save()">Save</button>
    </mat-dialog-actions>
  `,
  styles: [`
    mat-dialog-content { min-width: 420px; padding-top: 8px !important; }
    .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 12px; }
    .col-span-2 { grid-column: 1 / -1; }
  `],
})
export class EpicFormDialogComponent {
  private dialogRef = inject(MatDialogRef<EpicFormDialogComponent>);
  private data = inject<Epic | null>(MAT_DIALOG_DATA, { optional: true });

  editing = !!this.data;
  key = this.data?.key ?? '';
  seq = this.data?.seq ?? '';
  title = this.data?.title ?? '';
  description = this.data?.description ?? '';

  isValid(): boolean { return !!this.title.trim(); }

  save(): void {
    if (!this.isValid()) return;
    const input: EpicInput = {
      key: this.key.trim() || null,
      title: this.title.trim(),
      description: this.description.trim() || null,
      seq: this.seq.trim() || null,
    };
    this.dialogRef.close(input);
  }
}
