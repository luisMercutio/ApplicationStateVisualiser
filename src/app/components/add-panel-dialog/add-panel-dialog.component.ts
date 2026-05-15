import { Component, inject } from '@angular/core';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { ViewType, VIEW_TYPE_LABELS, VIEW_TYPE_LIST } from '../../models/panel.model';

@Component({
  selector: 'app-add-panel-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule, MatListModule, MatIconModule],
  template: `
    <h2 mat-dialog-title>Add Panel</h2>
    <mat-dialog-content>
      <mat-selection-list [multiple]="false" (selectionChange)="select($event)">
        @for (vt of viewTypes; track vt) {
          <mat-list-option [value]="vt">
            {{ labels[vt] }}
          </mat-list-option>
        }
      </mat-selection-list>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancel</button>
    </mat-dialog-actions>
  `,
  styles: [`
    mat-dialog-content { min-width: 280px; max-height: 400px; }
  `],
})
export class AddPanelDialogComponent {
  private dialogRef = inject(MatDialogRef<AddPanelDialogComponent>);
  viewTypes = VIEW_TYPE_LIST;
  labels = VIEW_TYPE_LABELS;

  select(event: any): void {
    const vt: ViewType = event.options[0].value;
    this.dialogRef.close(vt);
  }
}
