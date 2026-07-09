import { Component, inject, input, output } from '@angular/core';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';
import { MatDividerModule } from '@angular/material/divider';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { Store } from '@ngrx/store';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { LayoutsActions } from '../../store/layouts/layouts.actions';
import { selectLayoutNames, selectActiveLayout, selectLayoutSaving } from '../../store/layouts/layouts.selectors';
import { SaveLayoutDialogComponent } from '../save-layout-dialog/save-layout-dialog.component';
import { DbManagerDialogComponent } from '../db-manager-dialog/db-manager-dialog.component';
import { DbBrowserDialogComponent } from '../db-browser-dialog/db-browser-dialog.component';
import { selectActiveConnection } from '../../store/connections/connections.selectors';
import { AppPage, NAV_PAGES } from '../../models/app-page.model';
import { filter } from 'rxjs';

@Component({
  selector: 'app-toolbar',
  standalone: true,
  imports: [MatToolbarModule, MatButtonModule, MatIconModule, MatSelectModule,
            MatFormFieldModule, MatTooltipModule, MatMenuModule, MatDividerModule,
            MatDialogModule, FormsModule],
  template: `
    <mat-toolbar color="primary" class="app-toolbar">
      <mat-icon class="title-icon">account_tree</mat-icon>
      <span class="title">Application State Visualiser</span>

      <span class="nav-divider desktop-only"></span>

      <!-- Page navigation (inline on desktop, collapsed into the menu on mobile) -->
      @for (nav of navPages; track nav.page) {
        <button mat-button class="nav-btn desktop-only" [class.active]="page() === nav.page" (click)="navigate.emit(nav.page)">
          <mat-icon>{{ nav.icon }}</mat-icon> {{ nav.label }}
        </button>
      }

      <span class="spacer"></span>

      <!-- Features-page-only: layout management + add panel (desktop inline) -->
      @if (page() === 'features') {
        <mat-form-field appearance="outline" class="layout-select desktop-only" subscriptSizing="dynamic">
          <mat-label>Layout</mat-label>
          <mat-select [ngModel]="activeLayout()" (ngModelChange)="applyLayout($event)" placeholder="None saved">
            @for (name of layoutNames(); track name) {
              <mat-option [value]="name">{{ name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <button mat-icon-button class="desktop-only" matTooltip="Save current layout as…"
                [disabled]="layoutSaving()" (click)="openSaveDialog()">
          <mat-icon>{{ layoutSaving() ? 'hourglass_top' : 'bookmark_add' }}</mat-icon>
        </button>
        <button mat-icon-button class="desktop-only" matTooltip="Delete selected layout"
                [disabled]="!activeLayout()" (click)="deleteLayout()">
          <mat-icon>bookmark_remove</mat-icon>
        </button>

        <button mat-stroked-button class="add-btn desktop-only" (click)="addPanel.emit()">
          <mat-icon>add</mat-icon> Add Panel
        </button>

        <span class="divider desktop-only"></span>
      }

      <!-- Application State Manager: browse the active database's state — desktop icon -->
      <button mat-icon-button class="desktop-only" matTooltip="Application State Manager"
              [disabled]="!activeConnection()" (click)="browse()">
        <mat-icon>table_view</mat-icon>
      </button>

      <!-- Claude (Methodology editor) — desktop icon -->
      <button mat-icon-button class="desktop-only" matTooltip="Claude" [class.active-gear]="page() === 'settings'"
              (click)="navigate.emit('settings')">
        <mat-icon>smart_toy</mat-icon>
      </button>

      <!-- Database connections — desktop icon (opens the manager dialog) -->
      <button mat-icon-button class="desktop-only" matTooltip="Database connections" (click)="openDbManager()">
        <mat-icon>settings</mat-icon>
      </button>

      <!-- Mobile: everything above collapses into a single overflow menu -->
      <button mat-icon-button class="mobile-only" matTooltip="Menu" [matMenuTriggerFor]="mobileMenu"
              aria-label="Open navigation menu">
        <mat-icon>menu</mat-icon>
      </button>
      <mat-menu #mobileMenu="matMenu">
        @for (nav of navPages; track nav.page) {
          <button mat-menu-item [class.active-item]="page() === nav.page" (click)="navigate.emit(nav.page)">
            <mat-icon>{{ nav.icon }}</mat-icon>
            <span>{{ nav.label }}</span>
          </button>
        }
        <mat-divider></mat-divider>
        @if (page() === 'features') {
          <button mat-menu-item (click)="addPanel.emit()">
            <mat-icon>add</mat-icon><span>Add Panel</span>
          </button>
          <button mat-menu-item [disabled]="layoutSaving()" (click)="openSaveDialog()">
            <mat-icon>bookmark_add</mat-icon><span>Save layout as…</span>
          </button>
          <button mat-menu-item [disabled]="!activeLayout()" (click)="deleteLayout()">
            <mat-icon>bookmark_remove</mat-icon><span>Delete layout</span>
          </button>
          @if (layoutNames().length) {
            <mat-divider></mat-divider>
            @for (name of layoutNames(); track name) {
              <button mat-menu-item (click)="applyLayout(name)">
                <mat-icon>{{ activeLayout() === name ? 'check' : 'bookmark_border' }}</mat-icon>
                <span>{{ name }}</span>
              </button>
            }
          }
          <mat-divider></mat-divider>
        }
        <button mat-menu-item [disabled]="!activeConnection()" (click)="browse()">
          <mat-icon>table_view</mat-icon><span>Application State Manager</span>
        </button>
        <button mat-menu-item [class.active-item]="page() === 'settings'" (click)="navigate.emit('settings')">
          <mat-icon>smart_toy</mat-icon><span>Claude</span>
        </button>
        <button mat-menu-item (click)="openDbManager()">
          <mat-icon>settings</mat-icon><span>Database connections</span>
        </button>
      </mat-menu>
    </mat-toolbar>
  `,
  styles: [`
    .app-toolbar { gap: 6px; }
    .title-icon { font-size: 24px; }
    .title { font-size: 18px; font-weight: 500; white-space: nowrap; }
    .nav-divider { width: 1px; height: 24px; background: rgba(255,255,255,0.3); margin: 0 6px; }
    .nav-btn { color: rgba(255,255,255,0.85); }
    .nav-btn.active { color: white; background: rgba(255,255,255,0.18); }
    .nav-btn mat-icon { font-size: 18px; width: 18px; height: 18px; margin-right: 2px; }
    .spacer { flex: 1; }
    .layout-select { width: 170px; color: white; --mdc-outlined-text-field-label-text-color: rgba(255,255,255,0.8); }
    .layout-select ::ng-deep .mat-mdc-select-value { color: white; }
    .layout-select ::ng-deep .mat-mdc-notched-outline > * { border-color: rgba(255,255,255,0.5) !important; }
    .divider { width: 1px; height: 24px; background: rgba(255,255,255,0.3); margin: 0 4px; }
    .add-btn { color: white; border-color: rgba(255,255,255,0.6); }
    .active-gear { color: #ffeb3b; }

    /* Responsive: below 768px the inline controls collapse into a menu. */
    .mobile-only { display: none; }
    @media (max-width: 768px) {
      .desktop-only { display: none !important; }
      .mobile-only { display: inline-flex !important; }
      .title { display: none; }
    }
  `],
})
export class ToolbarComponent {
  private store = inject(Store);
  private dialog = inject(MatDialog);

  page = input<AppPage>('br-list');
  navigate = output<AppPage>();
  addPanel = output<void>();

  navPages = NAV_PAGES;

  layoutNames = toSignal(this.store.select(selectLayoutNames), { initialValue: [] as string[] });
  activeLayout = toSignal(this.store.select(selectActiveLayout), { initialValue: null });
  layoutSaving = toSignal(this.store.select(selectLayoutSaving), { initialValue: false });
  activeConnection = toSignal(this.store.select(selectActiveConnection), { initialValue: null });

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

  openDbManager(): void {
    this.dialog.open(DbManagerDialogComponent);
  }

  browse(): void {
    const conn = this.activeConnection();
    if (conn) this.dialog.open(DbBrowserDialogComponent, { data: conn });
  }
}
