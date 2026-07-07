import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { CdkDropList, CdkDrag, CdkDragHandle, CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Store } from '@ngrx/store';
import { Subscription } from 'rxjs';
import { RuleEntry, deweyCompare } from '../../../models/rule-index.model';
import { categoryColor } from '../../../models/business-rule.model';
import { RulesActions } from '../../../store/rules/rules.actions';
import { selectRuleEntries, selectRulesLoading, selectRulesError } from '../../../store/rules/rules.selectors';
import { FileService } from '../../../services/file.service';
import { selectRootPath } from '../../../store/layout/layout.selectors';

/**
 * A flat, drag-to-reorder list of every Business Rule. The order is app-owned
 * (like BR node positions): persisted to .claude/architecture/br-order.json via
 * /api/br-order, so it travels with the project and /uc-generate never touches it.
 * Rules the saved order doesn't mention fall in afterwards, sorted by Dewey seq.
 */
@Component({
  selector: 'app-br-list',
  standalone: true,
  imports: [CdkDropList, CdkDrag, CdkDragHandle, MatIconModule, MatButtonModule, MatTooltipModule],
  template: `
    <div class="brl-root">
      <div class="brl-toolbar">
        <span class="title">Business Rules</span>
        <span class="count">{{ items().length }} rules</span>
        <span class="spacer"></span>
        @if (status() === 'saving') { <span class="stat">Saving…</span> }
        @else if (status() === 'saved') { <span class="stat ok"><mat-icon>check</mat-icon> Saved</span> }
        <button mat-icon-button class="sm" matTooltip="Reset to sequence order" (click)="resetOrder()"><mat-icon>sort</mat-icon></button>
        <button mat-icon-button class="sm" matTooltip="Reload rules" (click)="reload()"><mat-icon>refresh</mat-icon></button>
      </div>

      @if (loading()) {
        <div class="msg">Loading rules…</div>
      } @else if (error()) {
        <div class="msg err">{{ error() }}</div>
      } @else if (!items().length) {
        <div class="msg">No <code>.claude/rules/_index.json</code> found. Run <code>extract-brs.mjs</code> on this project.</div>
      } @else {
        <div class="brl-list" cdkDropList (cdkDropListDropped)="drop($event)">
          @for (r of items(); track r.name) {
            <div class="brl-row" cdkDrag [style.borderLeftColor]="color(r)">
              <div class="handle" cdkDragHandle matTooltip="Drag to reorder"><mat-icon>drag_indicator</mat-icon></div>
              <span class="r-seq">{{ r.seq }}</span>
              <div class="r-body">
                <div class="r-rule">{{ r.rule }}</div>
                <div class="r-meta">
                  <span class="r-feat">{{ r.features[0] }}</span>
                  <span class="r-cat" [style.background]="color(r)">{{ r.category }}</span>
                </div>
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
    .brl-toolbar .title { font-weight: 600; color: #333; } .brl-toolbar .count { color: #999; font-size: 12px; }
    .spacer { flex: 1; } .sm { font-size: 12px; }
    .stat { font-size: 11px; color: #999; display: flex; align-items: center; gap: 2px; }
    .stat.ok { color: #43a047; } .stat mat-icon { font-size: 15px; width: 15px; height: 15px; }
    .msg { padding: 24px; color: #999; text-align: center; } .msg.err { color: #c62828; }
    .brl-list { flex: 1; overflow-y: auto; padding: 8px; }
    .brl-row { display: flex; align-items: center; gap: 8px; background: white; border: 1px solid #dcdfe4;
               border-left: 4px solid #999; border-radius: 6px; padding: 6px 10px; margin-bottom: 6px;
               box-shadow: 0 1px 3px rgba(0,0,0,0.06); box-sizing: border-box; }
    .brl-row:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.14); }
    .handle { cursor: grab; color: #bbb; display: flex; align-items: center; flex-shrink: 0; }
    .handle:active { cursor: grabbing; } .handle mat-icon { font-size: 20px; width: 20px; height: 20px; }
    .r-seq { font-family: monospace; font-weight: 700; font-size: 11px; color: #3f51b5; flex-shrink: 0; min-width: 34px; }
    .r-body { min-width: 0; flex: 1; }
    .r-rule { font-size: 12px; color: #222; line-height: 1.35;
              display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .r-meta { display: flex; align-items: center; gap: 6px; margin-top: 3px; }
    .r-feat { font-size: 10px; color: #999; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .r-cat { color: white; font-size: 9px; padding: 1px 7px; border-radius: 10px; text-transform: capitalize; flex-shrink: 0; }
    /* CDK drag-drop feedback */
    .cdk-drag-preview { box-shadow: 0 5px 16px rgba(0,0,0,0.28); border-radius: 6px; }
    .cdk-drag-placeholder { opacity: 0.35; }
    .cdk-drag-animating, .brl-list.cdk-drop-list-dragging .brl-row:not(.cdk-drag-placeholder) { transition: transform 180ms cubic-bezier(0,0,0.2,1); }
  `],
})
export class BrListComponent implements OnInit, OnDestroy {
  private store = inject(Store);
  private fileService = inject(FileService);
  private subs: Subscription[] = [];

