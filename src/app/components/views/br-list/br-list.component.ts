import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import {
  CdkDropList, CdkDrag, CdkDragHandle, CdkDragDrop, moveItemInArray, transferArrayItem,
} from '@angular/cdk/drag-drop';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';
import { MatDialog } from '@angular/material/dialog';
import { Store } from '@ngrx/store';
import { Subscription } from 'rxjs';
import { AppBusinessRule, AppBusinessRuleInput, Epic } from '../../../models/app-data.model';
import { Note, NoteInput } from '../../../models/note.model';
import { categoryColor } from '../../../models/business-rule.model';
import { DbConnection } from '../../../models/db-connection.model';
import { AppDataActions } from '../../../store/app-data/app-data.actions';
import { selectEpicsWithRules, selectAppDataLoading, selectAppDataError, selectAgentInfoCountByRule, selectNotes } from '../../../store/app-data/app-data.selectors';
import { selectActiveConnection } from '../../../store/connections/connections.selectors';
import { BrFormDialogComponent, BrFormData, BrFormResult } from '../../br-form-dialog/br-form-dialog.component';
import { NoteFormDialogComponent, NoteDialogData } from '../../note-form-dialog/note-form-dialog.component';
import { EpicFormDialogComponent } from '../../epic-form-dialog/epic-form-dialog.component';
import { AgentInfoDialogComponent, AgentInfoDialogData } from '../../agent-info-dialog/agent-info-dialog.component';
import { SnapshotManagerDialogComponent, SnapshotManagerDialogData } from '../../snapshot-manager-dialog/snapshot-manager-dialog.component';

interface RuleList {
  epicId: string | null;      // null = the ungrouped bucket
  epic: Epic | null;
  rules: AppBusinessRule[];
}

const UNGROUPED = 'ungrouped';

/**
 * Business Rules for the ACTIVE application connection, grouped under their Epics.
 * Full CRUD (add / edit / delete for both BRs and Epics) writes to that
 * application's own database. Rules drag to reorder and across Epics (which
 * reassigns the Epic and rewrites the global executionOrder). Dropping a rule
 * into the ungrouped bucket spawns a fresh Epic that adopts it.
 */
