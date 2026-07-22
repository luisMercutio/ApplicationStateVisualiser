import { Component, inject } from '@angular/core';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { FormsModule } from '@angular/forms';
import { AppBusinessRule, AppBusinessRuleInput, Epic } from '../../models/app-data.model';
import { BR_CATEGORY_COLORS } from '../../models/business-rule.model';

export interface BrFormData {
  rule?: AppBusinessRule;
  epics: Epic[];
  defaultEpicId?: string | null;
}

// What the dialog returns to the caller. `submitToClaude` distinguishes the two
// actions: a plain Save vs. Submit with Claude (which also spawns a session).
export interface BrFormResult {
  input: AppBusinessRuleInput;
  submitToClaude: boolean;
}

// Create or edit one Business Rule in the active application's DB. Returns an
// AppBusinessRuleInput to the caller (the BR List), which owns the connection id.
@Component({
  selector: 'app-br-form-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatIconModule, FormsModule],
  template: `
    <h2 mat-dialog-title>{{ editing ? 'Edit Business Rule' : 'Add Business Rule' }}</h2>
    <mat-dialog-content>
      <div class="form-grid">
        <mat-form-field appearance="outline" class="col-span-2">
          <mat-label>Name / ID</mat-label>
          <input matInput [(ngModel)]="name" placeholder="e.g. BR-001" autocomplete="off" />
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
      <button mat-flat-button color="accent" class="claude-btn" [disabled]="!isValid()"
              (click)="submitWithClaude()"
              title="Save and hand this rule to a new Claude session in its own worktree">
        <mat-icon>smart_toy</mat-icon> Submit with Claude
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    mat-dialog-content { min-width: 480px; padding-top: 8px !important; }
    .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 12px; }
    .col-span-2 { grid-column: 1 / -1; }
    .claude-btn mat-icon { vertical-align: middle; font-size: 18px; height: 18px; width: 18px; margin-right: 2px; }
  `],
})
export class BrFormDialogComponent {
  private dialogRef = inject(MatDialogRef<BrFormDialogComponent>);
  data = inject<BrFormData>(MAT_DIALOG_DATA);

  editing = !!this.data.rule;
  categories = Object.keys(BR_CATEGORY_COLORS);

  name = this.data.rule?.name ?? '';
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

  private buildInput(): AppBusinessRuleInput {
    return {
      name: this.name.trim(),
      rule: this.rule.trim(),
      // execution order is managed by drag-drop; preserve it on edit, let the
      // server assign it on create (null → appended to the end).
      executionOrder: this.data.rule?.executionOrder ?? null,
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
  }

  save(): void {
    if (!this.isValid()) return;
    this.dialogRef.close({ input: this.buildInput(), submitToClaude: false } satisfies BrFormResult);
  }

  submitWithClaude(): void {
    if (!this.isValid()) return;
    this.dialogRef.close({ input: this.buildInput(), submitToClaude: true } satisfies BrFormResult);
  }
}
