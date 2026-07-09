import { Component, Input, OnInit, OnDestroy, inject, signal, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Store } from '@ngrx/store';
import { Subscription } from 'rxjs';
import { map } from 'rxjs/operators';
import { Panel, ViewType, VIEW_TYPE_LABELS, VIEW_TYPE_LIST } from '../../models/panel.model';
import { LayoutActions } from '../../store/layout/layout.actions';
import { selectPanels } from '../../store/layout/layout.selectors';

// A tile on the "Features" page. No feature view types exist yet, so a panel
// currently renders a placeholder — the grid, layouts and Add Panel plumbing are
// in place ready for feature views to be defined later.
@Component({
  selector: 'app-panel',
  standalone: true,
  imports: [MatIconModule, MatButtonModule, MatMenuModule, MatTooltipModule],
  template: `
    <div class="panel-wrapper">
      <div class="panel-header">
        <span class="view-label">{{ viewLabel() }}</span>
        <div class="header-actions">
          @if (viewTypes.length) {
            <button mat-icon-button [matMenuTriggerFor]="viewMenu" matTooltip="Change view" class="sm-btn">
              <mat-icon>swap_horiz</mat-icon>
            </button>
          }
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

      <div class="panel-body">
        <div class="placeholder"><mat-icon>dashboard_customize</mat-icon> Feature views coming soon</div>
      </div>
    </div>
  `,
  styles: [`
    .panel-wrapper { display: flex; flex-direction: column; height: 100%; background: white; border-radius: 6px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); overflow: hidden; }
    .panel-header { display: flex; align-items: center; padding: 0 4px 0 12px; height: 38px; background: #3f51b5; color: white; gap: 6px; flex-shrink: 0; }
    .view-label { font-size: 13px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
    .header-actions { display: flex; margin-left: auto; flex-shrink: 0; }
    .sm-btn { width: 30px; height: 30px; line-height: 30px; color: rgba(255,255,255,0.85); }
    .sm-btn mat-icon { font-size: 17px; width: 17px; height: 17px; }
    .close-btn:hover { color: #ff5252; }
    .panel-body { flex: 1; overflow: hidden; min-height: 0; display: flex; align-items: center; justify-content: center; }
    .placeholder { display: flex; align-items: center; gap: 8px; color: #aaa; font-size: 13px; }
  `],
})
export class PanelComponent implements OnInit, OnDestroy {
  @Input({ required: true }) panel!: Panel;
  closed = output<string>();

  private store = inject(Store);
  private subs: Subscription[] = [];

  viewTypes = VIEW_TYPE_LIST;
  labels = VIEW_TYPE_LABELS;

  panelState = signal<Panel>({ id: '', viewType: '', x: 0, y: 0, rows: 2, cols: 3 });

  viewLabel(): string { return VIEW_TYPE_LABELS[this.panelState().viewType] ?? 'Panel'; }

  ngOnInit(): void {
    this.panelState.set(this.panel);
    this.subs.push(
      this.store.select(selectPanels).pipe(map(ps => ps.find(p => p.id === this.panel.id)))
        .subscribe(p => { if (p) this.panelState.set(p); }),
    );
  }

  ngOnDestroy(): void { this.subs.forEach(s => s.unsubscribe()); }

  changeView(vt: ViewType): void {
    this.store.dispatch(LayoutActions.updatePanel({ panel: { ...this.panelState(), viewType: vt } }));
  }
}
