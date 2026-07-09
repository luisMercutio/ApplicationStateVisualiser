import { Component, inject } from '@angular/core';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { FormsModule } from '@angular/forms';
import { Note, NoteInput } from '../../models/note.model';

// Create or edit one Note (a free-form idea) in the active application's DB.
// Returns a NoteInput to the caller, which owns the connection id. Related BRs
// are optional and free-form — a comma-separated list of BR references.
@Component({
  selector: 'app-note-form-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, FormsModule],
  template: `
    <h2 mat-dialog-title>{{ editing ? 'Edit Note' : 'Add Note' }}</h2>
    <mat-dialog-content>
      <div class="form-grid">
        <mat-form-field appearance="outline">
          <mat-label>Title</mat-label>
          <input matInput [(ngModel)]="title" placeholder="Short title" autocomplete="off" />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Description</mat-label>
          <textarea matInput [(ngModel)]="description" rows="5" placeholder="The idea"></textarea>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Related business rules (optional)</mat-label>
          <input matInput [(ngModel)]="relatedBrsCsv" placeholder="e.g. BR-054, BR-055" autocomplete="off" />
          <mat-hint>Comma-separated BR references — leave blank if none</mat-hint>
        </mat-form-field>
      </div>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancel</button>
      <button mat-flat-button [disabled]="!isValid()" (click)="save()">Save</button>
    </mat-dialog-actions>
  `,
  styles: [`
    mat-dialog-content { min-width: 440px; padding-top: 8px !important; }
    .form-grid { display: flex; flex-direction: column; gap: 4px; }
  `],
})
export class NoteFormDialogComponent {
  private dialogRef = inject(MatDialogRef<NoteFormDialogComponent>);
  private data = inject<Note | null>(MAT_DIALOG_DATA, { optional: true });

  editing = !!this.data;
  title = this.data?.title ?? '';
  description = this.data?.description ?? '';
  relatedBrsCsv = (this.data?.relatedBrs ?? []).join(', ');

  isValid(): boolean { return !!this.title.trim(); }

  save(): void {
    if (!this.isValid()) return;
    const relatedBrs = [...new Set(
      this.relatedBrsCsv.split(',').map((s) => s.trim()).filter(Boolean),
    )];
    const input: NoteInput = {
      title: this.title.trim(),
      description: this.description.trim() || null,
      relatedBrs,
    };
    this.dialogRef.close(input);
  }
}