@Component({
  selector: 'app-br-list',
  standalone: true,
  imports: [CdkDropList, CdkDrag, CdkDragHandle, MatIconModule, MatButtonModule, MatTooltipModule, MatMenuModule],
  template: `
    <div class="brl-root">
      <div class="brl-toolbar">
        <span class="title">Business Rules</span>
        @if (active(); as a) { <span class="conn">{{ a.name }}</span> }
        <span class="count">{{ ruleCount() }} rules · {{ epicCount() }} epics</span>
        <span class="spacer"></span>
        @if (active()) {
          <button mat-icon-button class="sm" matTooltip="Snapshots (capture / diff the BR ordering)" (click)="openSnapshots()"><mat-icon>photo_camera</mat-icon></button>
          <button mat-icon-button class="sm" matTooltip="Add Epic" (click)="addEpic()"><mat-icon>create_new_folder</mat-icon></button>
          <button mat-icon-button class="sm" matTooltip="Add Business Rule" (click)="addRule(null)"><mat-icon>add</mat-icon></button>
        }
        <button mat-icon-button class="sm" matTooltip="Reload" (click)="reload()"><mat-icon>refresh</mat-icon></button>
      </div>

      @if (!active()) {
        <div class="msg">Select an application connection in the toolbar to manage its Business Rules.</div>
      } @else if (loading()) {
        <div class="msg">Loading rules…</div>
      } @else if (error()) {
        <div class="msg err">{{ error() }}</div>
      } @else if (!ruleCount() && !epicCount()) {
        <div class="msg">No Business Rules yet. Use <mat-icon class="inline">add</mat-icon> to create the first one.</div>
      } @else {
        <div class="brl-scroll">
          @for (list of lists(); track list.epicId ?? UNGROUPED) {
            <div class="epic-group">
              <div class="epic-head" [class.ungrouped]="!list.epic">
                @if (list.epic; as e) {
                  <mat-icon>folder</mat-icon>
                  <span class="e-key">{{ e.key }}</span>
                  <span class="e-title">{{ e.title }}</span>
                  <span class="e-count">{{ list.rules.length }}</span>
                  <span class="spacer"></span>
                  <button mat-icon-button class="xs" matTooltip="Epic actions" [matMenuTriggerFor]="epicMenu"><mat-icon>more_vert</mat-icon></button>
                  <mat-menu #epicMenu="matMenu">
                    <button mat-menu-item (click)="addRule(e.id)"><mat-icon>add</mat-icon><span>Add BR to this epic</span></button>
                    <button mat-menu-item (click)="editEpic(e)"><mat-icon>edit</mat-icon><span>Edit epic</span></button>
                    <button mat-menu-item (click)="deleteEpic(e)"><mat-icon>delete</mat-icon><span>Delete epic (keeps its rules)</span></button>
                  </mat-menu>
                } @else {
                  <mat-icon>label_off</mat-icon>
                  <span class="e-title">Ungrouped</span>
                  <span class="e-count">{{ list.rules.length }}</span>
                  <span class="spacer"></span>
                }
              </div>

              <div class="brl-list" cdkDropList [id]="listId(list)" [cdkDropListData]="list.rules"
                   [cdkDropListConnectedTo]="allListIds()" (cdkDropListDropped)="drop($event)">
                @for (r of list.rules; track r.creationIndex) {
                  <div class="brl-row" cdkDrag [style.borderLeftColor]="color(r)">
                    <div class="handle" cdkDragHandle matTooltip="Drag to reorder / drop outside an epic to start a new one"><mat-icon>drag_indicator</mat-icon></div>
                    <span class="r-order">{{ r.executionOrder }}</span>
                    <div class="r-body">
                      <div class="r-rule">{{ r.rule }}</div>
                      <div class="r-meta">
                        <span class="r-name">{{ r.name }}</span>
                        @if (r.category) { <span class="r-cat" [style.background]="color(r)">{{ r.category }}</span> }
                        @if (r.needsToBeEstablished) {
                          <span class="r-establish" matTooltip="Handed to Claude — still to be established">
                            <mat-icon>smart_toy</mat-icon> needs establishing
                          </span>
                        }
                        @if (r.features.length) { <span class="r-feat">{{ r.features[0] }}</span> }
                      </div>
                    </div>
                    <button mat-icon-button class="xs row-menu" [class.has-info]="infoCounts()[r.creationIndex]"
                            matTooltip="Actions" [matMenuTriggerFor]="rowMenu">
                      <mat-icon>more_vert</mat-icon>
                      @if (infoCounts()[r.creationIndex]) { <span class="info-badge">{{ infoCounts()[r.creationIndex] }}</span> }
                    </button>
                    <mat-menu #rowMenu="matMenu">
                      <button mat-menu-item (click)="openAgentInfo(r)">
                        <mat-icon>psychology</mat-icon>
                        <span>Agent info@if (infoCounts()[r.creationIndex]) { ({{ infoCounts()[r.creationIndex] }})}</span>
                      </button>
                      <button mat-menu-item (click)="editNote(r)">
                        <mat-icon>{{ noteFor(r) ? 'sticky_note_2' : 'note_add' }}</mat-icon>
                        <span>{{ noteFor(r) ? 'Edit note' : 'Add note' }}</span>
                      </button>
                      <button mat-menu-item (click)="openClaudeSession(r)">
                        <mat-icon>smart_toy</mat-icon>
                        <span>Open Claude session</span>
                      </button>
                      <button mat-menu-item (click)="editRule(r)"><mat-icon>edit</mat-icon><span>Edit</span></button>
                      <button mat-menu-item (click)="deleteRule(r)"><mat-icon>delete</mat-icon><span>Delete</span></button>
                    </mat-menu>
                  </div>
                }
                @if (!list.rules.length) { <div class="empty-drop">Drop rules here</div> }
              </div>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .brl-root { display: flex; flex-direction: column; height: 100%; background: #fbfbfd; }
    .brl-toolbar { display: flex; align-items: center; gap: 6px; padding: 4px 8px; border-bottom: 1px solid #e6e6e6; font-size: 13px; }
    .brl-toolbar .title { font-weight: 600; color: #333; }
    .brl-toolbar .conn { font-size: 11px; color: #1565c0; background: #e3f2fd; padding: 1px 8px; border-radius: 10px; }
    .brl-toolbar .count { color: #999; font-size: 12px; }
    .spacer { flex: 1; } .sm { font-size: 12px; } .xs { width: 26px; height: 26px; line-height: 26px; }
    .xs mat-icon { font-size: 16px; width: 16px; height: 16px; }
    .row-menu { position: relative; color: #888; } .row-menu.has-info { color: #7b1fa2; }
    .info-badge { position: absolute; top: 0; right: 0; background: #7b1fa2; color: white; font-size: 9px;
                  line-height: 1; padding: 1px 3px; border-radius: 8px; min-width: 8px; text-align: center; }
    .msg { padding: 24px; color: #999; text-align: center; } .msg.err { color: #c62828; }
    .msg .inline { font-size: 15px; vertical-align: middle; }
    .brl-scroll { flex: 1; overflow-y: auto; padding: 8px; }
    .epic-group { margin-bottom: 12px; }
    .epic-head { display: flex; align-items: center; gap: 6px; padding: 4px 6px; border-radius: 6px 6px 0 0;
                 background: #eef1f6; border: 1px solid #dde1e8; border-bottom: none; font-size: 12px; }
    .epic-head.ungrouped { background: #f3f3f3; color: #888; }
    .epic-head mat-icon { font-size: 17px; width: 17px; height: 17px; color: #667; }
    .epic-head .e-key { font-family: monospace; font-weight: 700; color: #3f51b5; }
    .epic-head .e-title { font-weight: 600; color: #333; }
    .epic-head .e-count { font-size: 10px; color: #999; background: white; border-radius: 8px; padding: 0 6px; }
    .brl-list { border: 1px solid #dde1e8; border-radius: 0 0 6px 6px; padding: 6px; min-height: 20px; background: #fdfdfe; }
    .empty-drop { text-align: center; color: #bbb; font-size: 11px; padding: 8px; font-style: italic; }
    .brl-row { display: flex; align-items: center; gap: 8px; background: white; border: 1px solid #dcdfe4;
               border-left: 4px solid #999; border-radius: 6px; padding: 6px 6px 6px 10px; margin-bottom: 6px;
               box-shadow: 0 1px 3px rgba(0,0,0,0.06); box-sizing: border-box; }
    .brl-row:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.14); }
    .handle { cursor: grab; color: #bbb; display: flex; align-items: center; flex-shrink: 0; }
    .handle:active { cursor: grabbing; } .handle mat-icon { font-size: 20px; width: 20px; height: 20px; }
    .r-order { font-family: monospace; font-weight: 700; font-size: 11px; color: #3f51b5; flex-shrink: 0; min-width: 30px; }
    .r-body { min-width: 0; flex: 1; }
    .r-rule { font-size: 12px; color: #222; line-height: 1.35;
              display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .r-meta { display: flex; align-items: center; gap: 6px; margin-top: 3px; }
    .r-name { font-family: monospace; font-size: 10px; color: #888; }
    .r-feat { font-size: 10px; color: #999; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .r-cat { color: white; font-size: 9px; padding: 1px 7px; border-radius: 10px; text-transform: capitalize; flex-shrink: 0; }
    .r-establish { display: inline-flex; align-items: center; gap: 2px; color: white; background: #8e24aa;
                   font-size: 9px; padding: 1px 7px; border-radius: 10px; flex-shrink: 0; }
    .r-establish mat-icon { font-size: 11px; width: 11px; height: 11px; }
    .cdk-drag-preview { box-shadow: 0 5px 16px rgba(0,0,0,0.28); border-radius: 6px; }
    .cdk-drag-placeholder { opacity: 0.35; }
    .cdk-drag-animating, .brl-list.cdk-drop-list-dragging .brl-row:not(.cdk-drag-placeholder) { transition: transform 180ms cubic-bezier(0,0,0.2,1); }
  `],
})
export class BrListComponent implements OnInit, OnDestroy {
  private store = inject(Store);
  private dialog = inject(MatDialog);
  private subs: Subscription[] = [];

