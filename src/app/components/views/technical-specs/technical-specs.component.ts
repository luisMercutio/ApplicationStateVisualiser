import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog } from '@angular/material/dialog';
import { Store } from '@ngrx/store';
import { Subscription } from 'rxjs';
import { AppBusinessRule, Epic } from '../../../models/app-data.model';
import { TechnicalSpec } from '../../../models/technical-spec.model';
import { DbConnection } from '../../../models/db-connection.model';
import { selectEpicsWithRules } from '../../../store/app-data/app-data.selectors';
import {
  selectSpecByRuleId, selectTechnicalSpecsLoading, selectTechnicalSpecsError,
} from '../../../store/technical-specs/technical-specs.selectors';
import { selectActiveConnection } from '../../../store/connections/connections.selectors';
import { TechnicalSpecDialogComponent, TechnicalSpecDialogData } from '../../technical-spec-dialog/technical-spec-dialog.component';

interface SpecList {
  epicId: string | null;      // null = the ungrouped bucket
  epic: Epic | null;
  rules: AppBusinessRule[];
}

const UNGROUPED = 'ungrouped';

// Full page listing every Business Rule (grouped by Epic) alongside its Technical
// Specification: whether one exists, its status, entry/artifact counts, and the
// artifacts + entries inline. Opens the per-BR technical-spec dialog for editing.
@Component({
  selector: 'app-technical-specs',
  standalone: true,
  imports: [MatIconModule, MatButtonModule, MatTooltipModule],
  template: `
    <div class="ts-root">
      <div class="ts-toolbar">
        <span class="title">Technical Specifications</span>
        @if (active(); as a) { <span class="conn">{{ a.name }}</span> }
        <span class="count">{{ specCount() }} of {{ ruleCount() }} rules specced</span>
        <span class="spacer"></span>
      </div>

      @if (!active()) {
        <div class="msg">Select an application connection in the toolbar to manage its Technical Specifications.</div>
      } @else if (loading()) {
        <div class="msg">Loading technical specs…</div>
      } @else if (error()) {
        <div class="msg err">{{ error() }}</div>
      } @else if (!ruleCount()) {
        <div class="msg">No Business Rules yet. Create rules first, then attach technical specs.</div>
      } @else {
        <div class="ts-scroll">
          @for (list of lists(); track list.epicId ?? UNGROUPED) {
            <div class="epic-group">
              <div class="epic-head" [class.ungrouped]="!list.epic">
                @if (list.epic; as e) {
                  <mat-icon>folder</mat-icon>
                  <span class="e-key">{{ e.key }}</span>
                  <span class="e-title">{{ e.title }}</span>
                  <span class="e-count">{{ list.rules.length }}</span>
                } @else {
                  <mat-icon>label_off</mat-icon>
                  <span class="e-title">Ungrouped</span>
                  <span class="e-count">{{ list.rules.length }}</span>
                }
              </div>

              <div class="rule-list">
                @for (r of list.rules; track r.id) {
                  <div class="rule-card">
                    <div class="rc-head">
                      <span class="r-seq">{{ r.seq }}</span>
                      <span class="r-name">{{ r.name }}</span>
                      @if (specs()[r.id]; as s) {
                        <span class="status-chip">{{ s.status }}</span>
                        <span class="counts">{{ s.entries.length }} entr{{ s.entries.length === 1 ? 'y' : 'ies' }} · {{ s.artifacts.length }} artifact{{ s.artifacts.length === 1 ? '' : 's' }}</span>
                      } @else {
                        <span class="no-spec-chip">no spec</span>
                      }
                      <span class="spacer"></span>
                      <button mat-icon-button class="xs edit-btn" [class.has-spec]="specs()[r.id]"
                              matTooltip="Open technical spec" (click)="openSpec(r)">
                        <mat-icon>description</mat-icon>
                      </button>
                    </div>
                    <div class="r-rule">{{ r.rule }}</div>

                    @if (specs()[r.id]; as s) {
                      @if (s.overview) { <div class="overview">{{ s.overview }}</div> }

                      @if (s.artifacts.length) {
                        <div class="sub-head">Artifacts</div>
                        @for (a of s.artifacts; track a.id) {
                          <div class="art-row">
                            <span class="art-kind">{{ a.kind }}</span>
                            <span class="art-path">{{ a.path }}</span>
                            <span class="change-chip" [attr.data-change]="a.changeType">{{ a.changeType }}</span>
                            @if (a.summary) { <span class="art-summary">{{ a.summary }}</span> }
                          </div>
                        }
                      }

                      @if (s.entries.length) {
                        <div class="sub-head">Entries</div>
                        @for (e of s.entries; track e.id) {
                          <div class="entry-row">
                            <span class="src-chip" [attr.data-src]="e.source">{{ e.source }}</span>
                            <span class="entry-desc">{{ e.description }}</span>
                          </div>
                        }
                      }
                    }
                  </div>
                }
                @if (!list.rules.length) { <div class="empty">No rules in this group.</div> }
              </div>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .ts-root { display: flex; flex-direction: column; height: 100%; background: #fbfbfd; }
    .ts-toolbar { display: flex; align-items: center; gap: 6px; padding: 4px 8px; border-bottom: 1px solid #e6e6e6; font-size: 13px; }
    .ts-toolbar .title { font-weight: 600; color: #333; }
    .ts-toolbar .conn { font-size: 11px; color: #1565c0; background: #e3f2fd; padding: 1px 8px; border-radius: 10px; }
    .ts-toolbar .count { color: #999; font-size: 12px; }
    .spacer { flex: 1; }
    .xs { width: 30px; height: 30px; line-height: 30px; }
    .xs mat-icon { font-size: 18px; width: 18px; height: 18px; }
    .edit-btn { color: #bbb; } .edit-btn.has-spec { color: #00796b; }
    .msg { padding: 24px; color: #999; text-align: center; } .msg.err { color: #c62828; }
    .ts-scroll { flex: 1; overflow-y: auto; padding: 8px; }
    .epic-group { margin-bottom: 12px; }
    .epic-head { display: flex; align-items: center; gap: 6px; padding: 4px 6px; border-radius: 6px 6px 0 0;
                 background: #eef1f6; border: 1px solid #dde1e8; border-bottom: none; font-size: 12px; }
    .epic-head.ungrouped { background: #f3f3f3; color: #888; }
    .epic-head mat-icon { font-size: 17px; width: 17px; height: 17px; color: #667; }
    .epic-head .e-key { font-family: monospace; font-weight: 700; color: #3f51b5; }
    .epic-head .e-title { font-weight: 600; color: #333; }
    .epic-head .e-count { font-size: 10px; color: #999; background: white; border-radius: 8px; padding: 0 6px; }
    .rule-list { border: 1px solid #dde1e8; border-radius: 0 0 6px 6px; padding: 6px; background: #fdfdfe; }
    .empty { text-align: center; color: #bbb; font-size: 11px; padding: 8px; font-style: italic; }
    .rule-card { background: white; border: 1px solid #dcdfe4; border-left: 4px solid #00796b; border-radius: 6px;
                 padding: 8px 10px; margin-bottom: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.06); }
    .rc-head { display: flex; align-items: center; gap: 8px; }
    .r-seq { font-family: monospace; font-weight: 700; font-size: 11px; color: #3f51b5; min-width: 30px; }
    .r-name { font-family: monospace; font-size: 11px; color: #555; }
    .status-chip { font-size: 10px; color: white; background: #00796b; border-radius: 10px; padding: 1px 8px; text-transform: capitalize; }
    .no-spec-chip { font-size: 10px; color: #999; background: #eee; border-radius: 10px; padding: 1px 8px; }
    .counts { font-size: 10px; color: #999; }
    .r-rule { font-size: 12px; color: #222; line-height: 1.35; margin-top: 4px; }
    .overview { font-size: 11px; color: #555; margin-top: 4px; font-style: italic; }
    .sub-head { font-size: 10px; font-weight: 700; color: #00695c; text-transform: uppercase; margin: 8px 0 3px; }
    .art-row { display: flex; align-items: center; gap: 6px; font-size: 11px; padding: 1px 0; }
    .art-kind { font-family: monospace; color: #555; background: #f0f0f0; border-radius: 4px; padding: 0 5px; }
    .art-path { font-family: monospace; color: #333; }
    .change-chip { font-size: 9px; color: white; border-radius: 8px; padding: 1px 6px; text-transform: uppercase; }
    .change-chip[data-change="add"] { background: #2e7d32; }
    .change-chip[data-change="modify"] { background: #ef6c00; }
    .change-chip[data-change="remove"] { background: #c62828; }
    .art-summary { color: #888; font-size: 10px; }
    .entry-row { display: flex; align-items: flex-start; gap: 6px; font-size: 11px; padding: 2px 0; }
    .src-chip { font-size: 9px; color: white; border-radius: 8px; padding: 1px 6px; text-transform: uppercase; flex-shrink: 0; }
    .src-chip[data-src="user"] { background: #1565c0; }
    .src-chip[data-src="agent"] { background: #6a1b9a; }
    .entry-desc { color: #333; line-height: 1.35; }
  `],
})
export class TechnicalSpecsComponent implements OnInit, OnDestroy {
  private store = inject(Store);
  private dialog = inject(MatDialog);
  private subs: Subscription[] = [];

