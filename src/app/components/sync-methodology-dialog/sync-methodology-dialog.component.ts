import { Component, inject } from '@angular/core';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-sync-methodology-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, FormsModule],
  template: `
    <h2 mat-dialog-title>Sync methodology to a project</h2>
    <mat-dialog-content>
      <p class="blurb">Copies <code>.claude/agents</code> and <code>.claude/commands</code> into
        <code>&lt;target&gt;/.claude/</code>, overwriting existing files of the same name.</p>
      <mat-form-field appearance="outline" class="path-field">
        <mat-label>Target project folder</mat-label>
        <input matInput [(ngModel)]="target" (keydown.enter)="confirm()"
               placeholder="C:/path/to/projectB" autocomplete="off" />
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancel</button>
      <button mat-flat-button color="primary" [disabled]="!target.trim()" (click)="confirm()">Sync</button>
    </mat-dialog-actions>
  `,
  styles: [`
    mat-dialog-content { min-width: 380px; }
    .blurb { font-size: 12px; color: #666; line-height: 1.5; }
    .path-field { width: 100%; }
  `],
})
export class SyncMethodologyDialogComponent {
  private dialogRef = inject(MatDialogRef<SyncMethodologyDialogComponent>);
  target: string = inject(MAT_DIALOG_DATA, { optional: true }) ?? '';

  confirm(): void {
    if (this.target.trim()) this.dialogRef.close(this.target.trim());
  }
}
