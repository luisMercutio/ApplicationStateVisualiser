import { Component, OnInit, OnDestroy, HostListener, inject, signal, computed } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';
import { Store } from '@ngrx/store';
import { Subscription } from 'rxjs';
import { RuleEntry, RuleDelta, DELTA_KINDS, featuresInOrder, deweyCompare } from '../../../models/rule-index.model';
import { categoryColor, BrTouches } from '../../../models/business-rule.model';
import { RulesActions } from '../../../store/rules/rules.actions';
import { selectRuleEntries, selectRulesLoading, selectRulesError } from '../../../store/rules/rules.selectors';
import { BrActions } from '../../../store/br/br.actions';
import { FileService } from '../../../services/file.service';
import { selectRootPath } from '../../../store/layout/layout.selectors';

const NODE_W = 220;
const NODE_H = 74;
const V_GAP = 210;   // vertical distance between feature bands
const H_GAP = 250;   // horizontal distance between rules within a band
const DRIFT = 44;    // rightward drift per band
const ORIGIN = 60;

interface EdgeLine { from: string; to: string; x1: number; y1: number; x2: number; y2: number; }
type Pos = { x: number; y: number };

@Component({
  selector: 'app-br-graph',
  standalone: true,
  imports: [DecimalPipe, MatIconModule, MatButtonModule, MatTooltipModule, MatMenuModule],
  template: `
    <div class="br-root">
      <div class="br-toolbar">
        <span class="title">Business Rule Net</span>
        <span class="count">{{ entries().length }} rules · {{ edges().length }} deps · {{ featureCount() }} features</span>
        <span class="spacer"></span>
        @if (selectedName()) {
          <button mat-button class="sm" (click)="select(null)"><mat-icon>close</mat-icon> Clear</button>
        }
        <button mat-icon-button class="sm" matTooltip="Zoom out" (click)="zoomBy(-0.1)"><mat-icon>remove</mat-icon></button>
        <span class="zoom">{{ (zoom() * 100) | number:'1.0-0' }}%</span>
        <button mat-icon-button class="sm" matTooltip="Zoom in" (click)="zoomBy(0.1)"><mat-icon>add</mat-icon></button>
        <button mat-icon-button class="sm" matTooltip="Re-run auto layout" (click)="relayout()"><mat-icon>auto_fix_high</mat-icon></button>
        <button mat-icon-button class="sm" matTooltip="Reload rules" (click)="reload()"><mat-icon>refresh</mat-icon></button>
      </div>

      <div class="legend">
        @for (c of legend; track c.cat) { <span class="lg"><i [style.background]="c.color"></i>{{ c.cat }}</span> }
      </div>

      @if (loading()) {
        <div class="msg">Loading rules…</div>
      } @else if (error()) {
        <div class="msg err">{{ error() }}</div>
      } @else if (!entries().length) {
        <div class="msg">No <code>.claude/rules/_index.json</code> found. Run <code>extract-brs.mjs</code> on this project.</div>
      } @else {
        <div class="br-main">
          <div class="br-scroll" (mousedown)="onBackgroundDown($event)">
            <div class="br-canvas" [style.width.px]="canvas().w" [style.height.px]="canvas().h"
                 [style.transform]="'scale(' + zoom() + ')'">
              <svg class="edges" [attr.width]="canvas().w" [attr.height]="canvas().h">
                @for (e of edgeLines(); track e.from + '->' + e.to) {
                  <path [attr.d]="edgePath(e)" class="edge"
                        [class.hot]="isEdgeHot(e)" [class.dim]="selectedName() && !isEdgeHot(e)"></path>
                }
              </svg>
              @for (r of entries(); track r.name) {
                <div class="node"
                     [class.selected]="r.name === selectedName()"
                     [class.connected]="connected().has(r.name)"
                     [class.dim]="selectedName() && !connected().has(r.name)"
                     [style.left.px]="pos()[r.name]?.x ?? 0" [style.top.px]="pos()[r.name]?.y ?? 0"
                     [style.width.px]="nodeW" [style.borderLeftColor]="color(r)"
                     (mousedown)="onNodeDown($event, r.name)" [matTooltip]="r.rule">
                  <div class="n-head">
                    <span class="n-seq">{{ r.seq }}</span>
                    <span class="n-feat">{{ r.features[0] }}</span>
                    <button mat-icon-button class="n-menu" (mousedown)="$event.stopPropagation()"
                            [matMenuTriggerFor]="brMenu" (menuOpened)="select(r.name)" matTooltip="Views for this rule">
                      <mat-icon>more_vert</mat-icon>
                    </button>
                  </div>
                  <div class="n-rule">{{ r.rule }}</div>
                </div>
              }
            </div>
          </div>

          @if (selected(); as sel) {
            <div class="br-detail">
              <div class="d-head">
                <span class="d-seq" [style.color]="color(sel)">{{ sel.seq }}</span>
                <span class="d-feat">{{ sel.features[0] }}</span>
                <span class="d-cat" [style.background]="color(sel)">{{ sel.category }}</span>
                <button mat-icon-button class="sm" (click)="select(null)"><mat-icon>close</mat-icon></button>
              </div>
              <div class="d-name">{{ sel.name }}</div>
              <div class="d-rule">{{ sel.rule }}</div>

              @if (sel.dependsOn.length) {
                <div class="d-group"><div class="d-label"><mat-icon>arrow_upward</mat-icon> Depends on</div>
                  <div class="chips">
                    @for (d of sel.dependsOn; track d) { <span class="chip link" (click)="select(d)">{{ d }}</span> }
                  </div>
                </div>
              }
              @if (dependents().length) {
                <div class="d-group"><div class="d-label"><mat-icon>arrow_downward</mat-icon> Required by</div>
                  <div class="chips">
                    @for (d of dependents(); track d) { <span class="chip link" (click)="select(d)">{{ d }}</span> }
                  </div>
                </div>
              }

              <div class="d-group">
                <div class="d-label"><mat-icon>bolt</mat-icon> Delta</div>
                @if (deltaRows(sel.delta).length) {
                  @for (row of deltaRows(sel.delta); track row) { <div class="t-item">{{ row }}</div> }
                } @else { <div class="t-empty">behavioural / constraint rule — no structural change</div> }
                @if (sel.modifiesFeatures.length) {
                  <div class="t-item xf">changes features: {{ sel.modifiesFeatures.join(', ') }}</div>
                }
              </div>

              @if (sel.touches?.tests?.length) {
                <div class="d-group"><div class="d-label"><mat-icon>checklist</mat-icon> Test library ({{ sel.touches!.tests!.length }})</div>
                  @for (t of sel.touches!.tests!; track t) { <div class="t-item">{{ t }}</div> }
                </div>
              }
            </div>
          }
        </div>
      }

      <mat-menu #brMenu="matMenu">
        <button mat-menu-item (click)="focusCut()"><mat-icon>filter_center_focus</mat-icon> Compose state up to here</button>
        <button mat-menu-item (click)="highlight()"><mat-icon>hub</mat-icon> Highlight in other panels</button>
      </mat-menu>
    </div>
  `,
  styles: [`
    .br-root { display: flex; flex-direction: column; height: 100%; background: #fbfbfd; }
    .br-toolbar { display: flex; align-items: center; gap: 6px; padding: 4px 8px; border-bottom: 1px solid #e6e6e6; font-size: 13px; }
    .br-toolbar .title { font-weight: 600; color: #333; } .br-toolbar .count { color: #999; font-size: 12px; }
    .spacer { flex: 1; } .sm { font-size: 12px; } .zoom { font-size: 12px; color: #666; width: 38px; text-align: center; }
    .legend { display: flex; gap: 10px; padding: 3px 10px; border-bottom: 1px solid #eee; flex-wrap: wrap; }
    .lg { display: flex; align-items: center; gap: 4px; font-size: 11px; color: #777; text-transform: capitalize; }
    .lg i { width: 10px; height: 10px; border-radius: 2px; display: inline-block; }
    .msg { padding: 24px; color: #999; text-align: center; } .msg.err { color: #c62828; }
    .br-main { flex: 1; display: flex; min-height: 0; }
    .br-scroll { flex: 1; overflow: auto; position: relative; }
    .br-canvas { position: relative; transform-origin: 0 0; }
    svg.edges { position: absolute; top: 0; left: 0; pointer-events: none; overflow: visible; }
    .edge { fill: none; stroke: #c2c8d0; stroke-width: 1.5; }
    .edge.hot { stroke: #ff7043; stroke-width: 2.5; } .edge.dim { opacity: 0.12; }
    .node { position: absolute; background: white; border: 1px solid #dcdfe4; border-left: 4px solid #999;
            border-radius: 6px; padding: 5px 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); cursor: grab;
            user-select: none; box-sizing: border-box; height: ${NODE_H}px; overflow: hidden; }
    .node:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.16); }
    .node.selected { border-color: #ff7043; box-shadow: 0 0 0 2px #ff7043; }
    .node.connected { border-color: #ffab91; } .node.dim { opacity: 0.28; }
    .n-head { display: flex; align-items: center; gap: 6px; }
    .n-seq { font-family: monospace; font-weight: 700; font-size: 11px; color: #3f51b5; }
    .n-feat { font-size: 10px; color: #999; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .n-menu { width: 20px; height: 20px; line-height: 20px; margin-left: auto; flex-shrink: 0; }
    .n-menu mat-icon { font-size: 15px; width: 15px; height: 15px; color: #999; }
    .n-rule { font-size: 11px; color: #555; line-height: 1.25; margin-top: 2px;
              display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .br-detail { width: 310px; flex-shrink: 0; border-left: 1px solid #e0e0e0; background: white; overflow-y: auto; padding: 10px 12px; }
    .d-head { display: flex; align-items: center; gap: 6px; }
    .d-seq { font-family: monospace; font-weight: 700; font-size: 15px; }
    .d-feat { font-size: 11px; color: #999; }
    .d-cat { margin-left: auto; color: white; font-size: 10px; padding: 1px 8px; border-radius: 10px; text-transform: capitalize; }
    .d-name { font-family: monospace; font-size: 11px; color: #aaa; margin: 6px 0 2px; word-break: break-all; }
    .d-rule { font-size: 13px; line-height: 1.5; color: #222; margin: 4px 0 8px; }
    .d-group { margin-top: 10px; border-top: 1px solid #f0f0f0; padding-top: 8px; }
    .d-label { display: flex; align-items: center; gap: 5px; font-size: 11px; font-weight: 600; color: #777; text-transform: uppercase; letter-spacing: 0.3px; margin-bottom: 5px; }
    .d-label mat-icon { font-size: 15px; width: 15px; height: 15px; }
    .chips { display: flex; flex-wrap: wrap; gap: 4px; }
    .chip { font-family: monospace; font-size: 10px; background: #eef1f5; padding: 1px 7px; border-radius: 10px; color: #444; }
    .chip.link { cursor: pointer; } .chip.link:hover { background: #ffccbc; }
    .t-item { font-size: 11px; color: #555; padding: 3px 0; border-bottom: 1px dotted #eee; line-height: 1.4; }
    .t-item.xf { color: #e65100; } .t-empty { font-size: 12px; color: #bbb; }
  `],
})
export class BrGraphComponent implements OnInit, OnDestroy {
  private store = inject(Store);
  private fileService = inject(FileService);
  private subs: Subscription[] = [];