  active = signal<DbConnection | null>(null);
  loading = signal(false);
  error = signal<string | null>(null);
  lists = signal<SpecList[]>([]);
  specs = signal<Record<string, TechnicalSpec>>({});

  UNGROUPED = UNGROUPED;

  ngOnInit(): void {
    this.subs.push(
      this.store.select(selectActiveConnection).subscribe((a) => this.active.set(a)),
      this.store.select(selectTechnicalSpecsLoading).subscribe((v) => this.loading.set(v)),
      this.store.select(selectTechnicalSpecsError).subscribe((v) => this.error.set(v)),
      this.store.select(selectSpecByRuleId).subscribe((m) => this.specs.set(m)),
      this.store.select(selectEpicsWithRules).subscribe(({ grouped, ungrouped }) => {
        const lists: SpecList[] = grouped
          .sort((a, b) => seqCompare(a.epic.seq, b.epic.seq) || a.epic.title.localeCompare(b.epic.title))
          .map((g) => ({ epicId: g.epic.id, epic: g.epic, rules: sortRules(g.rules) }));
        lists.push({ epicId: null, epic: null, rules: sortRules(ungrouped) });
        this.lists.set(lists);
      }),
    );
  }

  ngOnDestroy(): void { this.subs.forEach((s) => s.unsubscribe()); }

  ruleCount(): number { return this.lists().reduce((n, l) => n + l.rules.length, 0); }
  specCount(): number { return Object.keys(this.specs()).length; }

  openSpec(rule: AppBusinessRule): void {
    const id = this.active()?.id;
    if (!id) return;
    const data: TechnicalSpecDialogData = { rule, connectionId: id };
    this.dialog.open(TechnicalSpecDialogComponent, { data });
  }
}

/** Numeric-aware seq compare; nulls sort last. */
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

function sortRules(rules: AppBusinessRule[]): AppBusinessRule[] {
  return [...rules].sort((a, b) => seqCompare(a.seq, b.seq) || a.name.localeCompare(b.name));
}
