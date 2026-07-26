import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { Store } from '@ngrx/store';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { Subscription, filter, take, distinctUntilChanged } from 'rxjs';
import { selectPanels } from './store/layout/layout.selectors';
import { LayoutActions } from './store/layout/layout.actions';
import { LayoutsActions } from './store/layouts/layouts.actions';
import { ApplicationsActions } from './store/applications/applications.actions';
import { selectActiveId } from './store/applications/applications.selectors';
import { ToolbarComponent } from './components/toolbar/toolbar.component';
import { PanelGridComponent } from './components/panel-grid/panel-grid.component';
import { AddPanelDialogComponent } from './components/add-panel-dialog/add-panel-dialog.component';
import { BrListComponent } from './components/views/br-list/br-list.component';
import { BrDiagramComponent } from './components/views/br-diagram/br-diagram.component';
import { TechnicalSpecsComponent } from './components/views/technical-specs/technical-specs.component';
import { NotesListComponent } from './components/views/notes-list/notes-list.component';
import { ActivityFeedComponent } from './components/views/activity-feed/activity-feed.component';
import { TerminalComponent } from './components/views/terminal/terminal.component';
import { ClaudeSessionsComponent } from './components/views/claude-sessions/claude-sessions.component';
import { GitHistoryComponent } from './components/views/git-history/git-history.component';
import { MethodologyEditorComponent } from './components/views/methodology-editor/methodology-editor.component';
import { Panel, ViewType } from './models/panel.model';
import { WorkspaceService } from './services/workspace.service';

function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    MatDialogModule, ToolbarComponent, PanelGridComponent,
    BrListComponent, BrDiagramComponent, TechnicalSpecsComponent, NotesListComponent, ActivityFeedComponent,
    TerminalComponent, ClaudeSessionsComponent, GitHistoryComponent,
    MethodologyEditorComponent,
  ],
  template: `
    <div class="app-shell">
      <app-toolbar [page]="page()" (navigate)="page.set($event)" (addPanel)="openAddPanel()"></app-toolbar>
      <div class="workspace">
        @switch (page()) {
          @case ('br-list') { <app-br-list></app-br-list> }
          @case ('br-diagram') { <app-br-diagram></app-br-diagram> }
          @case ('technical-specs') { <app-technical-specs></app-technical-specs> }
          @case ('notes') { <app-notes-list></app-notes-list> }
          @case ('activity') { <app-activity-feed></app-activity-feed> }
          @case ('features') { <app-panel-grid></app-panel-grid> }
          @case ('terminal') { <app-terminal></app-terminal> }
          @case ('claude-sessions') { <app-claude-sessions></app-claude-sessions> }
          @case ('git') { <app-git-history></app-git-history> }
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

  // Active page lives in WorkspaceService so other views (e.g. the Terminal's
  // Attach) can navigate; the toolbar still drives it via (navigate)="page.set(…)".
  page = inject(WorkspaceService).page;

  ngOnInit(): void {
    // A "project" is the active application, chosen in the toolbar's
    // applications manager — there is no filesystem project root any more.
    this.store.dispatch(ApplicationsActions.loadApplications());
    this.store.dispatch(LayoutsActions.loadLayouts());

    // Selecting an application makes the Business Rules its main page.
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
