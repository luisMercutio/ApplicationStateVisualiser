import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { MatDialogModule, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { FormsModule } from '@angular/forms';
import { Store } from '@ngrx/store';
import { Subscription } from 'rxjs';
import { AppBusinessRule } from '../../models/app-data.model';
import {
  SpecChangeType, SpecSource, TechnicalSpec, TechnicalSpecArtifact, TechnicalSpecEntry,
} from '../../models/technical-spec.model';
import { TechnicalSpecsActions } from '../../store/technical-specs/technical-specs.actions';
import { selectSpecByRuleId } from '../../store/technical-specs/technical-specs.selectors';

export interface TechnicalSpecDialogData {
  rule: AppBusinessRule;
  connectionId: string;
}

// Manage the single Technical Specification attached to one Business Rule: its
// title/overview/status, its implementation entries (user/agent authored) and
// its generated artifacts (file changes). Live-binds to the store so create /
// update / delete of the spec and its children reflect immediately.
@Component({
  selector: 'app-technical-spec-dialog',
  standalone: true,
  imports: [
    MatDialogModule, MatButtonModule, MatIconModule, MatFormFieldModule,
    MatInputModule, MatSelectModule, MatTooltipModule, FormsModule,
  ],
  template: `
    <h2 mat-dialog-title>Technical spec · {{ data.rule.name }}</h2>
    <mat-dialog-content>
      <p class="rule">{{ data.rule.rule }}</p>

      @if (spec(); as s) {
        <!-- ── Spec header: title / overview / status ── -->
        <div class="spec-head">
          <mat-form-field appearance="outline" class="grow">
            <mat-label>Title</mat-label>
            <input matInput [ngModel]="titleDraft() ?? (s.title ?? '')" (ngModelChange)="titleDraft.set($event)" />
          </mat-form-field>
          <mat-form-field appearance="outline" class="status">
            <mat-label>Status</mat-label>
            <input matInput [ngModel]="statusDraft() ?? s.status" (ngModelChange)="statusDraft.set($event)" />
          </mat-form-field>
        </div>
        <div class="spec-head">
          <mat-form-field appearance="outline" class="grow">
            <mat-label>Overview</mat-label>
            <textarea matInput rows="2" [ngModel]="overviewDraft() ?? (s.overview ?? '')"
                      (ngModelChange)="overviewDraft.set($event)"></textarea>
          </mat-form-field>
          <button mat-icon-button matTooltip="Save spec" [disabled]="!specDirty(s)" (click)="saveSpec(s)"><mat-icon>save</mat-icon></button>
          <button mat-icon-button matTooltip="Delete spec" (click)="deleteSpec(s)"><mat-icon>delete_forever</mat-icon></button>
        </div>

        <!-- ── Entries ── -->
        <h3 class="section">Implementation entries</h3>
        @for (e of s.entries; track e.id) {
          <div class="entry">
            <mat-form-field appearance="outline" class="grow">
              <textarea matInput rows="2" [ngModel]="entryDescVal(e)"
                        (ngModelChange)="setEntryDraft(e.id, $event)"></textarea>
            </mat-form-field>
            <mat-form-field appearance="outline" class="src">
              <mat-select [ngModel]="entrySrcVal(e)" (ngModelChange)="setEntrySrc(e.id, $event)">
                <mat-option value="user">User</mat-option>
                <mat-option value="agent">Agent</mat-option>
              </mat-select>
            </mat-form-field>
            <button mat-icon-button matTooltip="Save" [disabled]="!entryDirty(e)" (click)="saveEntry(s, e)"><mat-icon>save</mat-icon></button>
            <button mat-icon-button matTooltip="Delete" (click)="removeEntry(s, e)"><mat-icon>delete</mat-icon></button>
          </div>
        }
        @if (!s.entries.length) { <p class="empty">No entries yet.</p> }

        <div class="entry add">
          <mat-form-field appearance="outline" class="grow">
            <mat-label>Add entry</mat-label>
            <textarea matInput rows="2" [(ngModel)]="newEntryText"
                      placeholder="e.g. Add an ArchiveController.archive() that soft-deletes and emits an audit event."></textarea>
          </mat-form-field>
          <mat-form-field appearance="outline" class="src">
            <mat-select [(ngModel)]="newEntrySource">
              <mat-option value="user">User</mat-option>
              <mat-option value="agent">Agent</mat-option>
            </mat-select>
          </mat-form-field>
          <button mat-icon-button matTooltip="Add" [disabled]="!newEntryText.trim()" (click)="addEntry(s)"><mat-icon>add</mat-icon></button>
        </div>

        <!-- ── Artifacts ── -->
        <h3 class="section">Artifacts (file changes)</h3>
        @for (a of s.artifacts; track a.id) {
          <div class="artifact">
            <mat-form-field appearance="outline" class="kind">
              <mat-label>Kind</mat-label>
              <input matInput [ngModel]="artVal(a, 'kind')" (ngModelChange)="setArt(a.id, 'kind', $event)" />
            </mat-form-field>
            <mat-form-field appearance="outline" class="grow">
              <mat-label>Path</mat-label>
              <input matInput [ngModel]="artVal(a, 'path')" (ngModelChange)="setArt(a.id, 'path', $event)" />
            </mat-form-field>
            <mat-form-field appearance="outline" class="change">
              <mat-select [ngModel]="artChangeVal(a)" (ngModelChange)="setArt(a.id, 'changeType', $event)">
                <mat-option value="add">add</mat-option>
                <mat-option value="modify">modify</mat-option>
                <mat-option value="remove">remove</mat-option>
              </mat-select>
            </mat-form-field>
            <mat-form-field appearance="outline" class="grow">
              <mat-label>Summary</mat-label>
              <input matInput [ngModel]="artVal(a, 'summary')" (ngModelChange)="setArt(a.id, 'summary', $event)" />
            </mat-form-field>
            <button mat-icon-button matTooltip="Save" [disabled]="!artifactDirty(a)" (click)="saveArtifact(s, a)"><mat-icon>save</mat-icon></button>
            <button mat-icon-button matTooltip="Delete" (click)="removeArtifact(s, a)"><mat-icon>delete</mat-icon></button>
          </div>
        }
        @if (!s.artifacts.length) { <p class="empty">No artifacts yet.</p> }

        <div class="artifact add">
          <mat-form-field appearance="outline" class="kind">
            <mat-label>Kind</mat-label>
            <input matInput [(ngModel)]="newArtKind" placeholder="endpoint" />
          </mat-form-field>
          <mat-form-field appearance="outline" class="grow">
            <mat-label>Path</mat-label>
            <input matInput [(ngModel)]="newArtPath" placeholder="src/…" />
          </mat-form-field>
          <mat-form-field appearance="outline" class="change">
            <mat-select [(ngModel)]="newArtChange">
              <mat-option value="add">add</mat-option>
              <mat-option value="modify">modify</mat-option>
              <mat-option value="remove">remove</mat-option>
            </mat-select>
          </mat-form-field>
          <mat-form-field appearance="outline" class="grow">
            <mat-label>Summary</mat-label>
            <input matInput [(ngModel)]="newArtSummary" placeholder="optional" />
          </mat-form-field>
          <button mat-icon-button matTooltip="Add" [disabled]="!newArtKind.trim() || !newArtPath.trim()" (click)="addArtifact(s)"><mat-icon>add</mat-icon></button>
        </div>
      } @else {
        <div class="no-spec">
          <p class="empty">No technical specification exists for this Business Rule yet.</p>
          <button mat-flat-button color="primary" (click)="createSpec()">
            <mat-icon>add</mat-icon> Create technical specification
          </button>
        </div>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Close</button>
    </mat-dialog-actions>
  `,
  styles: [`
    mat-dialog-content { min-width: 640px; max-width: 820px; padding-top: 4px !important; }
    .rule { font-size: 13px; color: #333; margin: 0 0 10px; }
    .section { font-size: 13px; font-weight: 600; color: #00695c; margin: 14px 0 6px; border-top: 1px dashed #ddd; padding-top: 10px; }
    .spec-head { display: flex; align-items: flex-start; gap: 6px; }
    .entry, .artifact { display: flex; align-items: flex-start; gap: 4px; }
    .entry.add, .artifact.add { margin-top: 4px; }
    .grow { flex: 1; } .status { width: 130px; } .src { width: 110px; }
    .kind { width: 130px; } .change { width: 120px; }
    .empty { color: #999; font-size: 13px; font-style: italic; margin: 4px 0 8px; }
    .no-spec { text-align: center; padding: 20px 0; }
  `],
})
export class TechnicalSpecDialogComponent implements OnInit, OnDestroy {
  private store = inject(Store);
  data = inject<TechnicalSpecDialogData>(MAT_DIALOG_DATA);

  spec = signal<TechnicalSpec | null>(null);

  // Spec header drafts (null = untouched, fall back to store value).
  titleDraft = signal<string | null>(null);
  overviewDraft = signal<string | null>(null);
  statusDraft = signal<string | null>(null);

  // Entry drafts.
  entryDrafts = signal<Record<string, string>>({});
  entrySrc = signal<Record<string, SpecSource>>({});
  newEntryText = '';
  newEntrySource: SpecSource = 'user';

  // Artifact drafts.
  artKind = signal<Record<string, string>>({});
  artPath = signal<Record<string, string>>({});
  artChange = signal<Record<string, SpecChangeType>>({});
  artSummary = signal<Record<string, string>>({});
  newArtKind = '';
  newArtPath = '';
  newArtChange: SpecChangeType = 'add';
  newArtSummary = '';

  private sub?: Subscription;

  ngOnInit(): void {
    this.sub = this.store.select(selectSpecByRuleId).subscribe((byRule) =>
      this.spec.set(byRule[this.data.rule.creationIndex] ?? null),
    );
  }

  ngOnDestroy(): void { this.sub?.unsubscribe(); }

  private cid(): string { return this.data.connectionId; }

  // ── Spec header ──
  createSpec(): void {
    this.store.dispatch(TechnicalSpecsActions.createSpec({
      connectionId: this.cid(), input: { businessRuleId: this.data.rule.creationIndex },
    }));
  }

  specDirty(s: TechnicalSpec): boolean {
    const t = this.titleDraft(), o = this.overviewDraft(), st = this.statusDraft();
    return (t != null && t !== (s.title ?? '')) ||
           (o != null && o !== (s.overview ?? '')) ||
           (st != null && st.trim() !== '' && st !== s.status);
  }

  saveSpec(s: TechnicalSpec): void {
    this.store.dispatch(TechnicalSpecsActions.updateSpec({
      connectionId: this.cid(), specId: s.id, input: {
        title: (this.titleDraft() ?? s.title) || null,
        overview: (this.overviewDraft() ?? s.overview) || null,
        status: (this.statusDraft() ?? s.status) || s.status,
      },
    }));
    this.titleDraft.set(null); this.overviewDraft.set(null); this.statusDraft.set(null);
  }

  deleteSpec(s: TechnicalSpec): void {
    if (confirm(`Delete the technical specification for "${this.data.rule.name}"? Its entries and artifacts are removed.`)) {
      this.store.dispatch(TechnicalSpecsActions.deleteSpec({ connectionId: this.cid(), specId: s.id }));
    }
  }

  // ── Entries ──
  entryDescVal(e: TechnicalSpecEntry): string {
    const d = this.entryDrafts();
    return e.id in d ? d[e.id] : e.description;
  }

  entrySrcVal(e: TechnicalSpecEntry): SpecSource {
    const s = this.entrySrc();
    return e.id in s ? s[e.id] : e.source;
  }

  setEntryDraft(id: string, value: string): void { this.entryDrafts.set({ ...this.entryDrafts(), [id]: value }); }
  setEntrySrc(id: string, value: SpecSource): void { this.entrySrc.set({ ...this.entrySrc(), [id]: value }); }

  entryDirty(e: TechnicalSpecEntry): boolean {
    const d = this.entryDrafts()[e.id], src = this.entrySrc()[e.id];
    const descChanged = d != null && d.trim() !== '' && d !== e.description;
    const srcChanged = src != null && src !== e.source;
    return descChanged || srcChanged;
  }

  saveEntry(s: TechnicalSpec, e: TechnicalSpecEntry): void {
    const description = (this.entryDrafts()[e.id] ?? e.description).trim();
    const source = this.entrySrc()[e.id] ?? e.source;
    if (!description) return;
    this.store.dispatch(TechnicalSpecsActions.updateEntry({
      connectionId: this.cid(), specId: s.id, entryId: e.id, input: { description, source },
    }));
  }

  removeEntry(s: TechnicalSpec, e: TechnicalSpecEntry): void {
    this.store.dispatch(TechnicalSpecsActions.deleteEntry({ connectionId: this.cid(), specId: s.id, entryId: e.id }));
  }

  addEntry(s: TechnicalSpec): void {
    const description = this.newEntryText.trim();
    if (!description) return;
    this.store.dispatch(TechnicalSpecsActions.createEntry({
      connectionId: this.cid(), specId: s.id, input: { description, source: this.newEntrySource },
    }));
    this.newEntryText = ''; this.newEntrySource = 'user';
  }

  // ── Artifacts ──
  // Resolve the shown value: a live draft if present, else the stored value.
  artVal(a: TechnicalSpecArtifact, field: 'kind' | 'path' | 'summary'): string {
    const draft = field === 'kind' ? this.artKind() : field === 'path' ? this.artPath() : this.artSummary();
    if (a.id in draft) return draft[a.id];
    return field === 'summary' ? (a.summary ?? '') : a[field];
  }

  artChangeVal(a: TechnicalSpecArtifact): SpecChangeType {
    const draft = this.artChange();
    return a.id in draft ? draft[a.id] : a.changeType;
  }

  setArt(id: string, field: 'kind' | 'path' | 'changeType' | 'summary', value: string): void {
    if (field === 'kind') this.artKind.set({ ...this.artKind(), [id]: value });
    else if (field === 'path') this.artPath.set({ ...this.artPath(), [id]: value });
    else if (field === 'changeType') this.artChange.set({ ...this.artChange(), [id]: value as SpecChangeType });
    else this.artSummary.set({ ...this.artSummary(), [id]: value });
  }

  artifactDirty(a: TechnicalSpecArtifact): boolean {
    const k = this.artKind()[a.id], p = this.artPath()[a.id], c = this.artChange()[a.id], sm = this.artSummary()[a.id];
    return (k != null && k !== a.kind) ||
           (p != null && p !== a.path) ||
           (c != null && c !== a.changeType) ||
           (sm != null && sm !== (a.summary ?? ''));
  }

  saveArtifact(s: TechnicalSpec, a: TechnicalSpecArtifact): void {
    const kind = (this.artKind()[a.id] ?? a.kind).trim();
    const path = (this.artPath()[a.id] ?? a.path).trim();
    const changeType = this.artChange()[a.id] ?? a.changeType;
    const summary = (this.artSummary()[a.id] ?? a.summary ?? '').trim() || null;
    if (!kind || !path) return;
    this.store.dispatch(TechnicalSpecsActions.updateArtifact({
      connectionId: this.cid(), specId: s.id, artifactId: a.id, input: { kind, path, changeType, summary },
    }));
  }

  removeArtifact(s: TechnicalSpec, a: TechnicalSpecArtifact): void {
    this.store.dispatch(TechnicalSpecsActions.deleteArtifact({ connectionId: this.cid(), specId: s.id, artifactId: a.id }));
  }

  addArtifact(s: TechnicalSpec): void {
    const kind = this.newArtKind.trim(), path = this.newArtPath.trim();
    if (!kind || !path) return;
    this.store.dispatch(TechnicalSpecsActions.createArtifact({
      connectionId: this.cid(), specId: s.id, input: {
        kind, path, changeType: this.newArtChange, summary: this.newArtSummary.trim() || null,
      },
    }));
    this.newArtKind = ''; this.newArtPath = ''; this.newArtChange = 'add'; this.newArtSummary = '';
  }
}