  nodeW = NODE_W;
  legend = ['auth', 'validation', 'workflow', 'data', 'ui', 'routing', 'integration', 'other']
    .map((cat) => ({ cat, color: categoryColor(cat) }));

  entries = signal<RuleEntry[]>([]);
  pos = signal<Record<string, Pos>>({});
  selectedName = signal<string | null>(null);
  loading = signal(false);
  error = signal<string | null>(null);
  zoom = signal(1);

  private byName = computed(() => { const m: Record<string, RuleEntry> = {}; for (const r of this.entries()) m[r.name] = r; return m; });
  private saved: Record<string, Pos> = {};
  private rootPath: string | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private dragName: string | null = null;
  private dragMoved = false;
  private startMouse = { x: 0, y: 0 };
  private startPos = { x: 0, y: 0 };

  featureCount = computed(() => new Set(this.entries().flatMap((r) => r.features)).size);
  selected = computed<RuleEntry | null>(() => { const n = this.selectedName(); return n ? this.byName()[n] ?? null : null; });

  edges = computed(() => {
    const have = this.byName();
    const out: Array<{ from: string; to: string }> = [];
    for (const r of this.entries()) for (const d of r.dependsOn ?? []) if (have[d]) out.push({ from: d, to: r.name });
    return out;
  });
  dependents = computed(() => { const n = this.selectedName(); return n ? this.edges().filter((e) => e.from === n).map((e) => e.to) : []; });

