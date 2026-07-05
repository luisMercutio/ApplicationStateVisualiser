import { Component, OnInit, OnDestroy, HostListener, inject, signal, computed } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';
import { Store } from '@ngrx/store';
import { Subscription } from 'rxjs';
import { BusinessRule, BrPosition, categoryColor } from '../../../models/business-rule.model';
import { BrActions } from '../../../store/br/br.actions';
import {
  selectBrRules, selectBrPositions, selectBrEdges, selectBrLoading, selectBrError,
  selectSelectedBrId, selectConnectedBrIds, selectBrById,
} from '../../../store/br/br.selectors';

const NODE_W = 210;
const NODE_H = 66;

interface EdgeLine { from: string; to: string; x1: number; y1: number; x2: number; y2: number; }

@Component({
  selector: 'app-br-graph',
  standalone: true,
  imports: [DecimalPipe, MatIconModule, MatButtonModule, MatTooltipModule, MatMenuModule],
  template: `
    <div class="br-root">
      <div class="br-toolbar">
        <span class="title">Business Rule Net</span>
        <span class="count">{{ rules().length }} rules · {{ edges().length }} deps</span>
        <span class="spacer"></span>
        @if (selectedId()) {
          <button mat-button class="sm" (click)="select(null)"><mat-icon>close</mat-icon> Clear</button>
        }
        <button mat-icon-button class="sm" matTooltip="Zoom out" (click)="zoomBy(-0.1)"><mat-icon>remove</mat-icon></button>
        <span class="zoom">{{ (zoom() * 100) | number:'1.0-0' }}%</span>
        <button mat-icon-button class="sm" matTooltip="Zoom in" (click)="zoomBy(0.1)"><mat-icon>add</mat-icon></button>
        <button mat-icon-button class="sm" matTooltip="Re-run auto layout" (click)="relayout()"><mat-icon>auto_fix_high</mat-icon></button>
        <button mat-icon-button class="sm" matTooltip="Reload data" (click)="reload()"><mat-icon>refresh</mat-icon></button>
      </div>

      <div class="legend">
        @for (c of legend; track c.cat) {
          <span class="lg"><i [style.background]="c.color"></i>{{ c.cat }}</span>
        }
      </div>

      @if (loading()) {
        <div class="msg">Loading business rules…</div>
      } @else if (error()) {
        <div class="msg err">{{ error() }}</div>
      } @else if (!rules().length) {
        <div class="msg">No business-rules.json found in this project. Run the backfill script or /uc-generate.</div>
      } @else {
        <div class="br-scroll" (mousedown)="onBackgroundDown($event)">
          <div class="br-canvas" [style.width.px]="canvas().w" [style.height.px]="canvas().h"
               [style.transform]="'scale(' + zoom() + ')'">
            <svg class="edges" [attr.width]="canvas().w" [attr.height]="canvas().h">
              @for (e of edgeLines(); track e.from + '->' + e.to) {
                <path [attr.d]="edgePath(e)"
                      class="edge"
                      [class.hot]="isEdgeHot(e)"
                      [class.dim]="selectedId() && !isEdgeHot(e)"></path>
              }
            </svg>
            @for (r of rules(); track r.id) {
              <div class="node"
                   [class.selected]="r.id === selectedId()"
                   [class.connected]="connected().has(r.id)"
                   [class.dim]="selectedId() && !connected().has(r.id)"
                   [style.left.px]="pos()[r.id]?.x ?? 0"
                   [style.top.px]="pos()[r.id]?.y ?? 0"
                   [style.width.px]="nodeW" [style.borderLeftColor]="color(r)"
                   (mousedown)="onNodeDown($event, r.id)"
                   [matTooltip]="r.rule">
                <div class="n-head">
                  <span class="n-id">{{ r.id }}</span>
                  <span class="n-uc">{{ r.uc }}</span>
                  <button mat-icon-button class="n-menu" (mousedown)="$event.stopPropagation()"
                          [matMenuTriggerFor]="brMenu" (menuOpened)="select(r.id)"
                          matTooltip="Views for this rule">
                    <mat-icon>more_vert</mat-icon>
                  </button>
                </div>
                <div class="n-rule">{{ r.rule }}</div>
              </div>
            }
          </div>
        </div>
      }

      <!-- P5 will fill this menu with cross-view actions -->
      <mat-menu #brMenu="matMenu">
        <button mat-menu-item (click)="highlight('connections')"><mat-icon>hub</mat-icon> Highlight connections</button>
        <button mat-menu-item disabled><mat-icon>schema</mat-icon> Backend changes (soon)</button>
      </mat-menu>
    </div>
  `,
  styles: [`
    .br-root { display: flex; flex-direction: column; height: 100%; background: #fbfbfd; }
    .br-toolbar { display: flex; align-items: center; gap: 6px; padding: 4px 8px; border-bottom: 1px solid #e6e6e6; font-size: 13px; }
    .br-toolbar .title { font-weight: 600; color: #333; }
    .br-toolbar .count { color: #999; font-size: 12px; }
    .spacer { flex: 1; }
    .sm { font-size: 12px; }
    .zoom { font-size: 12px; color: #666; width: 38px; text-align: center; }
    .legend { display: flex; gap: 10px; padding: 3px 10px; border-bottom: 1px solid #eee; flex-wrap: wrap; }
    .lg { display: flex; align-items: center; gap: 4px; font-size: 11px; color: #777; text-transform: capitalize; }
    .lg i { width: 10px; height: 10px; border-radius: 2px; display: inline-block; }
    .msg { padding: 24px; color: #999; text-align: center; }
    .msg.err { color: #c62828; }
    .br-scroll { flex: 1; overflow: auto; position: relative; }
    .br-canvas { position: relative; transform-origin: 0 0; }
    svg.edges { position: absolute; top: 0; left: 0; pointer-events: none; overflow: visible; }
    .edge { fill: none; stroke: #c2c8d0; stroke-width: 1.5; }
    .edge.hot { stroke: #ff7043; stroke-width: 2.5; }
    .edge.dim { opacity: 0.12; }
    .node { position: absolute; background: white; border: 1px solid #dcdfe4; border-left: 4px solid #999;
            border-radius: 6px; padding: 5px 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); cursor: grab;
            user-select: none; box-sizing: border-box; height: ${NODE_H}px; overflow: hidden; }
    .node:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.16); }
    .node.selected { border-color: #ff7043; box-shadow: 0 0 0 2px #ff7043; }
    .node.connected { border-color: #ffab91; }
    .node.dim { opacity: 0.28; }
    .n-head { display: flex; align-items: center; gap: 6px; }
    .n-id { font-family: monospace; font-weight: 700; font-size: 12px; color: #333; }
    .n-uc { font-size: 10px; color: #aaa; }
    .n-menu { width: 20px; height: 20px; line-height: 20px; margin-left: auto; }
    .n-menu mat-icon { font-size: 15px; width: 15px; height: 15px; color: #999; }
    .n-rule { font-size: 11px; color: #555; line-height: 1.25; margin-top: 2px;
              display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  `],
})
export class BrGraphComponent implements OnInit, OnDestroy {
  private store = inject(Store);
  private subs: Subscription[] = [];

