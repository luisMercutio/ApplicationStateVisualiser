import { Component, inject, OnInit, OnDestroy, signal } from '@angular/core';
import { Store } from '@ngrx/store';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { Subscription, filter, take, distinctUntilChanged } from 'rxjs';
import { selectPanels } from './store/layout/layout.selectors';
import { LayoutActions } from './store/layout/layout.actions';
import { LayoutsActions } from './store/layouts/layouts.actions';
import { ConnectionsActions } from './store/connections/connections.actions';
import { selectActiveId } from './store/connections/connections.selectors';
import { ToolbarComponent } from './components/toolbar/toolbar.component';
import { PanelGridComponent } from './components/panel-grid/panel-grid.component';
import { AddPanelDialogComponent } from './components/add-panel-dialog/add-panel-dialog.component';
import { BrListComponent } from './components/views/br-list/br-list.component';
import { TerminalComponent } from './components/views/terminal/terminal.component';
import { MethodologyEditorComponent } from './components/views/methodology-editor/methodology-editor.component';
import { Panel, ViewType } from './models/panel.model';
import { AppPage } from './models/app-page.model';

function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    MatDialogModule, ToolbarComponent, PanelGridComponent,
    BrListComponent, TerminalComponent, MethodologyEditorComponent,
  ],
  template: `
    <div class="app-shell">
      <app-toolbar [page]="page()" (navigate)="page.set($event)" (addPanel)="openAddPanel()"></app-toolbar>
      <div class="workspace">
        @switch (page()) {
          @case ('br-list') { <app-br-list></app-br-list> }
          @case ('features') { <app-panel-grid></app-panel-grid> }
          @case ('terminal') { <app-terminal></app-terminal> }
          @case ('settings') { <app-methodology-editor></app-methodology-editor> }
        }
      </div>
    </div>
  `,
  styles: [`
    .app-shell { display: flex; flex-direction: column; height: 100vh; overflow: hidden; }
    .workspace { flex: 1; overflow: auto; min-height: 0; }
  `],
})
export class AppComponent implements OnInit, OnDestroy {
  private store = inject(Store);
  private dialog = inject(MatDialog);
  private subs: Subscription[] = [];

  page = signal<AppPage>('br-list');

  ngOnInit(): void {
    // A "project" is the active database connection, chosen in the toolbar's
    // connection selector — there is no filesystem project root any more.
    this.store.dispatch(ConnectionsActions.loadConnections());
    this.store.dispatch(LayoutsActions.loadLayouts());

    // Selecting a database makes the Business Rules its main page.
    this.subs.push(
      this.store.select(selectActiveId).pipe(distinctUntilChanged()).subscribe((id) => {
        if (id) this.page.set('br-list');
      }),
    );
  }

  ngOnDestroy(): void { this.subs.forEach(s => s.unsubscribe()); }

  openAddPanel(): void {
    let currentPanels: Panel[] = [];
    this.store.select(selectPanels).pipe(take(1)).subscribe(p => (currentPanels = p));

    const openViewTypes = [...new Set(currentPanels.map(p => p.viewType))];

    this.dialog.open(AddPanelDialogComponent, { data: openViewTypes })
      .afterClosed().pipe(
        filter((result): result is ViewType[] => Array.isArray(result)),
      ).subscribe(selected => {
        const selectedSet = new Set<ViewType>(selected);
        const previousSet = new Set<ViewType>(openViewTypes);

        for (const vt of selectedSet) {
          if (!previousSet.has(vt)) {
            this.store.dispatch(LayoutActions.addPanel({
              panel: { id: newId(), viewType: vt, x: 0, y: 0, rows: 2, cols: 3 },
            }));
          }
        }

        for (const panel of currentPanels) {
          if (!selectedSet.has(panel.viewType)) {
            this.store.dispatch(LayoutActions.removePanel({ panelId: panel.id }));
          }
        }
      });
  }
}