  connected = computed<Set<string>>(() => {
    const start = this.selectedName();
    if (!start) return new Set();
    const up = new Map<string, string[]>(); const down = new Map<string, string[]>();
    for (const e of this.edges()) {
      (up.get(e.to) ?? up.set(e.to, []).get(e.to)!).push(e.from);
      (down.get(e.from) ?? down.set(e.from, []).get(e.from)!).push(e.to);
    }
    const res = new Set<string>([start]);
    const walk = (s: string, adj: Map<string, string[]>) => { const st = [s]; while (st.length) { const n = st.pop()!; for (const x of adj.get(n) ?? []) if (!res.has(x)) { res.add(x); st.push(x); } } };
    walk(start, up); walk(start, down);
    return res;
  });

  canvas = computed(() => { let w = 400, h = 300; for (const p of Object.values(this.pos())) { w = Math.max(w, p.x + NODE_W + 80); h = Math.max(h, p.y + NODE_H + 80); } return { w, h }; });

  edgeLines = computed<EdgeLine[]>(() => {
    const p = this.pos(); const lines: EdgeLine[] = [];
    for (const e of this.edges()) { const a = p[e.from], b = p[e.to]; if (!a || !b) continue;
      lines.push({ from: e.from, to: e.to, x1: a.x + NODE_W / 2, y1: a.y + NODE_H / 2, x2: b.x + NODE_W / 2, y2: b.y + NODE_H / 2 }); }
    return lines;
  });

