import { Component, inject, output } from '@angular/core';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { Store } from '@ngrx/store';
import { AsyncPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { selectUsecases } from '../../store/uc/uc.selectors';
import { selectGlobalUcId } from '../../store/layout/layout.selectors';
import { LayoutActions } from '../../store/layout/layout.actions';
import { UcActions } from '../../store/uc/uc.actions';
import { FilesActions } from '../../store/files/files.actions';
import { LayoutsActions } from '../../store/layouts/layouts.actions';
import { selectLayoutNames, selectActiveLayout, selectLayoutSaving } from '../../store/layouts/layouts.selectors';
import { SaveLayoutDialogComponent } from '../save-layout-dialog/save-layout-dialog.component';
import { filter } from 'rxjs';

@Component({
  selector: 'app-toolbar',
  standalone: true,
  imports: [MatToolbarModule, MatButtonModule, MatIconModule, MatSelectModule,
            MatFormFieldModule, MatTooltipModule, MatDialogModule, AsyncPipe, FormsModule],
  template: `
    <mat-toolbar color="primary" class="app-toolbar">
      <mat-icon class="title-icon">account_tree</mat-icon>
      <span class="title">UC Architecture Viewer</span>

      <mat-form-field appearance="outline" class="uc-select" subscriptSizing="dynamic">
        <mat-label>Active UC</mat-label>
        <mat-select [ngModel]="globalUcId$ | async" (ngModelChange)="setUc($event)">
          @for (uc of usecases$ | async; track uc.id) {
            <mat-option [value]="uc.id">{{ uc.id }} — {{ uc.title }}</mat-option>
          }
        </mat-select>
      </mat-form-field>

      <button mat-icon-button matTooltip="Reload use-cases" (click)="reload()">
        <mat-icon>refresh</mat-icon>
      </button>

      <span class="spacer"></span>

      <!-- Layout management -->
      <mat-form-field appearance="outline" class="layout-select" subscriptSizing="dynamic">
        <mat-label>Layout</mat-label>
        <mat-select [ngModel]="activeLayout()" (ngModelChange)="applyLayout($event)" placeholder="None saved">
          @for (name of layoutNames(); track name) {
            <mat-option [value]="name">{{ name }}</mat-option>
          }
        </mat-select>
      </mat-form-field>

      <button mat-icon-button matTooltip="Save current layout as…"
              [disabled]="layoutSaving()" (click)="openSaveDialog()">
        <mat-icon>{{ layoutSaving() ? 'hourglass_top' : 'bookmark_add' }}</mat-icon>
      </button>

      <button mat-icon-button matTooltip="Delete selected layout"
              [disabled]="!activeLayout()" (click)="deleteLayout()">
        <mat-icon>bookmark_remove</mat-icon>
      </button>

      <span class="divider"></span>

      <button mat-stroked-button class="add-btn" (click)="addPanel.emit()">
        <mat-icon>add</mat-icon> Add Panel
      </button>

      <button mat-icon-button matTooltip="Change project root" (click)="changeRoot.emit()">
        <mat-icon>settings</mat-icon>
      </button>
    </mat-toolbar>
  `,
  styles: [`
    .app-toolbar { gap: 8px; }
    .title-icon { font-size: 24px; }
    .title { font-size: 18px; font-weight: 500; white-space: nowrap; }
    .uc-select { width: 300px; color: white; --mdc-outlined-text-field-label-text-color: rgba(255,255,255,0.8); }
    .uc-select ::ng-deep .mat-mdc-select-value { color: white; }
    .uc-select ::ng-deep .mat-mdc-notched-outline > * { border-color: rgba(255,255,255,0.5) !important; }
    .layout-select { width: 180px; color: white; --mdc-outlined-text-field-label-text-color: rgba(255,255,255,0.8); }
    .layout-select ::ng-deep .mat-mdc-select-value { color: white; }
    .layout-select ::ng-deep .mat-mdc-notched-outline > * { border-color: rgba(255,255,255,0.5) !important; }
    .spacer { flex: 1; }
    .divider { width: 1px; height: 24px; background: rgba(255,255,255,0.3); margin: 0 4px; }
    .add-btn { color: white; border-color: rgba(255,255,255,0.6); }
  `],
})
export class ToolbarComponent {
  private store = inject(Store);
  private dialog = inject(MatDialog);

  usecases$ = this.store.select(selectUsecases);
  globalUcId$ = this.store.select(selectGlobalUcId);
  layoutNames = toSignal(this.store.select(selectLayoutNames), { initialValue: [] as string[] });
  activeLayout = toSignal(this.store.select(selectActiveLayout), { initialValue: null });
  layoutSaving = toSignal(this.store.select(selectLayoutSaving), { initialValue: false });

  addPanel = output<void>();
  changeRoot = output<void>();

  setUc(ucId: string): void {
    this.store.dispatch(LayoutActions.setGlobalUc({ ucId }));
  }

  reload(): void {
    this.store.dispatch(FilesActions.clearCache());
    this.store.dispatch(UcActions.loadUsecases());
  }

  applyLayout(name: string): void {
    if (name) this.store.dispatch(LayoutsActions.applyLayout({ name }));
  }

  openSaveDialog(): void {
    this.dialog.open(SaveLayoutDialogComponent, { data: this.activeLayout() })
      .afterClosed().pipe(filter((name): name is string => !!name))
      .subscribe(name => this.store.dispatch(LayoutsActions.saveLayout({ name })));
  }

  deleteLayout(): void {
    const name = this.activeLayout();
    if (name) this.store.dispatch(LayoutsActions.deleteLayout({ name }));
  }
}