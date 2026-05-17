import { Component, inject, OnInit, signal } from '@angular/core';
import { Store } from '@ngrx/store';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { filter, take } from 'rxjs';
import { selectRootPath, selectPanels } from './store/layout/layout.selectors';
import { LayoutActions } from './store/layout/layout.actions';
import { LayoutsActions } from './store/layouts/layouts.actions';
import { UcActions } from './store/uc/uc.actions';
import { FilesActions } from './store/files/files.actions';
import { FileService } from './services/file.service';
import { FolderPickerComponent } from './components/folder-picker/folder-picker.component';
import { ToolbarComponent } from './components/toolbar/toolbar.component';
import { PanelGridComponent } from './components/panel-grid/panel-grid.component';
import { AddPanelDialogComponent } from './components/add-panel-dialog/add-panel-dialog.component';
import { Panel, ViewType } from './models/panel.model';
import { toSignal } from '@angular/core/rxjs-interop';

function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [MatDialogModule, FolderPickerComponent, ToolbarComponent, PanelGridComponent],
  template: `
    @if (!initializing()) {
      @if (rootPath()) {
        <div class="app-shell">
          <app-toolbar (addPanel)="openAddPanel()" (changeRoot)="changeRoot()"></app-toolbar>
          <div class="workspace">
            <app-panel-grid></app-panel-grid>
          </div>
        </div>
      } @else {
        <app-folder-picker></app-folder-picker>
      }
    }
  `,
  styles: [`
    .app-shell { display: flex; flex-direction: column; height: 100vh; overflow: hidden; }
    .workspace { flex: 1; overflow: auto; }
  `],
})
export class AppComponent implements OnInit {
  private store = inject(Store);
  private dialog = inject(MatDialog);
  private fileService = inject(FileService);

  rootPath = toSignal(this.store.select(selectRootPath), { initialValue: null });
  initializing = signal(true);

  ngOnInit(): void {
    if (this.rootPath()) {
      this.store.dispatch(UcActions.loadUsecases());
      this.store.dispatch(LayoutsActions.loadLayouts());
      this.initializing.set(false);
    } else {
      this.fileService.getConfig().subscribe({
        next: ({ standardUrl }) => {
          if (standardUrl) {
            this.store.dispatch(FilesActions.clearCache());
            this.store.dispatch(LayoutActions.setRootPath({ rootPath: standardUrl }));
            this.store.dispatch(UcActions.loadUsecases());
          }
          this.initializing.set(false);
        },
        error: () => {
          this.initializing.set(false);
        },
      });
    }
  }

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
              panel: { id: newId(), viewType: vt, ucId: null, pinned: false, x: 0, y: 0, rows: 2, cols: 3 },
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

  changeRoot(): void {
    this.store.dispatch(LayoutActions.setRootPath({ rootPath: '' }));
  }
}
