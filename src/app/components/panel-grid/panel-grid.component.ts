import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { Gridster, GridsterItem, GridsterConfig, GridType, CompactType, DisplayGrid } from 'angular-gridster2';
import { Store } from '@ngrx/store';
import { Subscription } from 'rxjs';
import { PanelComponent } from '../panel/panel.component';
import { selectPanels } from '../../store/layout/layout.selectors';
import { LayoutActions } from '../../store/layout/layout.actions';
import { Panel } from '../../models/panel.model';

@Component({
  selector: 'app-panel-grid',
  standalone: true,
  imports: [Gridster, GridsterItem, PanelComponent],
  template: `
    <gridster [options]="options" class="grid-host">
      @for (item of gridItems(); track item.id) {
        <gridster-item [item]="item">
          <app-panel [panel]="item" (closed)="removePanel($event)"></app-panel>
        </gridster-item>
      }
    </gridster>
  `,
  styles: [`
    :host { display: block; height: 100%; }
    .grid-host { background: #f0f2f5; height: 100%; }
    gridster-item { overflow: hidden; }
  `],
})
export class PanelGridComponent implements OnInit, OnDestroy {
  private store = inject(Store);
  private sub?: Subscription;

  gridItems = signal<Array<Panel & Record<string, any>>>([]);

  options: GridsterConfig = {
    gridType: GridType.ScrollVertical,
    compactType: CompactType.None,
    displayGrid: DisplayGrid.OnDragAndResize,
    pushItems: true,
    draggable: { enabled: true },
    resizable: { enabled: true },
    minCols: 6,
    maxCols: 12,
    minRows: 4,
    fixedColWidth: 200,
    fixedRowHeight: 200,
    keepFixedHeightInMobile: false,
    keepFixedWidthInMobile: false,
    scrollSensitivity: 10,
    scrollSpeed: 20,
    enableEmptyCellClick: false,
    enableEmptyCellContextMenu: false,
    enableEmptyCellDrop: false,
    enableEmptyCellDrag: false,
    itemChangeCallback: (item: any) => this.onItemChange(item),
  };

  ngOnInit(): void {
    this.sub = this.store.select(selectPanels).subscribe(panels => {
      const existing = new Map(this.gridItems().map(i => [i.id, i]));
      const next = panels.map(p => {
        const ex = existing.get(p.id);
        if (ex && ex.x === p.x && ex.y === p.y && ex.cols === p.cols && ex.rows === p.rows) return ex;
        return { ...p };
      });
      this.gridItems.set(next);
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  onItemChange(item: Panel): void {
    const panel = this.gridItems().find(i => i.id === item.id);
    if (panel) {
      this.store.dispatch(LayoutActions.updatePanel({ panel: { ...panel, x: item.x, y: item.y, cols: item.cols, rows: item.rows } }));
    }
  }

  removePanel(panelId: string): void {
    this.store.dispatch(LayoutActions.removePanel({ panelId }));
  }
}
