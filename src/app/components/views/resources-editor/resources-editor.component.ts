import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Store } from '@ngrx/store';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Subscription } from 'rxjs';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { FileTreeNode } from '../../../models/uc.model';
import { ResourcesActions } from '../../../store/resources/resources.actions';
import {
  selectResourcesTree,
  selectResourcesSelectedPath,
  selectResourcesError,
  selectResourceContent,
  selectResourceLoading,
  selectResourceSaving,
  selectResourceDirty,
} from '../../../store/resources/resources.selectors';

interface FlatNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  depth: number;
}

@Component({
  selector: 'app-resources-editor',
  standalone: true,
  imports: [FormsModule, MatIconModule, MatButtonModule, MatTooltipModule],
  template: `
    <div class="res-wrap">
      <div class="res-tree">
        <div class="tree-head">
          <span>Methodology</span>
          <button mat-icon-button class="sm" (click)="reload()" matTooltip="Reload"><mat-icon>refresh</mat-icon></button>
        </div>
        @for (n of flat(); track n.path) {
          @if (n.type === 'directory') {
            <div class="tree-dir" [style.paddingLeft.px]="8 + n.depth * 12">
              <mat-icon>folder</mat-icon> {{ n.name }}
            </div>
          } @else {
            <div class="tree-file" [class.active]="n.path === selectedPath()"
                 [style.paddingLeft.px]="8 + n.depth * 12" (click)="open(n.path)">
              <mat-icon>description</mat-icon>
              <span class="fname">{{ n.name }}</span>
              @if (dirtyPaths().has(n.path)) { <span class="dot" matTooltip="Unsaved changes"></span> }
            </div>
          }
        }
      </div>

      <div class="res-editor">
        @if (!selectedPath()) {
          <div class="placeholder-empty"><mat-icon>edit_note</mat-icon> Select an agent or command to view / edit</div>
        } @else {
          <div class="ed-head">
            <span class="ed-path">{{ selectedPath() }}</span>
            @if (dirty()) { <span class="dirty-badge">● unsaved</span> }
            <span class="spacer"></span>
            @if (isMarkdown()) {
              <button mat-button class="sm" (click)="preview.set(!preview())">
                <mat-icon>{{ preview() ? 'edit' : 'visibility' }}</mat-icon>
                {{ preview() ? 'Edit' : 'Preview' }}
              </button>
            }
            <button mat-flat-button color="primary" class="sm" [disabled]="!dirty() || saving()" (click)="save()">
              <mat-icon>save</mat-icon> {{ saving() ? 'Saving…' : 'Save' }}
            </button>
          </div>
          @if (error()) { <div class="ed-error">{{ error() }}</div> }
          @if (loading()) {
            <div class="placeholder-empty">Loading…</div>
          } @else if (preview() && isMarkdown()) {
            <div class="md-body" [innerHTML]="html()"></div>
          } @else {
            <textarea class="ed-area" spellcheck="false"
                      [ngModel]="content()" (ngModelChange)="onEdit($event)"
                      (keydown)="onKey($event)"></textarea>
          }
        }
      </div>
    </div>
  `,
  styles: [`
    .res-wrap { display: flex; height: 100%; }
    .res-tree { width: 230px; flex-shrink: 0; border-right: 1px solid #e0e0e0; overflow-y: auto; background: #fafafa; font-size: 13px; }
    .tree-head { display: flex; align-items: center; justify-content: space-between; padding: 6px 4px 6px 10px; font-weight: 600; color: #555; position: sticky; top: 0; background: #fafafa; border-bottom: 1px solid #eee; }
    .tree-dir { display: flex; align-items: center; gap: 6px; padding: 5px 8px; color: #777; font-weight: 600; }
    .tree-file { display: flex; align-items: center; gap: 6px; padding: 4px 8px; cursor: pointer; color: #333; }
    .tree-file:hover { background: #eceff1; }
    .tree-file.active { background: #e3f2fd; color: #1565c0; font-weight: 600; }
    .tree-dir mat-icon, .tree-file mat-icon { font-size: 16px; width: 16px; height: 16px; }
    .fname { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .dot { width: 7px; height: 7px; border-radius: 50%; background: #ff9800; margin-left: auto; flex-shrink: 0; }
    .res-editor { flex: 1; display: flex; flex-direction: column; min-width: 0; }
    .ed-head { display: flex; align-items: center; gap: 8px; padding: 6px 10px; border-bottom: 1px solid #e0e0e0; }
    .ed-path { font-family: monospace; font-size: 12px; color: #555; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .dirty-badge { color: #e65100; font-size: 11px; font-weight: 600; }
    .spacer { flex: 1; }
    .sm { font-size: 12px; }
    .ed-error { background: #ffebee; color: #c62828; padding: 6px 10px; font-size: 12px; }
    .ed-area { flex: 1; width: 100%; border: none; outline: none; resize: none; padding: 12px; font-family: 'Consolas','Courier New',monospace; font-size: 13px; line-height: 1.5; box-sizing: border-box; }
    .placeholder-empty { display: flex; align-items: center; justify-content: center; gap: 8px; height: 100%; color: #aaa; }
    .md-body { padding: 12px; overflow-y: auto; font-size: 14px; line-height: 1.6; }
    .md-body ::ng-deep pre { background: #f5f5f5; padding: 12px; border-radius: 6px; overflow-x: auto; }
    .md-body ::ng-deep code { background: #f5f5f5; padding: 2px 4px; border-radius: 3px; font-size: 12px; }
    .md-body ::ng-deep table { border-collapse: collapse; }
    .md-body ::ng-deep th, .md-body ::ng-deep td { border: 1px solid #e0e0e0; padding: 6px 10px; }
  `],
})
export class ResourcesEditorComponent implements OnInit, OnDestroy {
  private store = inject(Store);
  private sanitizer = inject(DomSanitizer);
  private subs: Subscription[] = [];
  private pathSubs: Subscription[] = [];

