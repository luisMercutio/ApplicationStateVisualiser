import { Component, inject, OnInit } from '@angular/core';
import { Store } from '@ngrx/store';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { filter } from 'rxjs';
import { selectRootPath } from './store/layout/layout.selectors';
import { LayoutActions } from './store/layout/layout.actions';
import { UcActions } from './store/uc/uc.actions';
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
  `,
  styles: [`
    .app-shell { display: flex; flex-direction: column; height: 100vh; overflow: hidden; }
    .workspace { flex: 1; overflow: auto; }
  `],
})
export class AppComponent implements OnInit {
  private store = inject(Store);
  private dialog = inject(MatDialog);

  rootPath = toSignal(this.store.select(selectRootPath), { initialValue: null });

  ngOnInit(): void {
    if (this.rootPath()) {
      this.store.dispatch(UcActions.loadUsecases());
    }
  }

  openAddPanel(): void {
    this.dialog.open(AddPanelDialogComponent).afterClosed().pipe(
      filter((vt): vt is ViewType => !!vt),
    ).subscribe(viewType => {
      const panel: Panel = {
        id: newId(),
        viewType,
        ucId: null,
        pinned: false,
        x: 0,
        y: 0,
        rows: 2,
        cols: 3,
      };
      this.store.dispatch(LayoutActions.addPanel({ panel }));
    });
  }

  changeRoot(): void {
    this.store.dispatch(LayoutActions.setRootPath({ rootPath: '' }));
  }
}