  active = signal<DbConnection | null>(null);
  loading = signal(false);
  error = signal<string | null>(null);
  lists = signal<RuleList[]>([]);
  infoCounts = signal<Record<string, number>>({});
  // The single note bound to each BR, keyed by BR name (one note per BR).
  notesByBr = signal<Record<string, Note>>({});

  private epics: Epic[] = [];

  UNGROUPED = UNGROUPED;

  ngOnInit(): void {
    this.subs.push(
      this.store.select(selectActiveConnection).subscribe((a) => this.active.set(a)),
      this.store.select(selectAppDataLoading).subscribe((v) => this.loading.set(v)),
      this.store.select(selectAppDataError).subscribe((v) => this.error.set(v)),
      this.store.select(selectAgentInfoCountByRule).subscribe((c) => this.infoCounts.set(c)),
      this.store.select(selectNotes).subscribe((notes) => {
        const byBr: Record<string, Note> = {};
        // One note per BR: first note referencing a BR name wins.
        for (const n of notes) for (const ref of n.relatedBrs) byBr[ref] ??= n;
        this.notesByBr.set(byBr);
      }),
      this.store.select(selectEpicsWithRules).subscribe(({ grouped, ungrouped }) => {
        this.epics = grouped.map((g) => g.epic);
        const lists: RuleList[] = grouped
          .sort((a, b) => seqCompare(a.epic.seq, b.epic.seq) || a.epic.title.localeCompare(b.epic.title))
          .map((g) => ({ epicId: g.epic.id, epic: g.epic, rules: sortRules(g.rules) }));
        lists.push({ epicId: null, epic: null, rules: sortRules(ungrouped) });
        this.lists.set(lists);
      }),
    );
  }

