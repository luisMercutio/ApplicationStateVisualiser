import { Component, Input, OnInit, OnChanges, OnDestroy, SimpleChanges, ElementRef, ViewChild, inject, signal } from '@angular/core';
import { Store } from '@ngrx/store';
import { MatIconModule } from '@angular/material/icon';
import { Subscription } from 'rxjs';
import { selectFileContent, selectFileLoading, selectFileError } from '../../../store/files/files.selectors';
import { FilesActions } from '../../../store/files/files.actions';
import { selectBrHighlight } from '../../../store/br/br.selectors';
import { BrHighlight } from '../../../models/business-rule.model';
import { LoadingStateComponent } from '../../loading-state/loading-state.component';
import { MermaidService } from '../../../services/mermaid.service';

@Component({
  selector: 'app-mermaid-view',
  standalone: true,
  imports: [MatIconModule, LoadingStateComponent],
  template: `
    <div class="panel-content">
      @if (loading() || error()) {
        <app-loading-state [loading]="loading()" [error]="error()"></app-loading-state>
      } @else if (!filePath) {
        <div class="placeholder-empty"><mat-icon>schema</mat-icon> Select a UC</div>
      } @else {
        @if (highlightLabel()) {
          <div class="hl-banner"><mat-icon>my_location</mat-icon> {{ highlightLabel() }}</div>
        }
        <div #diagramEl class="diagram-container"></div>
      }
    </div>
  `,
  styles: [`
    .diagram-container { width: 100%; overflow: auto; }
    .diagram-container ::ng-deep svg { max-width: 100%; height: auto; }
    .hl-banner { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #e65100; background: #fff3e0; padding: 4px 10px; border-radius: 4px; margin-bottom: 6px; }
    .hl-banner mat-icon { font-size: 16px; width: 16px; height: 16px; }
    .diagram-container ::ng-deep .br-hl > text, .diagram-container ::ng-deep .br-hl .nodeLabel { fill: #e65100 !important; font-weight: 700 !important; }
    .diagram-container ::ng-deep .br-hl rect, .diagram-container ::ng-deep .br-hl polygon, .diagram-container ::ng-deep .br-hl path { stroke: #ff7043 !important; stroke-width: 3px !important; }
  `],
})
export class MermaidViewComponent implements OnInit, OnChanges, OnDestroy {
  @Input() filePath = '';
  @ViewChild('diagramEl') diagramEl?: ElementRef<HTMLDivElement>;

  private store = inject(Store);
  private mermaid = inject(MermaidService);
  private subs: Subscription[] = [];

  loading = signal(false);
  error = signal<string | null>(null);
  highlightLabel = signal<string | null>(null);
  private pendingDiagram: string | null = null;
  private highlight: BrHighlight | null = null;
  private rendered = false;

  ngOnInit(): void {
    this.subscribe();
    // Highlight is global; react to it regardless of file reloads.
    this.subs.push(
      this.store.select(selectBrHighlight).subscribe((h) => {
        this.highlight = h;
        this.applyHighlight();
      }),
    );
  }
  ngOnChanges(c: SimpleChanges): void {
    if (c['filePath'] && !c['filePath'].firstChange) { this.clearSubs(); this.subscribe(); }
  }
  ngOnDestroy(): void { this.clearSubs(); }
  private clearSubs(): void { this.subs.forEach(s => s.unsubscribe()); this.subs = []; }

  /** Which anchor list applies to this diagram: entities for the class diagram,
   * store slices for the frontend-state diagram. */
  private anchorsForDiagram(): string[] {
    const h = this.highlight;
    if (!h) return [];
    const fp = this.filePath.toLowerCase();
    if (fp.includes('frontendstate')) return h.touches.slices ?? [];
    if (fp.includes('classdiagram')) return h.touches.entities ?? [];
    return [...(h.touches.entities ?? []), ...(h.touches.slices ?? [])];
  }

  private subscribe(): void {
    if (!this.filePath) return;
    this.store.dispatch(FilesActions.loadFile({ path: this.filePath }));
    this.subs.push(
      this.store.select(selectFileLoading(this.filePath)).subscribe(v => this.loading.set(v)),
      this.store.select(selectFileError(this.filePath)).subscribe(v => this.error.set(v)),
      this.store.select(selectFileContent(this.filePath)).subscribe(content => {
        if (!content) return;
        const diagram = this.mermaid.extractMermaidBlock(content);
        if (!diagram) return;
        this.pendingDiagram = diagram;
        this.rendered = false;
        this.renderWhenReady();
      }),
    );
  }

  private renderWhenReady(): void {
    setTimeout(() => {
      if (this.diagramEl && this.pendingDiagram) {
        this.mermaid.render(this.diagramEl.nativeElement, this.pendingDiagram);
        this.pendingDiagram = null;
        this.rendered = true;
        setTimeout(() => this.applyHighlight(), 60);
      } else if (this.pendingDiagram) {
        this.renderWhenReady();
      }
    }, 50);
  }

  private applyHighlight(): void {
    const host = this.diagramEl?.nativeElement;
    if (!host || !this.rendered) return;
    const svg = host.querySelector('svg');
    if (!svg) return;
    svg.querySelectorAll('.br-hl').forEach((el) => el.classList.remove('br-hl'));

    const anchors = this.anchorsForDiagram().map((a) => a.toLowerCase());
    if (!anchors.length) { this.highlightLabel.set(null); return; }

    let hits = 0;
    svg.querySelectorAll('text, .nodeLabel, .label').forEach((el) => {
      const txt = (el.textContent ?? '').trim().toLowerCase();
      if (!txt) return;
      const match = anchors.some((a) => txt === a || new RegExp(`\\b${a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(txt));
      if (match) {
        const g = el.closest('g') ?? el.parentElement;
        if (g) { (g as Element).classList.add('br-hl'); hits++; }
      }
    });
    this.highlightLabel.set(hits ? `${this.highlight?.brId}: ${hits} element(s) highlighted` : `${this.highlight?.brId}: no matching element in this diagram`);
  }
}