  flat = signal<FlatNode[]>([]);
  selectedPath = signal<string | null>(null);
  content = signal<string>('');
  html = signal<SafeHtml>('');
  loading = signal(false);
  saving = signal(false);
  dirty = signal(false);
  error = signal<string | null>(null);
  preview = signal(false);
  dirtyPaths = signal<Set<string>>(new Set());

  ngOnInit(): void {
    this.store.dispatch(ResourcesActions.loadTree());
    this.subs.push(
      this.store.select(selectResourcesTree).subscribe((tree) => this.flat.set(flatten(tree, 0))),
      this.store.select(selectResourcesError).subscribe((e) => this.error.set(e)),
      this.store.select(selectResourcesSelectedPath).subscribe((p) => this.bindPath(p)),
    );
  }

  ngOnDestroy(): void {
    this.subs.forEach((s) => s.unsubscribe());
    this.pathSubs.forEach((s) => s.unsubscribe());
  }

  isMarkdown(): boolean {
    return (this.selectedPath() ?? '').toLowerCase().endsWith('.md');
  }

  open(path: string): void {
    this.store.dispatch(ResourcesActions.selectFile({ path }));
    this.store.dispatch(ResourcesActions.loadFile({ path }));
  }

  reload(): void {
    this.store.dispatch(ResourcesActions.loadTree());
  }

  onEdit(value: string): void {
    const p = this.selectedPath();
    if (p) this.store.dispatch(ResourcesActions.setDraft({ path: p, content: value }));
  }

  onKey(e: KeyboardEvent): void {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      this.save();
    }
  }

  save(): void {
    const p = this.selectedPath();
    if (p && this.dirty() && !this.saving()) {
      this.store.dispatch(ResourcesActions.saveFile({ path: p, content: this.content() }));
    }
  }

  private bindPath(path: string | null): void {
    this.selectedPath.set(path);
    this.preview.set(false);
    this.pathSubs.forEach((s) => s.unsubscribe());
    this.pathSubs = [];
    if (!path) return;
    this.pathSubs.push(
      this.store.select(selectResourceLoading(path)).subscribe((v) => this.loading.set(v)),
      this.store.select(selectResourceSaving(path)).subscribe((v) => this.saving.set(v)),
      this.store.select(selectResourceContent(path)).subscribe((c) => {
        this.content.set(c ?? '');
        if (c != null) {
          const raw = marked.parse(c) as string;
          this.html.set(this.sanitizer.bypassSecurityTrustHtml(DOMPurify.sanitize(raw)));
        }
      }),
      this.store.select(selectResourceDirty(path)).subscribe((d) => {
        this.dirty.set(d);
        const next = new Set(this.dirtyPaths());
        if (d) next.add(path); else next.delete(path);
        this.dirtyPaths.set(next);
      }),
    );
  }
}

/** Flatten the resource tree, directories first, files sorted, skipping the root wrapper. */
function flatten(nodes: FileTreeNode[], depth: number): FlatNode[] {
  const out: FlatNode[] = [];
  const dirs = nodes.filter((n) => n.type === 'directory').sort((a, b) => a.name.localeCompare(b.name));
  const files = nodes.filter((n) => n.type === 'file').sort((a, b) => a.name.localeCompare(b.name));
  for (const d of dirs) {
    out.push({ name: d.name, path: d.path, type: 'directory', depth });
    out.push(...flatten(d.children ?? [], depth + 1));
  }
  for (const f of files) {
    out.push({ name: f.name, path: f.path, type: 'file', depth });
  }
  return out;
}
