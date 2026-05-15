import { Component, Input, OnInit, OnDestroy, inject, signal, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Store } from '@ngrx/store';
import { Subscription, combineLatest } from 'rxjs';
import { map } from 'rxjs/operators';
import { Panel, ViewType, VIEW_TYPE_LABELS, VIEW_TYPE_LIST } from '../../models/panel.model';
import { LayoutActions } from '../../store/layout/layout.actions';
import { selectGlobalUcId, selectPanels } from '../../store/layout/layout.selectors';
import { selectUsecases } from '../../store/uc/uc.selectors';
import { UcTrackerComponent } from '../views/uc-tracker/uc-tracker.component';
import { SuggestionComponent } from '../views/suggestion/suggestion.component';
import { MermaidViewComponent } from '../views/mermaid-view/mermaid-view.component';
import { DiffViewComponent } from '../views/diff-view/diff-view.component';
import { OpenApiViewComponent } from '../views/openapi-view/openapi-view.component';
import { SelectorsViewComponent } from '../views/selectors-view/selectors-view.component';
import { TestStateComponent } from '../views/test-state/test-state.component';
import { ContractValidationComponent } from '../views/contract-validation/contract-validation.component';
import { MockupViewComponent } from '../views/mockup-view/mockup-view.component';

const FILE_MAP: Record<ViewType, ((id: string) => string) | string> = {
  'uc-tracker': 'usecases.md',
  'suggestion': id => `${id}/suggestion.md`,
  'class-diagram': id => `${id}/ClassDiagram.md`,
  'class-diagram-diff': id => `${id}/ClassDiagramDiff.md`,
  'openapi': id => `${id}/openapi.yaml`,
  'openapi-diff': id => `${id}/openapiDiff.md`,
  'frontend-state': id => `${id}/FrontendState.md`,
  'frontend-state-diff': id => `${id}/FrontendStateDiff.md`,
  'selectors': id => `${id}/selectors.yaml`,
  'selectors-diff': id => `${id}/selectorsDiff.md`,
  'test-state': id => `${id}/testState.md`,
  'test-state-diff': id => `${id}/testStateDiff.md`,
  'contract-validation': id => `${id}/contract-validation.json`,
  'mockup': '',
  'mockups-diff': id => `${id}/mockups/mockupsDiff.md`,
};

const DIFF_VIEWS: ViewType[] = ['class-diagram-diff', 'openapi-diff', 'frontend-state-diff', 'selectors-diff', 'test-state-diff', 'mockups-diff'];
const MERMAID_VIEWS: ViewType[] = ['class-diagram', 'frontend-state'];

