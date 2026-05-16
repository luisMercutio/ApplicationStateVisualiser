import { Component, inject } from '@angular/core';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-save-layout-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, FormsModule],
  template: `
    <h2 mat-dialog-title>Save Layout</h2>
    <mat-dialog-content>
      <mat-form-field appearance="outline" class="name-field">
        <mat-label>Layout name</mat-label>
        <input matInput [(ngModel)]="name" (keydown.enter)="confirm()"
               placeholder="e.g. sprint-review" autocomplete="off" />
        <mat-hint>Letters, numbers, spaces, hyphens and underscores only.</mat-hint>
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancel</button>
      <button mat-flat-button [disabled]="!isValid()" (click)="confirm()">Save</button>
    </mat-dialog-actions>
  `,
  styles: [`
    mat-dialog-content { min-width: 320px; padding-top: 8px !important; }
    .name-field { width: 100%; }
  `],
})
export class SaveLayoutDialogComponent {
  private dialogRef = inject(MatDialogRef<SaveLayoutDialogComponent>);
  private prefill: string = inject(MAT_DIALOG_DATA, { optional: true }) ?? '';

  name = this.prefill;

  isValid(): boolean {
    return /^[a-zA-Z0-9 _-]+$/.test(this.name.trim());
  }

  confirm(): void {
    if (this.isValid()) this.dialogRef.close(this.name.trim());
  }
}