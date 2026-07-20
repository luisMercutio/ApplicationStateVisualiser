import { Component, inject } from '@angular/core';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { FormsModule } from '@angular/forms';
import { Note, NoteInput } from '../../models/note.model';

// What the caller hands the dialog. `note` is the row being edited (null when
// adding). `lockedBr`, when set, ties the note to exactly ONE Business Rule (the
// per-BR "edit note" flow): the BR association is shown as a fixed chip and the
// free-form related-BRs field is hidden — there is exactly one note per BR.
export interface NoteDialogData {
  note?: Note | null;
  lockedBr?: string | null;
}

// Create or edit one Note (a free-form idea) in the active application's DB.
// Returns a NoteInput to the caller, which owns the connection id. Related BRs
// are optional and free-form — a comma-separated list of BR references — unless
// the dialog was opened against a specific BR (`lockedBr`), in which case the
// note is bound to that single rule.
@Component({
  selector: 'app-note-form-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatIconModule, FormsModule],
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

        @if (lockedBr) {
          <div class="locked-br">
            <span class="lbl">Business rule</span>
            <span class="br-chip"><mat-icon>sell</mat-icon>{{ lockedBr }}</span>
          </div>
        } @else {
          <mat-form-field appearance="outline">
            <mat-label>Related business rules (optional)</mat-label>
            <input matInput [(ngModel)]="relatedBrsCsv" placeholder="e.g. BR-054, BR-055" autocomplete="off" />
            <mat-hint>Comma-separated BR references — leave blank if none</mat-hint>
          </mat-form-field>
        }
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
    .locked-br { display: flex; align-items: center; gap: 8px; margin: 2px 0 8px; }
    .locked-br .lbl { font-size: 12px; color: #666; }
    .locked-br .br-chip { display: inline-flex; align-items: center; gap: 3px; font-size: 11px; font-family: monospace;
      background: #eef1fb; color: #3f51b5; border: 1px solid #d6ddf5; padding: 2px 9px; border-radius: 10px; }
    .locked-br .br-chip mat-icon { font-size: 13px; width: 13px; height: 13px; }
  `],
})
export class NoteFormDialogComponent {
  private dialogRef = inject(MatDialogRef<NoteFormDialogComponent>);
  private data = inject<NoteDialogData | null>(MAT_DIALOG_DATA, { optional: true });

  private note = this.data?.note ?? null;
  lockedBr = this.data?.lockedBr ?? null;

  editing = !!this.note;
  title = this.note?.title ?? '';
  description = this.note?.description ?? '';
  relatedBrsCsv = (this.note?.relatedBrs ?? []).join(', ');

  isValid(): boolean { return !!this.title.trim(); }

  save(): void {
    if (!this.isValid()) return;
    // A BR-bound note is tied to exactly one rule; otherwise take the free-form CSV.
    const relatedBrs = this.lockedBr
      ? [this.lockedBr]
      : [...new Set(this.relatedBrsCsv.split(',').map((s) => s.trim()).filter(Boolean))];
    const input: NoteInput = {
      title: this.title.trim(),
      description: this.description.trim() || null,
      relatedBrs,
    };
    this.dialogRef.close(input);
  }
}
