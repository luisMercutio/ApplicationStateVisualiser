import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Store } from '@ngrx/store';
import { LayoutActions } from '../../store/layout/layout.actions';
import { UcActions } from '../../store/uc/uc.actions';
import { FilesActions } from '../../store/files/files.actions';
import { FileService } from '../../services/file.service';

@Component({
  selector: 'app-folder-picker',
  standalone: true,
  imports: [FormsModule, MatButtonModule, MatInputModule, MatFormFieldModule, MatIconModule, MatProgressSpinnerModule],
  template: `
    <div class="picker-wrap">
      <div class="picker-card">
        <div class="logo">
          <mat-icon>account_tree</mat-icon>
          <h1>UC Architecture Viewer</h1>
        </div>
        <p class="subtitle">Enter the path to the project you want to inspect.</p>
        <mat-form-field appearance="outline" class="path-field">
          <mat-label>Project root path</mat-label>
          <input matInput [(ngModel)]="rootPath" placeholder="e.g. C:\\Users\\me\\MyProject"
                 (keydown.enter)="open()" autocomplete="off" spellcheck="false">
          <mat-icon matSuffix>folder_open</mat-icon>
        </mat-form-field>
        @if (error) {
          <p class="err"><mat-icon>error_outline</mat-icon> {{ error }}</p>
        }
        <button mat-raised-button color="primary" [disabled]="!rootPath || checking" (click)="open()">
          @if (checking) { <mat-spinner diameter="18" class="spinner"></mat-spinner> } @else { Open Project }
        </button>
      </div>
    </div>
  `,
  styles: [`
    .picker-wrap { display: flex; align-items: center; justify-content: center; height: 100vh; background: #f0f2f5; }
    .picker-card { background: white; border-radius: 12px; padding: 48px 40px; box-shadow: 0 4px 24px rgba(0,0,0,0.10); max-width: 480px; width: 100%; }
    .logo { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
    .logo mat-icon { font-size: 36px; width: 36px; height: 36px; color: #3f51b5; }
    .logo h1 { margin: 0; font-size: 22px; font-weight: 500; color: #333; }
    .subtitle { color: #666; margin: 0 0 24px; font-size: 14px; }
    .path-field { width: 100%; }
    button { width: 100%; height: 44px; margin-top: 8px; font-size: 15px; display: flex; align-items: center; justify-content: center; gap: 8px; }
    .err { color: #dc3545; font-size: 13px; display: flex; align-items: center; gap: 4px; margin: 4px 0; }
    .err mat-icon { font-size: 18px; width: 18px; height: 18px; }
    .spinner { display: inline-flex; }
  `],
})
export class FolderPickerComponent {
  private store = inject(Store);
  private fileService = inject(FileService);

  rootPath = '';
  error = '';
  checking = false;

  open(): void {
    if (!this.rootPath.trim()) return;
    this.checking = true;
    this.error = '';
    this.fileService.ping().subscribe({
      next: () => {
        this.store.dispatch(FilesActions.clearCache());
        this.store.dispatch(LayoutActions.setRootPath({ rootPath: this.rootPath.trim() }));
        this.store.dispatch(UcActions.loadUsecases());
        this.checking = false;
      },
      error: () => {
        this.error = 'Cannot reach server on localhost:3001. Run: node server.js';
        this.checking = false;
      },
    });
  }
}
