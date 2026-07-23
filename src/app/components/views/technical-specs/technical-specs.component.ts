import { Component, computed, effect, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { FormsModule } from '@angular/forms';
import { Store } from '@ngrx/store';
import { toSignal } from '@angular/core/rxjs-interop';
import { AppBusinessRule } from '../../../models/app-data.model';
import { categoryColor } from '../../../models/business-rule.model';
import {
  SpecChangeType, SpecSource, TechnicalSpec, TechnicalSpecArtifact, TechnicalSpecEntry,
} from '../../../models/technical-spec.model';
import { TechnicalSpecsActions } from '../../../store/technical-specs/technical-specs.actions';
import { selectSpecByRuleId } from '../../../store/technical-specs/technical-specs.selectors';
import { selectAppRules } from '../../../store/app-data/app-data.selectors';
import { selectActiveConnection } from '../../../store/connections/connections.selectors';
import { WorkspaceService } from '../../../services/workspace.service';

// The Tech Specs page shows the FULL technical specification of exactly ONE
// Business Rule (chosen from the Business Rules list — there is no list here, the
// BR list already lives on that page). The rule is selected via
// WorkspaceService.openTechnicalSpec(); this page edits its title/overview/status,
// its implementation entries (user/agent authored) and its generated artifacts.
@Component({
  selector: 'app-technical-specs',
  standalone: true,
  imports: [
    MatIconModule, MatButtonModule, MatTooltipModule,
    MatFormFieldModule, MatInputModule, MatSelectModule, FormsModule,
  ],
  template: `
    <div class="ts-root">
      <div class="ts-toolbar">
        <span class="title">Technical Specification</span>
        @if (rule(); as r) {
          <span class="r-name">{{ r.name }}</span>
          @if (r.category) { <span class="r-cat" [style.background]="color(r)">{{ r.category }}</span> }
        }
        <span class="spacer"></span>
        @if (rule()) {
          <button mat-stroked-button class="sm" (click)="openDiagram()">
            <mat-icon>account_tree</mat-icon> Diagram
          </button>
        }
      </div>

      @if (!active()) {
        <div class="msg">Select an application connection in the toolbar to manage Technical Specifications.</div>
      } @else if (!rule()) {
        <div class="msg">
          <mat-icon class="inline">description</mat-icon>
          No Business Rule selected. Open a rule's <b>Technical spec</b> from its row menu on the
          <b>Business Rules</b> page.
        </div>
      } @else {
        <div class="ts-scroll">
          @if (rule(); as r) {
            <div class="br-head">
              <div class="r-rule">{{ r.rule }}</div>
              @if (r.rationale) { <div class="r-rationale">{{ r.rationale }}</div> }
            </div>

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
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .ts-root { display: flex; flex-direction: column; height: 100%; background: #fbfbfd; }
    .ts-toolbar { display: flex; align-items: center; gap: 8px; padding: 4px 8px; border-bottom: 1px solid #e6e6e6; font-size: 13px; }
    .ts-toolbar .title { font-weight: 600; color: #333; }
    .ts-toolbar .r-name { font-family: monospace; font-size: 12px; color: #00796b; font-weight: 700; }
    .ts-toolbar .r-cat { color: white; font-size: 9px; padding: 1px 7px; border-radius: 10px; text-transform: capitalize; }
    .spacer { flex: 1; } .sm { font-size: 12px; } .sm mat-icon { font-size: 16px; width: 16px; height: 16px; }
    .msg { padding: 32px; color: #888; text-align: center; } .msg .inline { vertical-align: middle; margin-right: 4px; }
    .ts-scroll { flex: 1; overflow-y: auto; padding: 16px; max-width: 900px; width: 100%; margin: 0 auto; box-sizing: border-box; }
    .br-head { border-left: 4px solid #00796b; background: #fff; border: 1px solid #dcdfe4; border-left-width: 4px;
               border-radius: 6px; padding: 10px 12px; margin-bottom: 14px; box-shadow: 0 1px 3px rgba(0,0,0,0.06); }
    .r-rule { font-size: 14px; color: #222; line-height: 1.4; }
    .r-rationale { font-size: 12px; color: #777; line-height: 1.4; margin-top: 6px; font-style: italic; }
    .section { font-size: 13px; font-weight: 600; color: #00695c; margin: 18px 0 6px; border-top: 1px dashed #ddd; padding-top: 12px; }
    .spec-head { display: flex; align-items: flex-start; gap: 6px; }
    .entry, .artifact { display: flex; align-items: flex-start; gap: 4px; }
    .entry.add, .artifact.add { margin-top: 4px; }
    .grow { flex: 1; } .status { width: 140px; } .src { width: 110px; }
    .kind { width: 140px; } .change { width: 120px; }
    .empty { color: #999; font-size: 13px; font-style: italic; margin: 4px 0 8px; }
    .no-spec { text-align: center; padding: 28px 0; }
  `],
})
export class TechnicalSpecsComponent {
  private store = inject(Store);
  private workspace = inject(WorkspaceService);

  private rules = toSignal(this.store.select(selectAppRules), { initialValue: [] as AppBusinessRule[] });
  private specByRule = toSignal(this.store.select(selectSpecByRuleId), { initialValue: {} as Record<string, TechnicalSpec> });
  active = toSignal(this.store.select(selectActiveConnection), { initialValue: null });