  nodeW = NODE_W;
  legend = ['auth', 'validation', 'workflow', 'data', 'ui', 'routing', 'integration', 'other']
    .map((cat) => ({ cat, color: categoryColor(cat) }));

  rules = signal<BusinessRule[]>([]);
  edges = signal<Array<{ from: string; to: string }>>([]);
  byId = signal<Record<string, BusinessRule>>({});
  pos = signal<Record<string, BrPosition>>({});
  selectedId = signal<string | null>(null);
  connected = signal<Set<string>>(new Set());
  loading = signal(false);
  error = signal<string | null>(null);
  zoom = signal(1);

  private dragId: string | null = null;
  private dragMoved = false;
  private startMouse = { x: 0, y: 0 };
  private startPos = { x: 0, y: 0 };

  canvas = computed(() => {
    let w = 400, h = 300;
    for (const p of Object.values(this.pos())) {
      w = Math.max(w, p.x + NODE_W + 80);
      h = Math.max(h, p.y + NODE_H + 80);
    }
    return { w, h };
  });

  edgeLines = computed<EdgeLine[]>(() => {
    const p = this.pos();
    const lines: EdgeLine[] = [];
    for (const e of this.edges()) {
      const a = p[e.from], b = p[e.to];
      if (!a || !b) continue;
      lines.push({
        from: e.from, to: e.to,
        x1: a.x + NODE_W / 2, y1: a.y + NODE_H / 2,
        x2: b.x + NODE_W / 2, y2: b.y + NODE_H / 2,
      });
    }
    return lines;
  });