  ngOnDestroy(): void { this.subs.forEach((s) => s.unsubscribe()); }

  color(r: AppBusinessRule): string { return categoryColor(r.category ?? undefined); }
  ruleCount(): number { return this.lists().reduce((n, l) => n + l.rules.length, 0); }
  epicCount(): number { return this.epics.length; }

  listId(list: RuleList): string { return list.epicId ?? UNGROUPED; }
  allListIds(): string[] { return this.lists().map((l) => this.listId(l)); }

  private connId(): string | null { return this.active()?.id ?? null; }

  reload(): void {
    const id = this.connId();
    if (id) this.store.dispatch(AppDataActions.load({ connectionId: id }));
  }

  // ── Epic CRUD ──
  addEpic(): void {
    this.dialog.open(EpicFormDialogComponent).afterClosed().subscribe((input) => {
      const id = this.connId();
      if (input && id) this.store.dispatch(AppDataActions.createEpic({ connectionId: id, input }));
    });
  }

  editEpic(epic: Epic): void {
    this.dialog.open(EpicFormDialogComponent, { data: epic }).afterClosed().subscribe((input) => {
      const id = this.connId();
      if (input && id) this.store.dispatch(AppDataActions.updateEpic({ connectionId: id, epicId: epic.id, input }));
    });
  }

  deleteEpic(epic: Epic): void {
    const id = this.connId();
    if (id && confirm(`Delete epic "${epic.title}"? Its Business Rules are kept (moved to Ungrouped).`)) {
      this.store.dispatch(AppDataActions.deleteEpic({ connectionId: id, epicId: epic.id }));
    }
  }

  // ── Business Rule CRUD ──
  addRule(defaultEpicId: string | null): void {
    const data: BrFormData = { epics: this.epics, defaultEpicId };
    this.dialog.open(BrFormDialogComponent, { data }).afterClosed().subscribe((res: BrFormResult | undefined) => {
      const id = this.connId();
      if (!res || !id) return;
      if (res.submitToClaude) {
        this.store.dispatch(AppDataActions.submitToClaude({ connectionId: id, ruleId: null, input: res.input }));
      } else {
        this.store.dispatch(AppDataActions.createRule({ connectionId: id, input: res.input }));
      }
    });
  }

  editRule(rule: AppBusinessRule): void {
    const data: BrFormData = { rule, epics: this.epics };
    this.dialog.open(BrFormDialogComponent, { data }).afterClosed().subscribe((res: BrFormResult | undefined) => {
      const id = this.connId();
      if (!res || !id) return;
      if (res.submitToClaude) {
        this.store.dispatch(AppDataActions.submitToClaude({ connectionId: id, ruleId: rule.creationIndex, input: res.input }));
      } else {
        this.store.dispatch(AppDataActions.updateRule({ connectionId: id, ruleId: rule.creationIndex, input: res.input }));
      }
    });
  }

  deleteRule(rule: AppBusinessRule): void {
    const id = this.connId();
    if (id && confirm(`Delete Business Rule "${rule.name}"?`)) {
      this.store.dispatch(AppDataActions.deleteRule({ connectionId: id, ruleId: rule.creationIndex }));
    }
  }

  openAgentInfo(rule: AppBusinessRule): void {
    const id = this.connId();
    if (!id) return;
    const data: AgentInfoDialogData = { rule, connectionId: id };
    this.dialog.open(AgentInfoDialogComponent, { data });
  }

  // Hand this BR straight to a fresh Claude session (its own worktree + tmux)
  // seeded with the rule's full context — no edit dialog. Reuses the same
  // submit-to-Claude flow as the BR form's "Submit with Claude" button, so the
  // spawned session then surfaces on the Claude Sessions page.
  openClaudeSession(rule: AppBusinessRule): void {
    const id = this.connId();
    if (!id) return;
    this.store.dispatch(AppDataActions.submitToClaude({
      connectionId: id, ruleId: rule.creationIndex, input: ruleToInput(rule, {}),
    }));
  }

