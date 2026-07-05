import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Store } from '@ngrx/store';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Subscription } from 'rxjs';
import { ComposedState, FeatureInfo } from '../../../models/rule-index.model';
import { RulesActions } from '../../../store/rules/rules.actions';
import {
  selectFeatures, selectActiveFeature, selectComposedState,
  selectRulesLoading, selectRulesError, selectRuleEntries,
} from '../../../store/rules/rules.selectors';

const KIND_LABELS: Record<string, { label: string; icon: string }> = {
  entities: { label: 'Backend entities', icon: 'schema' },
  endpoints: { label: 'API endpoints', icon: 'api' },
  slices: { label: 'Store slices', icon: 'inventory_2' },
  components: { label: 'Components', icon: 'widgets' },
  selectors: { label: 'Selectors', icon: 'filter_alt' },
};

@Component({
  selector: 'app-composed-state',
  standalone: true,
  imports: [FormsModule, MatIconModule, MatSelectModule, MatFormFieldModule, MatTooltipModule],
  template: `
    <div class="cs-root">
      <div class="cs-toolbar">
        <mat-form-field appearance="outline" subscriptSizing="dynamic" class="feat-select">
          <mat-label>State as of feature</mat-label>
          <mat-select [ngModel]="activeFeature()" (ngModelChange)="setFeature($event)">
            <mat-option [value]="null">▸ Whole application</mat-option>
            @for (f of features(); track f.name) {
              <mat-option [value]="f.name">{{ f.name }} <span class="opt-seq">seq {{ f.minSeq }}–{{ f.maxSeq }}</span></mat-option>
            }
          </mat-select>
        </mat-form-field>
        @if (composed(); as c) {
          <span class="folded" matTooltip="Rules folded into this state">folded {{ c.included }}/{{ c.total }} rules · seq ≤ {{ c.cutSeq === '999999' ? '∞' : c.cutSeq }}</span>
        }
        <span class="spacer"></span>
        <button class="reload" (click)="reload()" matTooltip="Reload rules"><mat-icon>refresh</mat-icon></button>
      </div>

      @if (loading()) {
        <div class="msg">Loading rules…</div>
      } @else if (error()) {
        <div class="msg err">{{ error() }}</div>
      } @else if (!entryCount()) {
        <div class="msg">No <code>.claude/rules/_index.json</code> found. Run <code>extract-brs.mjs</code> on this project.</div>
      } @else if (composed(); as c) {
        <div class="cs-body">
          <p class="note"><mat-icon>info</mat-icon> Composed by folding every rule's delta up to the cut — not read from a snapshot file.</p>
          @for (kind of kinds; track kind) {
            @if (c.kinds[kind]?.length) {
              <section>
                <h4><mat-icon>{{ meta(kind).icon }}</mat-icon> {{ meta(kind).label }} ({{ c.kinds[kind].length }})</h4>
                <div class="items">
                  @for (a of c.kinds[kind]; track a.target) {
                    <div class="item" [class.touched]="a.modifiedBy.length">
                      <span class="tgt">{{ a.target }}</span>
                      <span class="owner">{{ a.owner }}</span>
                      @if (a.modifiedBy.length) {
                        <span class="mods" matTooltip="Modified by later features">~ {{ a.modifiedBy.join(', ') }}</span>
                      }
                    </div>
                  }
                </div>
              </section>
            }
          }
          @if (allEmpty(c)) {
            <div class="msg">No structural artifacts up to this cut (the rules so far are behavioural/constraint-only, or their deltas aren't populated yet).</div>
          }
          @if (c.crossFeature.length) {
            <section class="xfeat">
              <h4><mat-icon>sync_alt</mat-icon> Cross-feature changes ({{ c.crossFeature.length }})</h4>
              <p class="sub">A rule modifying an artifact owned by another feature.</p>
              @for (x of c.crossFeature; track x.from + x.to + x.target) {
                <div class="xrow"><b>{{ x.from }}</b> <mat-icon>arrow_forward</mat-icon> <b>{{ x.to }}</b>
                  <span class="xt">{{ x.kind }}: {{ x.target }}</span>
                </div>
              }
            </section>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .cs-root { display: flex; flex-direction: column; height: 100%; background: #fbfbfd; }
    .cs-toolbar { display: flex; align-items: center; gap: 10px; padding: 6px 10px; border-bottom: 1px solid #e6e6e6; }
    .feat-select { width: 280px; }
    .opt-seq { color: #aaa; font-size: 11px; margin-left: 4px; }
    .folded { font-size: 12px; color: #777; }
    .spacer { flex: 1; }
    .reload { border: none; background: none; cursor: pointer; color: #888; }
    .msg { padding: 20px; color: #999; text-align: center; }
    .msg.err { color: #c62828; }
    .cs-body { flex: 1; overflow: auto; padding: 8px 14px 20px; }
    .note { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #888; margin: 6px 0 12px; }
    .note mat-icon { font-size: 16px; width: 16px; height: 16px; }
    section { margin-bottom: 16px; }
    h4 { display: flex; align-items: center; gap: 6px; font-size: 13px; color: #444; margin: 0 0 8px; }
    h4 mat-icon { font-size: 17px; width: 17px; height: 17px; color: #5c6bc0; }
    .items { display: flex; flex-direction: column; gap: 4px; }
    .item { display: flex; align-items: center; gap: 8px; padding: 5px 10px; background: white; border: 1px solid #e6e6e6; border-radius: 5px; font-size: 13px; }
    .item.touched { border-left: 3px solid #ff7043; }
    .tgt { font-family: monospace; color: #222; }
    .owner { margin-left: auto; font-size: 11px; color: #7986cb; background: #e8eaf6; padding: 1px 8px; border-radius: 10px; }
    .mods { font-size: 11px; color: #e65100; background: #fff3e0; padding: 1px 8px; border-radius: 10px; }
    .xfeat h4 mat-icon { color: #ff7043; }
    .sub { font-size: 11px; color: #999; margin: 0 0 8px; }
    .xrow { display: flex; align-items: center; gap: 6px; font-size: 13px; padding: 4px 0; }
    .xrow mat-icon { font-size: 15px; width: 15px; height: 15px; color: #ff7043; }
    .xt { font-family: monospace; font-size: 12px; color: #666; margin-left: 6px; }
  `],
})
export class ComposedStateComponent implements OnInit, OnDestroy {
  private store = inject(Store);
  private subs: Subscription[] = [];

