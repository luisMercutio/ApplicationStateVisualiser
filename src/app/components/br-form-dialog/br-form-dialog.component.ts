import { Component, inject } from '@angular/core';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { FormsModule } from '@angular/forms';
import { AppBusinessRule, AppBusinessRuleInput, Epic } from '../../models/app-data.model';
import { BR_CATEGORY_COLORS } from '../../models/business-rule.model';

export interface BrFormData {
  rule?: AppBusinessRule;
  epics: Epic[];
  defaultEpicId?: string | null;
}

// Create or edit one Business Rule in the active application's DB. Returns an
// AppBusinessRuleInput to the caller (the BR List), which owns the connection id.
@Component({
  selector: 'app-br-form-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule, FormsModule],
  template: `
    <h2 mat-dialog-title>{{ editing ? 'Edit Business Rule' : 'Add Business Rule' }}</h2>
    <mat-dialog-content>
      <div class="form-grid">
        <mat-form-field appearance="outline">
          <mat-label>Name / ID</mat-label>
          <input matInput [(ngModel)]="name" placeholder="e.g. BR-001" autocomplete="off" />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Seq</mat-label>
          <input matInput [(ngModel)]="seq" placeholder="e.g. 1.2" autocomplete="off" />
        </mat-form-field>

        <mat-form-field appearance="outline" class="col-span-2">
          <mat-label>Rule statement</mat-label>
          <textarea matInput [(ngModel)]="rule" rows="3" placeholder="The rule the application enforces"></textarea>
        </mat-form-field>

        <mat-form-field appearance="outline" class="col-span-2">
          <mat-label>Rationale (optional)</mat-label>
          <textarea matInput [(ngModel)]="rationale" rows="2"></textarea>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Category</mat-label>
          <mat-select [(ngModel)]="category">
            <mat-option [value]="null">— none —</mat-option>
            @for (c of categories; track c) { <mat-option [value]="c">{{ c }}</mat-option> }
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Epic</mat-label>
          <mat-select [(ngModel)]="epicId">
            <mat-option [value]="null">— ungrouped —</mat-option>
            @for (e of data.epics; track e.id) { <mat-option [value]="e.id">{{ e.key ? e.key + ' · ' : '' }}{{ e.title }}</mat-option> }
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline" class="col-span-2">
          <mat-label>Features (comma-separated)</mat-label>
          <input matInput [(ngModel)]="featuresCsv" placeholder="connections, br-list" autocomplete="off" />
        </mat-form-field>

        <mat-form-field appearance="outline" class="col-span-2">
          <mat-label>Depends on (comma-separated BR names)</mat-label>
          <input matInput [(ngModel)]="dependsOnCsv" placeholder="BR-001, BR-002" autocomplete="off" />
        </mat-form-field>
      </div>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancel</button>
      <button mat-flat-button [disabled]="!isValid()" (click)="save()">Save</button>
    </mat-dialog-actions>
  `,
  styles: [`
    mat-dialog-content { min-width: 480px; padding-top: 8px !important; }
    .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 12px; }
    .col-span-2 { grid-column: 1 / -1; }
  `],
})
export class BrFormDialogComponent {
  private dialogRef = inject(MatDialogRef<BrFormDialogComponent>);
  data = inject<BrFormData>(MAT_DIALOG_DATA);

  editing = !!this.data.rule;
  categories = Object.keys(BR_CATEGORY_COLORS);

  name = this.data.rule?.name ?? '';
  seq = this.data.rule?.seq ?? '';
  rule = this.data.rule?.rule ?? '';
  rationale = this.data.rule?.rationale ?? '';
  category = this.data.rule?.category ?? null;
  epicId = this.data.rule?.epicId ?? this.data.defaultEpicId ?? null;
  featuresCsv = (this.data.rule?.features ?? []).join(', ');
  dependsOnCsv = (this.data.rule?.dependsOn ?? []).join(', ');

  private csv(v: string): string[] {
    return v.split(',').map(s => s.trim()).filter(Boolean);
  }

  isValid(): boolean {
    return !!(this.name.trim() && this.rule.trim());
  }

  save(): void {
    if (!this.isValid()) return;
    const input: AppBusinessRuleInput = {
      name: this.name.trim(),
      rule: this.rule.trim(),
      seq: this.seq.trim() || null,
      rationale: this.rationale.trim() || null,
      category: this.category || null,
      epicId: this.epicId || null,
      features: this.csv(this.featuresCsv),
      dependsOn: this.csv(this.dependsOnCsv),
      // preserve fields the form doesn't edit on an existing rule
      modifiesFeatures: this.data.rule?.modifiesFeatures ?? [],
      touches: this.data.rule?.touches ?? {},
      delta: this.data.rule?.delta ?? {},
    };
    this.dialogRef.close(input);
  }
}