  /** The single note bound to this BR, if one exists. */
  noteFor(rule: AppBusinessRule): Note | undefined { return this.notesByBr()[rule.name]; }

  // Edit (or create) the one note attached to this BR. The note is bound to the
  // rule by name; the dialog locks that association so there is exactly one note
  // per BR.
  editNote(rule: AppBusinessRule): void {
    const existing = this.noteFor(rule) ?? null;
    const data: NoteDialogData = { note: existing, lockedBr: rule.name };
    this.dialog.open(NoteFormDialogComponent, { data }).afterClosed().subscribe((input: NoteInput | undefined) => {
      const id = this.connId();
      if (!input || !id) return;
      if (existing) this.store.dispatch(AppDataActions.updateNote({ connectionId: id, noteId: existing.id, input }));
      else this.store.dispatch(AppDataActions.createNote({ connectionId: id, input }));
    });
  }

  // Snapshots: capture the current Epic + BR set and diff it against a saved one.
  openSnapshots(): void {
    const conn = this.active();
    if (!conn) return;
    const data: SnapshotManagerDialogData = { connectionId: conn.id, connectionName: conn.name };
    this.dialog.open(SnapshotManagerDialogComponent, { data });
  }

  // ── Drag reorder / move across epics ──
  drop(ev: CdkDragDrop<AppBusinessRule[]>): void {
    const crossList = ev.previousContainer !== ev.container;
    if (!crossList) {
      if (ev.previousIndex === ev.currentIndex) return;
      moveItemInArray(ev.container.data, ev.previousIndex, ev.currentIndex);
    } else {
      transferArrayItem(ev.previousContainer.data, ev.container.data, ev.previousIndex, ev.currentIndex);
    }
    this.lists.set([...this.lists()]); // same inner arrays, new ref to refresh view
    // Dragging a rule out of its epic (into the ungrouped bucket) spawns a fresh
    // epic that adopts it, rather than leaving it ungrouped.
    const spawnRule = crossList && ev.container.id === UNGROUPED
      ? ev.container.data[ev.currentIndex] ?? null
      : null;
    this.persistOrder(spawnRule?.creationIndex ?? null);
  }

  /**
   * Rewrite the global executionOrder (and epicId) for every rule whose position
   * changed. `spawnRuleId`, if set, is a rule dragged out of its epic: instead of
   * leaving it ungrouped we create a fresh epic and move it there.
   */
  private persistOrder(spawnRuleId: string | null): void {
    const id = this.connId();
    if (!id) return;
    let order = 0;
    for (const list of this.lists()) {
      for (const r of list.rules) {
        order++;
        if (r.creationIndex === spawnRuleId) {
          this.store.dispatch(AppDataActions.moveRuleToNewEpic({
            connectionId: id, ruleId: r.creationIndex,
            input: ruleToInput(r, { executionOrder: order }), epicTitle: 'New Epic',
          }));
          continue;
        }
        if (r.executionOrder !== order || r.epicId !== list.epicId) {
          this.store.dispatch(AppDataActions.updateRule({
            connectionId: id, ruleId: r.creationIndex, input: ruleToInput(r, { executionOrder: order, epicId: list.epicId }),
          }));
        }
      }
    }
  }
}

function ruleToInput(r: AppBusinessRule, overrides: Partial<AppBusinessRuleInput>): AppBusinessRuleInput {
  return {
    name: r.name, rule: r.rule, executionOrder: r.executionOrder, rationale: r.rationale, category: r.category,
    epicId: r.epicId, features: r.features, modifiesFeatures: r.modifiesFeatures,
    dependsOn: r.dependsOn, touches: r.touches, delta: r.delta, ...overrides,
  };
}

/** Numeric-aware seq compare (Epics still use a Dewey seq string); nulls sort last. */
function seqCompare(a: string | null, b: string | null): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  const A = a.split('.').map(Number), B = b.split('.').map(Number);
  for (let i = 0; i < Math.max(A.length, B.length); i++) {
    const x = A[i] ?? -1, y = B[i] ?? -1;
    if (x !== y) return x - y;
  }
  return 0;
}

/** Numeric executionOrder compare; nulls sort last. */
function orderCompare(a: number | null, b: number | null): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return a - b;
}

function sortRules(rules: AppBusinessRule[]): AppBusinessRule[] {
  return [...rules].sort((a, b) => orderCompare(a.executionOrder, b.executionOrder) || a.name.localeCompare(b.name));
}