  items = signal<RuleEntry[]>([]);
  loading = signal(false);
  error = signal<string | null>(null);
  status = signal<'' | 'saving' | 'saved'>('');

  private entries: RuleEntry[] = [];
  private savedOrder: string[] = [];
  private rootPath: string | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private statusTimer: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void {
    this.store.dispatch(RulesActions.loadRules());
    this.subs.push(
      this.store.select(selectRuleEntries).subscribe((e) => { this.entries = e; this.rebuild(); }),
      this.store.select(selectRulesLoading).subscribe((v) => this.loading.set(v)),
      this.store.select(selectRulesError).subscribe((v) => this.error.set(v)),
      this.store.select(selectRootPath).subscribe((root) => {
        this.rootPath = root;
        if (root) this.fileService.getBrOrder(root).subscribe((o) => { this.savedOrder = o ?? []; this.rebuild(); });
      }),
    );
  }

  ngOnDestroy(): void {
    this.subs.forEach((s) => s.unsubscribe());
    if (this.saveTimer) clearTimeout(this.saveTimer);
    if (this.statusTimer) clearTimeout(this.statusTimer);
  }

  color(r: RuleEntry): string { return categoryColor(r.category); }

  /** Saved order first (names still present), then any unlisted rules by Dewey seq. */
  private rebuild(): void {
    const byName = new Map(this.entries.map((r) => [r.name, r]));
    const used = new Set<string>();
    const ordered: RuleEntry[] = [];
    for (const name of this.savedOrder) {
      const r = byName.get(name);
      if (r && !used.has(name)) { ordered.push(r); used.add(name); }
    }
    const rest = this.entries.filter((r) => !used.has(r.name)).sort((a, b) => deweyCompare(a.seq, b.seq));
    this.items.set([...ordered, ...rest]);
  }

  drop(ev: CdkDragDrop<RuleEntry[]>): void {
    if (ev.previousIndex === ev.currentIndex) return;
    const arr = [...this.items()];
    moveItemInArray(arr, ev.previousIndex, ev.currentIndex);
    this.items.set(arr);
    this.savedOrder = arr.map((r) => r.name);
    this.persist();
  }

  /** Drop the custom order and fall back to Dewey seq — then persist that as the new order. */
  resetOrder(): void {
    this.savedOrder = [];
    this.rebuild();
    this.savedOrder = this.items().map((r) => r.name);
    this.persist();
  }

  reload(): void { this.store.dispatch(RulesActions.loadRules()); }

  private persist(): void {
    if (!this.rootPath) return;
    const root = this.rootPath;
    const order = this.items().map((r) => r.name);
    this.status.set('saving');
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.fileService.saveBrOrder(root, order).subscribe({
        next: () => { this.status.set('saved'); this.flashClear(); },
        error: () => this.status.set(''),
      });
    }, 400);
  }

  private flashClear(): void {
    if (this.statusTimer) clearTimeout(this.statusTimer);
    this.statusTimer = setTimeout(() => this.status.set(''), 1500);
  }
}