@Component({
  selector: 'app-panel',
  standalone: true,
  imports: [
    MatIconModule, MatButtonModule, MatMenuModule, MatTooltipModule,
    UcTrackerComponent, SuggestionComponent, MermaidViewComponent, DiffViewComponent,
    OpenApiViewComponent, SelectorsViewComponent, TestStateComponent,
    ContractValidationComponent, MockupViewComponent,
  ],
  template: `
    <div class="panel-wrapper">
      <div class="panel-header" [class.pinned]="panelState().pinned">
        <span class="view-label">{{ viewLabel() }}</span>
        @if (panelState().pinned) {
          <span class="pin-badge">{{ panelState().ucId }}</span>
        }
        <div class="header-actions">
          <button mat-icon-button [matMenuTriggerFor]="viewMenu" matTooltip="Change view" class="sm-btn">
            <mat-icon>swap_horiz</mat-icon>
          </button>
          <button mat-icon-button [matMenuTriggerFor]="pinMenu"
                  [matTooltip]="panelState().pinned ? ('Pinned: ' + panelState().ucId) : 'Pin to UC'"
                  class="sm-btn" [class.pin-active]="panelState().pinned">
            <mat-icon>push_pin</mat-icon>
          </button>
          <button mat-icon-button (click)="closed.emit(panel.id)" matTooltip="Close" class="sm-btn close-btn">
            <mat-icon>close</mat-icon>
          </button>
        </div>
      </div>

      <mat-menu #viewMenu="matMenu">
        @for (vt of viewTypes; track vt) {
          <button mat-menu-item (click)="changeView(vt)">{{ labels[vt] }}</button>
        }
      </mat-menu>

      <mat-menu #pinMenu="matMenu">
        @if (panelState().pinned) {
          <button mat-menu-item (click)="unpin()"><mat-icon>push_pin</mat-icon> Unpin (use global UC)</button>
        }
        @for (uc of usecases(); track uc.id) {
          <button mat-menu-item (click)="pinToUc(uc.id)">
            {{ uc.id }} — {{ uc.title }}
          </button>
        }
      </mat-menu>

      <div class="panel-body">
        @switch (panelState().viewType) {
          @case ('uc-tracker') { <app-uc-tracker [filePath]="filePath()"></app-uc-tracker> }
          @case ('suggestion') { <app-suggestion [filePath]="filePath()"></app-suggestion> }
          @case ('class-diagram') { <app-mermaid-view [filePath]="filePath()"></app-mermaid-view> }
          @case ('frontend-state') { <app-mermaid-view [filePath]="filePath()"></app-mermaid-view> }
          @case ('class-diagram-diff') { <app-diff-view [filePath]="filePath()"></app-diff-view> }
          @case ('openapi-diff') { <app-diff-view [filePath]="filePath()"></app-diff-view> }
          @case ('frontend-state-diff') { <app-diff-view [filePath]="filePath()"></app-diff-view> }
          @case ('selectors-diff') { <app-diff-view [filePath]="filePath()"></app-diff-view> }
          @case ('test-state-diff') { <app-diff-view [filePath]="filePath()"></app-diff-view> }
          @case ('mockups-diff') { <app-diff-view [filePath]="filePath()"></app-diff-view> }
          @case ('openapi') { <app-openapi-view [filePath]="filePath()"></app-openapi-view> }
          @case ('selectors') { <app-selectors-view [filePath]="filePath()"></app-selectors-view> }
          @case ('test-state') { <app-test-state [filePath]="filePath()"></app-test-state> }
          @case ('contract-validation') { <app-contract-validation [filePath]="filePath()"></app-contract-validation> }
          @case ('mockup') { <app-mockup-view [ucId]="effectiveUcId()"></app-mockup-view> }
        }
      </div>
    </div>
  `,
  styles: [`
    .panel-wrapper { display: flex; flex-direction: column; height: 100%; background: white; border-radius: 6px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); overflow: hidden; }
    .panel-header { display: flex; align-items: center; padding: 0 4px 0 12px; height: 38px; background: #3f51b5; color: white; gap: 6px; flex-shrink: 0; }
    .panel-header.pinned { background: #283593; }
    .view-label { font-size: 13px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
    .pin-badge { font-size: 11px; background: rgba(255,255,255,0.2); padding: 1px 6px; border-radius: 10px; white-space: nowrap; flex-shrink: 0; }
    .header-actions { display: flex; margin-left: auto; flex-shrink: 0; }
    .sm-btn { width: 30px; height: 30px; line-height: 30px; color: rgba(255,255,255,0.85); }
    .sm-btn mat-icon { font-size: 17px; width: 17px; height: 17px; }
    .pin-active { color: #ffeb3b !important; }
    .close-btn:hover { color: #ff5252; }
    .panel-body { flex: 1; overflow: hidden; min-height: 0; }
  `],
})
export class PanelComponent implements OnInit, OnDestroy {
  @Input({ required: true }) panel!: Panel;
  closed = output<string>();

  private store = inject(Store);
  private subs: Subscription[] = [];

  viewTypes = VIEW_TYPE_LIST;
  labels = VIEW_TYPE_LABELS;

  panelState = signal<Panel>({ id: '', viewType: 'uc-tracker', ucId: null, pinned: false, x: 0, y: 0, rows: 2, cols: 3 });
  effectiveUcId = signal<string | null>(null);
  filePath = signal<string>('');
  usecases = signal<Array<{ id: string; title: string }>>([]);

  viewLabel(): string { return VIEW_TYPE_LABELS[this.panelState().viewType]; }

  ngOnInit(): void {
    this.panelState.set(this.panel);
    this.subs.push(
      combineLatest([
        this.store.select(selectPanels).pipe(map(ps => ps.find(p => p.id === this.panel.id))),
        this.store.select(selectGlobalUcId),
      ]).subscribe(([p, gid]) => {
        if (!p) return;
        this.panelState.set(p);
        const ucId = (p.pinned && p.ucId) ? p.ucId : gid;
        this.effectiveUcId.set(ucId);
        this.computeFilePath(p.viewType, ucId);
      }),
      this.store.select(selectUsecases).subscribe(ucs => this.usecases.set(ucs)),
    );
  }

  ngOnDestroy(): void { this.subs.forEach(s => s.unsubscribe()); }

  private computeFilePath(viewType: ViewType, ucId: string | null): void {
    const template = FILE_MAP[viewType];
    if (typeof template === 'string') {
      this.filePath.set(template);
    } else if (ucId) {
      this.filePath.set(template(ucId));
    } else {
      this.filePath.set('');
    }
  }

  changeView(vt: ViewType): void {
    this.store.dispatch(LayoutActions.updatePanel({ panel: { ...this.panelState(), viewType: vt } }));
  }

  unpin(): void {
    this.store.dispatch(LayoutActions.togglePin({ panelId: this.panel.id }));
  }

  pinToUc(ucId: string): void {
    this.store.dispatch(LayoutActions.pinUc({ panelId: this.panel.id, ucId }));
  }
}