  ngOnInit(): void {
    this.store.dispatch(RulesActions.loadRules());
    this.subs.push(
      this.store.select(selectRuleEntries).subscribe((e) => { this.entries.set(e); this.relayoutFrom(this.saved); }),
      this.store.select(selectRulesLoading).subscribe((v) => this.loading.set(v)),
      this.store.select(selectRulesError).subscribe((v) => this.error.set(v)),
      this.store.select(selectRootPath).subscribe((root) => {
        this.rootPath = root;
        if (root) this.fileService.getBrPositions(root).subscribe((p) => { this.saved = (p as Record<string, Pos>) ?? {}; this.relayoutFrom(this.saved); });
      }),
    );
  }

  ngOnDestroy(): void {
    this.subs.forEach((s) => s.unsubscribe());
    this.store.dispatch(BrActions.clearHighlight());
  }

  color(r: RuleEntry): string { return categoryColor(r.category); }

  /** Feature bands top-to-bottom (development order), Dewey seq left-to-right. */
  private layout(saved: Record<string, Pos>): Record<string, Pos> {
    const feats = featuresInOrder(this.entries());
    const idx = new Map(feats.map((f, i) => [f.name, i]));
    const out: Record<string, Pos> = {};
    const byFeat = new Map<string, RuleEntry[]>();
    for (const r of this.entries()) (byFeat.get(r.features[0]) ?? byFeat.set(r.features[0], []).get(r.features[0])!).push(r);
    for (const [f, rs] of byFeat) {
      const u = idx.get(f) ?? 0;
      rs.sort((a, b) => deweyCompare(a.seq, b.seq)).forEach((r, i) => {
        out[r.name] = saved[r.name] ?? { x: ORIGIN + i * H_GAP + u * DRIFT, y: ORIGIN + u * V_GAP };
      });
    }
    return out;
  }
  private relayoutFrom(saved: Record<string, Pos>): void { if (!this.dragName && this.entries().length) this.pos.set(this.layout(saved)); }

