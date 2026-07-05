import { Component, Input, OnInit, OnChanges, OnDestroy, SimpleChanges, inject, signal } from '@angular/core';
import { Store } from '@ngrx/store';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { LoadingStateComponent } from '../../loading-state/loading-state.component';
import { Subscription } from 'rxjs';
import { FileService } from '../../../services/file.service';
import { selectRootPath } from '../../../store/layout/layout.selectors';
import { selectBrHighlight } from '../../../store/br/br.selectors';

@Component({
  selector: 'app-mockup-view',
  standalone: true,
  imports: [MatIconModule, MatSelectModule, MatFormFieldModule, FormsModule, LoadingStateComponent],
  template: `
    <div class="mockup-wrap">
      @if (!ucId) {
        <div class="placeholder-empty"><mat-icon>web</mat-icon> Select a UC</div>
      } @else if (!mockupFiles().length && !loading()) {
        <div class="placeholder-empty"><mat-icon>web</mat-icon> No mockups generated yet</div>
      } @else if (loading()) {
        <app-loading-state [loading]="true" [error]="null"></app-loading-state>
      } @else {
        @if (touchedNames().size) {
          <div class="hl-banner"><mat-icon>my_location</mat-icon>
            {{ highlightBrId() }} touches {{ touchedNames().size }} mockup(s) here
          </div>
        }
        <div class="mockup-toolbar">
          <mat-form-field appearance="outline" subscriptSizing="dynamic" class="file-select">
            <mat-label>Mockup file</mat-label>
            <mat-select [(ngModel)]="selectedFile" (ngModelChange)="updateIframeSrc()">
              @for (f of mockupFiles(); track f) {
                <mat-option [value]="f">
                  @if (isTouched(f)) { <mat-icon class="star">star</mat-icon> }
                  {{ fileName(f) }}
                </mat-option>
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
    .hl-banner { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #e65100; background: #fff3e0; padding: 4px 10px; }
    .hl-banner mat-icon { font-size: 16px; width: 16px; height: 16px; }
    .star { font-size: 14px; width: 14px; height: 14px; color: #ff7043; vertical-align: middle; }
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
  highlightBrId = signal<string | null>(null);
  touchedNames = signal<Set<string>>(new Set());

  isTouched(path: string): boolean {
    return this.touchedNames().has(this.fileName(path));
  }

  ngOnInit(): void {
    this.load();
    this.subs.push(
      this.store.select(selectBrHighlight).subscribe(h => {
        this.highlightBrId.set(h?.brId ?? null);
        this.touchedNames.set(new Set(h?.touches.mockups ?? []));
        // jump to the first touched mockup that exists in this UC
        const hit = this.mockupFiles().find(f => this.isTouched(f));
        if (hit && hit !== this.selectedFile) {
          this.selectedFile = hit;
          this.updateIframeSrc();
        }
      }),
    );
  }
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