  ngOnInit(): void {
    this.store.dispatch(BrActions.loadGraph());
    this.subs.push(
      this.store.select(selectBrRules).subscribe((r) => this.rules.set(r)),
      this.store.select(selectBrEdges).subscribe((e) => this.edges.set(e)),
      this.store.select(selectBrById).subscribe((m) => this.byId.set(m)),
      this.store.select(selectBrLoading).subscribe((v) => this.loading.set(v)),
      this.store.select(selectBrError).subscribe((v) => this.error.set(v)),
      this.store.select(selectSelectedBrId).subscribe((v) => this.selectedId.set(v)),
      this.store.select(selectConnectedBrIds).subscribe((s) => this.connected.set(s)),
      this.store.select(selectBrPositions).subscribe((p) => {
        if (!this.dragId) this.pos.set({ ...p });
      }),
    );
  }

  ngOnDestroy(): void { this.subs.forEach((s) => s.unsubscribe()); }

  color(r: BusinessRule): string { return categoryColor(r.category); }

  edgePath(e: EdgeLine): string {
    const dx = Math.abs(e.x2 - e.x1) * 0.4;
    return `M ${e.x1} ${e.y1} C ${e.x1 + dx} ${e.y1}, ${e.x2 - dx} ${e.y2}, ${e.x2} ${e.y2}`;
  }

  isEdgeHot(e: EdgeLine): boolean {
    return this.connected().has(e.from) && this.connected().has(e.to);
  }

  select(id: string | null): void {
    this.store.dispatch(BrActions.selectBr({ id }));
  }

  highlight(kind: 'connections'): void {
    const r = this.selectedId() ? this.byId()[this.selectedId()!] : null;
    if (r) this.store.dispatch(BrActions.setHighlight({ highlight: { brId: r.id, kind, touches: r.touches } }));
  }

  zoomBy(d: number): void { this.zoom.set(Math.min(2, Math.max(0.3, +(this.zoom() + d).toFixed(2)))); }
  relayout(): void { this.store.dispatch(BrActions.relayout()); }
  reload(): void { this.store.dispatch(BrActions.loadGraph()); }

  onBackgroundDown(ev: MouseEvent): void {
    if (ev.target === ev.currentTarget || (ev.target as HTMLElement).classList.contains('br-canvas')) {
      this.select(null);
    }
  }

  onNodeDown(ev: MouseEvent, id: string): void {
    if (ev.button !== 0) return;
    ev.stopPropagation();
    this.dragId = id;
    this.dragMoved = false;
    this.startMouse = { x: ev.clientX, y: ev.clientY };
    this.startPos = { ...(this.pos()[id] ?? { x: 0, y: 0 }) };
  }

  @HostListener('document:mousemove', ['$event'])
  onDocMove(ev: MouseEvent): void {
    if (!this.dragId) return;
    const dx = (ev.clientX - this.startMouse.x) / this.zoom();
    const dy = (ev.clientY - this.startMouse.y) / this.zoom();
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) this.dragMoved = true;
    this.pos.set({ ...this.pos(), [this.dragId]: { x: Math.round(this.startPos.x + dx), y: Math.round(this.startPos.y + dy) } });
  }

  @HostListener('document:mouseup')
  onDocUp(): void {
    if (!this.dragId) return;
    const id = this.dragId;
    const p = this.pos()[id];
    this.dragId = null;
    if (this.dragMoved && p) {
      this.store.dispatch(BrActions.setPosition({ id, x: p.x, y: p.y }));
    } else {
      this.select(this.selectedId() === id ? null : id);
    }
  }
}