  kinds = Object.keys(KIND_LABELS);
  features = signal<FeatureInfo[]>([]);
  activeFeature = signal<string | null>(null);
  composed = signal<ComposedState | null>(null);
  loading = signal(false);
  error = signal<string | null>(null);
  entryCount = signal(0);

  meta(kind: string) { return KIND_LABELS[kind]; }
  allEmpty(c: ComposedState): boolean { return this.kinds.every((k) => !(c.kinds[k]?.length)); }

  ngOnInit(): void {
    this.store.dispatch(RulesActions.loadRules());
    this.subs.push(
      this.store.select(selectFeatures).subscribe((f) => this.features.set(f)),
      this.store.select(selectActiveFeature).subscribe((f) => this.activeFeature.set(f)),
      this.store.select(selectComposedState).subscribe((c) => this.composed.set(c)),
      this.store.select(selectRulesLoading).subscribe((v) => this.loading.set(v)),
      this.store.select(selectRulesError).subscribe((v) => this.error.set(v)),
      this.store.select(selectRuleEntries).subscribe((e) => this.entryCount.set(e.length)),
    );
  }

  ngOnDestroy(): void { this.subs.forEach((s) => s.unsubscribe()); }

  setFeature(feature: string | null): void {
    this.store.dispatch(RulesActions.setActiveFeature({ feature }));
  }

  reload(): void { this.store.dispatch(RulesActions.loadRules()); }
}
