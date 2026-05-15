import { Component, Input, OnInit, OnChanges, OnDestroy, SimpleChanges, inject, signal } from '@angular/core';
import { Store } from '@ngrx/store';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { Subscription } from 'rxjs';
import { FileService } from '../../../services/file.service';
import { selectRootPath } from '../../../store/layout/layout.selectors';

@Component({
  selector: 'app-mockup-view',
  standalone: true,
  imports: [MatIconModule, MatSelectModule, MatFormFieldModule, FormsModule],
  template: `
    <div class="mockup-wrap">
      @if (!ucId) {
        <div class="placeholder-empty"><mat-icon>web</mat-icon> Select a UC</div>
      } @else if (!mockupFiles().length && !loading()) {
        <div class="placeholder-empty"><mat-icon>web</mat-icon> No mockups generated yet</div>
      } @else if (loading()) {
        <div class="placeholder-empty"><mat-icon>hourglass_top</mat-icon> Loading...</div>
      } @else {
        <div class="mockup-toolbar">
          <mat-form-field appearance="outline" subscriptSizing="dynamic" class="file-select">
            <mat-label>Mockup file</mat-label>
            <mat-select [(ngModel)]="selectedFile" (ngModelChange)="updateIframeSrc()">
              @for (f of mockupFiles(); track f) {
                <mat-option [value]="f">{{ fileName(f) }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
        </div>
        @if (iframeSrc()) {
          <iframe [src]="iframeSrc()!" sandbox="allow-same-origin" class="mockup-frame"></iframe>
        }
      }
    </div>
  `,
  styles: [`
    .mockup-wrap { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
    .mockup-toolbar { padding: 8px 12px; border-bottom: 1px solid #eee; flex-shrink: 0; }
    .file-select { width: 280px; }
    .mockup-frame { flex: 1; border: none; width: 100%; min-height: 0; }
  `],
})
export class MockupViewComponent implements OnInit, OnChanges, OnDestroy {
  @Input() ucId: string | null = null;
  private store = inject(Store);
  private fileService = inject(FileService);
  private sanitizer = inject(DomSanitizer);
  private subs: Subscription[] = [];

  mockupFiles = signal<string[]>([]);
  loading = signal(false);
  selectedFile = '';
  iframeSrc = signal<SafeResourceUrl | null>(null);

  ngOnInit(): void { this.load(); }
  ngOnChanges(c: SimpleChanges): void {
    if (c['ucId'] && !c['ucId'].firstChange) { this.clearSubs(); this.load(); }
  }
  ngOnDestroy(): void { this.clearSubs(); }
  private clearSubs(): void { this.subs.forEach(s => s.unsubscribe()); this.subs = []; }

  private load(): void {
    if (!this.ucId) return;
    this.loading.set(true);
    this.subs.push(
      this.store.select(selectRootPath).subscribe(root => {
        if (!root) return;
        this.fileService.getTree(root).subscribe({
          next: ({ tree }) => {
            const ucNode = tree.find(n => n.name === this.ucId && n.type === 'directory');
            const mockupsNode = ucNode?.children?.find(n => n.name === 'mockups' && n.type === 'directory');
            const htmlFiles = (mockupsNode?.children ?? [])
              .filter(n => n.type === 'file' && n.name.endsWith('.html'))
              .map(n => n.path);
            this.mockupFiles.set(htmlFiles);
            this.loading.set(false);
            if (htmlFiles.length) {
              this.selectedFile = htmlFiles[0];
              this.updateIframeSrcWithRoot(root);
            }
          },
          error: () => { this.mockupFiles.set([]); this.loading.set(false); },
        });
      }),
    );
  }

  updateIframeSrc(): void {
    this.subs.push(
      this.store.select(selectRootPath).subscribe(root => {
        if (root) this.updateIframeSrcWithRoot(root);
      }),
    );
  }

  private updateIframeSrcWithRoot(root: string): void {
    if (!this.selectedFile) return;
    const url = this.fileService.getMockupUrl(root, this.selectedFile);
    this.iframeSrc.set(this.sanitizer.bypassSecurityTrustResourceUrl(url));
  }

  fileName(path: string): string {
    return path.split('/').pop() ?? path;
  }
}
