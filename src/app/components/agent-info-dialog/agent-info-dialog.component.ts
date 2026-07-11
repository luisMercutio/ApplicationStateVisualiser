import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { MatDialogModule, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { FormsModule } from '@angular/forms';
import { Store } from '@ngrx/store';
import { Subscription } from 'rxjs';
import { AppBusinessRule, BrAgentInfo } from '../../models/app-data.model';
import { AppDataActions } from '../../store/app-data/app-data.actions';
import { selectAgentInfo } from '../../store/app-data/app-data.selectors';

export interface AgentInfoDialogData {
  rule: AppBusinessRule;
  connectionId: string;
}

// Manage the Additional Agent Information attached to one Business Rule. These
// descriptions are loaded into the developer agents once development has reached
// this BR (its seq), so they read as guidance to a future implementer.
@Component({
  selector: 'app-agent-info-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule, MatTooltipModule, FormsModule],
  template: `
    <h2 mat-dialog-title>Agent info · {{ data.rule.name }}</h2>
    <mat-dialog-content>
      <p class="rule">{{ data.rule.rule }}</p>
      <p class="hint">
        Extra context for the AI agents. Each entry is loaded into the developer agents
        at the start of a development task once the BR being built has reached this rule
        (execution order ≥ {{ data.rule.executionOrder ?? '—' }}).
      </p>

      @for (e of entries(); track e.id) {
        <div class="entry">
          <mat-form-field appearance="outline" class="grow">
            <textarea matInput rows="2" [ngModel]="drafts()[e.id] ?? e.description"
                      (ngModelChange)="setDraft(e.id, $event)"></textarea>
          </mat-form-field>
          <button mat-icon-button matTooltip="Save" [disabled]="!isDirty(e)" (click)="save(e)"><mat-icon>save</mat-icon></button>
          <button mat-icon-button matTooltip="Delete" (click)="remove(e)"><mat-icon>delete</mat-icon></button>
        </div>
      }
      @if (!entries().length) {
        <p class="empty">No agent information yet for this Business Rule.</p>
      }

      <div class="entry add">
        <mat-form-field appearance="outline" class="grow">
          <mat-label>Add agent information</mat-label>
          <textarea matInput rows="2" [(ngModel)]="newText"
                    placeholder="e.g. The app is created in multiple languages — externalise all user-facing strings and add a locale to the schema."></textarea>
        </mat-form-field>
        <button mat-icon-button matTooltip="Add" [disabled]="!newText.trim()" (click)="add()"><mat-icon>add</mat-icon></button>
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Close</button>
    </mat-dialog-actions>
  `,
  styles: [`
    mat-dialog-content { min-width: 520px; padding-top: 4px !important; }
    .rule { font-size: 13px; color: #333; margin: 0 0 4px; }
    .hint { font-size: 11px; color: #888; margin: 0 0 12px; }
    .entry { display: flex; align-items: flex-start; gap: 4px; }
    .entry.add { margin-top: 4px; border-top: 1px dashed #ddd; padding-top: 10px; }
    .grow { flex: 1; }
    .empty { color: #999; font-size: 13px; font-style: italic; margin: 4px 0 8px; }
  `],
})
export class AgentInfoDialogComponent implements OnInit, OnDestroy {
  private store = inject(Store);
  data = inject<AgentInfoDialogData>(MAT_DIALOG_DATA);

  entries = signal<BrAgentInfo[]>([]);
  drafts = signal<Record<string, string>>({});
  newText = '';

  private sub?: Subscription;

  ngOnInit(): void {
    // Live-bind to the store so create/update/delete reflect immediately.
    this.sub = this.store.select(selectAgentInfo).subscribe((all) =>
      this.entries.set(all.filter((i) => i.businessRuleId === this.data.rule.creationIndex)),
    );
  }

  ngOnDestroy(): void { this.sub?.unsubscribe(); }

  setDraft(id: string, value: string): void {
    this.drafts.set({ ...this.drafts(), [id]: value });
  }

  isDirty(e: BrAgentInfo): boolean {
    const d = this.drafts()[e.id];
    return d != null && d.trim() !== '' && d !== e.description;
  }

  save(e: BrAgentInfo): void {
    const description = (this.drafts()[e.id] ?? '').trim();
    if (!description || description === e.description) return;
    this.store.dispatch(AppDataActions.updateAgentInfo({
      connectionId: this.data.connectionId, infoId: e.id, input: { businessRuleId: e.businessRuleId, description },
    }));
  }

  remove(e: BrAgentInfo): void {
    this.store.dispatch(AppDataActions.deleteAgentInfo({ connectionId: this.data.connectionId, infoId: e.id }));
  }

  add(): void {
    const description = this.newText.trim();
    if (!description) return;
    this.store.dispatch(AppDataActions.createAgentInfo({
      connectionId: this.data.connectionId, input: { businessRuleId: this.data.rule.creationIndex, description },
    }));
    this.newText = '';
  }
}