  edgePath(e: EdgeLine): string { const dx = Math.abs(e.x2 - e.x1) * 0.4; return `M ${e.x1} ${e.y1} C ${e.x1 + dx} ${e.y1}, ${e.x2 - dx} ${e.y2}, ${e.x2} ${e.y2}`; }
  isEdgeHot(e: EdgeLine): boolean { return this.connected().has(e.from) && this.connected().has(e.to); }

  deltaRows(delta: RuleDelta): string[] {
    const rows: string[] = [];
    for (const k of DELTA_KINDS) { const d = delta?.[k]; if (!d) continue;
      if (d.add?.length) rows.push(`+ ${k}: ${d.add.join(', ')}`);
      if (d.modify?.length) rows.push(`~ ${k}: ${d.modify.join(', ')}`);
      if (d.remove?.length) rows.push(`- ${k}: ${d.remove.join(', ')}`);
    }
    return rows;
  }

  /** Select a rule: broadcast highlight (touches → other panels) + set the feature cut. */
  select(name: string | null): void {
    this.selectedName.set(name);
    if (name) {
      const r = this.byName()[name];
      if (r) {
        this.store.dispatch(BrActions.setHighlight({ highlight: { brId: r.legacyId ?? r.name, kind: 'connections', touches: (r.touches ?? {}) as BrTouches } }));
        this.store.dispatch(RulesActions.setActiveFeature({ feature: r.features[0] ?? null }));
      }
    } else {
      this.store.dispatch(BrActions.clearHighlight());
      this.store.dispatch(RulesActions.setActiveFeature({ feature: null }));
    }
  }
  focusCut(): void { const r = this.selected(); if (r) this.store.dispatch(RulesActions.setActiveFeature({ feature: r.features[0] ?? null })); }
  highlight(): void { const r = this.selected(); if (r) this.store.dispatch(BrActions.setHighlight({ highlight: { brId: r.legacyId ?? r.name, kind: 'connections', touches: (r.touches ?? {}) as BrTouches } })); }

  zoomBy(d: number): void { this.zoom.set(Math.min(2, Math.max(0.3, +(this.zoom() + d).toFixed(2)))); }
  relayout(): void { this.saved = {}; this.pos.set(this.layout({})); this.persist(); }
  reload(): void { this.store.dispatch(RulesActions.loadRules()); }

  onBackgroundDown(ev: MouseEvent): void {
    if (ev.target === ev.currentTarget || (ev.target as HTMLElement).classList.contains('br-canvas')) this.select(null);
  }
  onNodeDown(ev: MouseEvent, name: string): void {
    if (ev.button !== 0) return; ev.stopPropagation();
    this.dragName = name; this.dragMoved = false;
    this.startMouse = { x: ev.clientX, y: ev.clientY };
    this.startPos = { ...(this.pos()[name] ?? { x: 0, y: 0 }) };
  }
  @HostListener('document:mousemove', ['$event'])
  onDocMove(ev: MouseEvent): void {
    if (!this.dragName) return;
    const dx = (ev.clientX - this.startMouse.x) / this.zoom(); const dy = (ev.clientY - this.startMouse.y) / this.zoom();
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) this.dragMoved = true;
    this.pos.set({ ...this.pos(), [this.dragName]: { x: Math.round(this.startPos.x + dx), y: Math.round(this.startPos.y + dy) } });
  }
  @HostListener('document:mouseup')
  onDocUp(): void {
    if (!this.dragName) return;
    const name = this.dragName; const p = this.pos()[name]; this.dragName = null;
    if (this.dragMoved && p) { this.saved = { ...this.saved, [name]: p }; this.persist(); }
    else this.select(this.selectedName() === name ? null : name);
  }

  private persist(): void {
    if (!this.rootPath) return;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    const root = this.rootPath; const positions = { ...this.pos() };
    this.saveTimer = setTimeout(() => this.fileService.saveBrPositions(root, positions).subscribe({ error: () => {} }), 500);
  }
}
