import { Component, inject, output } from '@angular/core';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Store } from '@ngrx/store';
import { AsyncPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { selectUsecases } from '../../store/uc/uc.selectors';
import { selectGlobalUcId } from '../../store/layout/layout.selectors';
import { LayoutActions } from '../../store/layout/layout.actions';
import { UcActions } from '../../store/uc/uc.actions';
import { FilesActions } from '../../store/files/files.actions';

@Component({
  selector: 'app-toolbar',
  standalone: true,
  imports: [MatToolbarModule, MatButtonModule, MatIconModule, MatSelectModule,
            MatFormFieldModule, MatTooltipModule, AsyncPipe, FormsModule],
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

      <button mat-stroked-button class="add-btn" (click)="addPanel.emit()">
        <mat-icon>add</mat-icon> Add Panel
      </button>

      <button mat-icon-button matTooltip="Change project root" (click)="changeRoot.emit()">
        <mat-icon>settings</mat-icon>
      </button>
    </mat-toolbar>
  `,
  styles: [`
    .app-toolbar { gap: 12px; }
    .title-icon { font-size: 24px; }
    .title { font-size: 18px; font-weight: 500; white-space: nowrap; }
    .uc-select { width: 300px; color: white; --mdc-outlined-text-field-label-text-color: rgba(255,255,255,0.8); }
    .uc-select ::ng-deep .mat-mdc-select-value { color: white; }
    .uc-select ::ng-deep .mat-mdc-notched-outline > * { border-color: rgba(255,255,255,0.5) !important; }
    .spacer { flex: 1; }
    .add-btn { color: white; border-color: rgba(255,255,255,0.6); }
  `],
})
export class ToolbarComponent {
  private store = inject(Store);
  usecases$ = this.store.select(selectUsecases);
  globalUcId$ = this.store.select(selectGlobalUcId);

  addPanel = output<void>();
  changeRoot = output<void>();

  setUc(ucId: string): void {
    this.store.dispatch(LayoutActions.setGlobalUc({ ucId }));
  }

  reload(): void {
    this.store.dispatch(FilesActions.clearCache());
    this.store.dispatch(UcActions.loadUsecases());
  }
}