  private selectedId = this.workspace.techSpecBrId;
  rule = computed(() => this.rules().find((r) => r.creationIndex === this.selectedId()) ?? null);
  spec = computed<TechnicalSpec | null>(() => this.specByRule()[this.selectedId()] ?? null);

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

  constructor() {
    // Switching to a different BR clears any in-flight edit drafts so one rule's
    // unsaved edits never bleed into another's spec.
    let lastId = '';
    effect(() => {
      const id = this.selectedId();
      if (id === lastId) return;
      lastId = id;
      this.titleDraft.set(null); this.overviewDraft.set(null); this.statusDraft.set(null);
      this.entryDrafts.set({}); this.entrySrc.set({});
      this.artKind.set({}); this.artPath.set({}); this.artChange.set({}); this.artSummary.set({});
      this.newEntryText = ''; this.newEntrySource = 'user';
      this.newArtKind = ''; this.newArtPath = ''; this.newArtChange = 'add'; this.newArtSummary = '';
    });
  }

  color(r: AppBusinessRule): string { return categoryColor(r.category ?? undefined); }

  openDiagram(): void {
    const r = this.rule();
    if (r) this.workspace.openBrDiagram(r.creationIndex);
  }

  private cid(): string | null { return this.active()?.id ?? null; }

  // ── Spec header ──
  createSpec(): void {
    const id = this.cid(), r = this.rule();
    if (!id || !r) return;
    this.store.dispatch(TechnicalSpecsActions.createSpec({
      connectionId: id, input: { businessRuleId: r.creationIndex },
    }));
  }

  specDirty(s: TechnicalSpec): boolean {
    const t = this.titleDraft(), o = this.overviewDraft(), st = this.statusDraft();
    return (t != null && t !== (s.title ?? '')) ||
           (o != null && o !== (s.overview ?? '')) ||
           (st != null && st.trim() !== '' && st !== s.status);
  }

  saveSpec(s: TechnicalSpec): void {
    const id = this.cid();
    if (!id) return;
    this.store.dispatch(TechnicalSpecsActions.updateSpec({
      connectionId: id, specId: s.id, input: {
        title: (this.titleDraft() ?? s.title) || null,
        overview: (this.overviewDraft() ?? s.overview) || null,
        status: (this.statusDraft() ?? s.status) || s.status,
      },
    }));
    this.titleDraft.set(null); this.overviewDraft.set(null); this.statusDraft.set(null);
  }

  deleteSpec(s: TechnicalSpec): void {
    const id = this.cid(), r = this.rule();
    if (!id) return;
    if (confirm(`Delete the technical specification for "${r?.name ?? 'this rule'}"? Its entries and artifacts are removed.`)) {
      this.store.dispatch(TechnicalSpecsActions.deleteSpec({ connectionId: id, specId: s.id }));
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
    const id = this.cid();
    if (!id) return;
    const description = (this.entryDrafts()[e.id] ?? e.description).trim();
    const source = this.entrySrc()[e.id] ?? e.source;
    if (!description) return;
    this.store.dispatch(TechnicalSpecsActions.updateEntry({
      connectionId: id, specId: s.id, entryId: e.id, input: { description, source },
    }));
  }

  removeEntry(s: TechnicalSpec, e: TechnicalSpecEntry): void {
    const id = this.cid();
    if (!id) return;
    this.store.dispatch(TechnicalSpecsActions.deleteEntry({ connectionId: id, specId: s.id, entryId: e.id }));
  }

  addEntry(s: TechnicalSpec): void {
    const id = this.cid();
    if (!id) return;
    const description = this.newEntryText.trim();
    if (!description) return;
    this.store.dispatch(TechnicalSpecsActions.createEntry({
      connectionId: id, specId: s.id, input: { description, source: this.newEntrySource },
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
    const id = this.cid();
    if (!id) return;
    const kind = (this.artKind()[a.id] ?? a.kind).trim();
    const path = (this.artPath()[a.id] ?? a.path).trim();
    const changeType = this.artChange()[a.id] ?? a.changeType;
    const summary = (this.artSummary()[a.id] ?? a.summary ?? '').trim() || null;
    if (!kind || !path) return;
    this.store.dispatch(TechnicalSpecsActions.updateArtifact({
      connectionId: id, specId: s.id, artifactId: a.id, input: { kind, path, changeType, summary },
    }));
  }

  removeArtifact(s: TechnicalSpec, a: TechnicalSpecArtifact): void {
    const id = this.cid();
    if (!id) return;
    this.store.dispatch(TechnicalSpecsActions.deleteArtifact({ connectionId: id, specId: s.id, artifactId: a.id }));
  }

  addArtifact(s: TechnicalSpec): void {
    const id = this.cid();
    if (!id) return;
    const kind = this.newArtKind.trim(), path = this.newArtPath.trim();
    if (!kind || !path) return;
    this.store.dispatch(TechnicalSpecsActions.createArtifact({
      connectionId: id, specId: s.id, input: {
        kind, path, changeType: this.newArtChange, summary: this.newArtSummary.trim() || null,
      },
    }));
    this.newArtKind = ''; this.newArtPath = ''; this.newArtChange = 'add'; this.newArtSummary = '';
  }
}
