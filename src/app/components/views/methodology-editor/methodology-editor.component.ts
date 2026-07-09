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
import { MethodologyFileMeta, MethodologyKind } from '../../../models/methodology-file.model';
import { MethodologyActions, methodologyKey } from '../../../store/methodology/methodology.actions';
import {
  selectMethodologyFiles,
  selectMethodologySelectedKey,
  selectMethodologyError,
  selectMethodologyContent,
  selectMethodologyLoading,
  selectMethodologySaving,
  selectMethodologyDirty,
} from '../../../store/methodology/methodology.selectors';

interface Group {
  kind: MethodologyKind;
  label: string;
  files: MethodologyFileMeta[];
}

/**
 * Edit the agent + command files that drive the methodology, backed by the MASTER
 * database (edits also write through to .claude/ on disk). Same UX as the file-based
 * Resources editor, but the source of truth is the DB, not the filesystem.
 */
@Component({
  selector: 'app-methodology-editor',
  standalone: true,
  imports: [FormsModule, MatIconModule, MatButtonModule, MatTooltipModule],
  template: `
    <div class="res-wrap">
      <div class="res-tree">
        <div class="tree-head">
          <span>Methodology (DB)</span>
          <button mat-icon-button class="sm" (click)="reload()" matTooltip="Reload"><mat-icon>refresh</mat-icon></button>
        </div>
        @if (error()) { <div class="tree-err">{{ error() }}</div> }
        @for (g of groups(); track g.kind) {
          <div class="tree-dir"><mat-icon>folder</mat-icon> {{ g.label }} <span class="cnt">{{ g.files.length }}</span></div>
          @for (f of g.files; track f.name) {
            <div class="tree-file" [class.active]="key(g.kind, f.name) === selectedKey()"
                 (click)="open(g.kind, f.name)">
              <mat-icon>description</mat-icon>
              <span class="fname">{{ f.name }}</span>
              @if (dirtyKeys().has(key(g.kind, f.name))) { <span class="dot" matTooltip="Unsaved changes"></span> }
            </div>
          }
        }
      </div>

      <div class="res-editor">
        @if (!selectedKey()) {
          <div class="placeholder-empty"><mat-icon>edit_note</mat-icon> Select an agent or command to view / edit</div>
        } @else {
          <div class="ed-head">
            <span class="ed-path">{{ selectedKey() }}</span>
            @if (dirty()) { <span class="dirty-badge">● unsaved</span> }
            <span class="spacer"></span>
            <button mat-button class="sm" (click)="preview.set(!preview())">
              <mat-icon>{{ preview() ? 'edit' : 'visibility' }}</mat-icon>
              {{ preview() ? 'Edit' : 'Preview' }}
            </button>
            <button mat-flat-button color="primary" class="sm" [disabled]="!dirty() || saving()" (click)="save()">
              <mat-icon>save</mat-icon> {{ saving() ? 'Saving…' : 'Save' }}
            </button>
          </div>
          @if (loading()) {
            <div class="placeholder-empty">Loading…</div>
          } @else if (preview()) {
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
    .tree-head { display: flex; align-items: center; justify-content: space-between; padding: 6px 4px 6px 10px; font-weight: 600; color: #555; position: sticky; top: 0; background: #fafafa; border-bottom: 1px solid #eee; z-index: 1; }
    .tree-err { font-size: 11px; padding: 4px 10px; background: #ffebee; color: #c62828; }
    .tree-dir { display: flex; align-items: center; gap: 6px; padding: 5px 8px; color: #777; font-weight: 600; }
    .tree-dir .cnt { color: #bbb; font-weight: 400; margin-left: auto; }
    .tree-file { display: flex; align-items: center; gap: 6px; padding: 4px 8px 4px 20px; cursor: pointer; color: #333; }
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
    .ed-area { flex: 1; width: 100%; border: none; outline: none; resize: none; padding: 12px; font-family: 'Consolas','Courier New',monospace; font-size: 13px; line-height: 1.5; box-sizing: border-box; }
    .placeholder-empty { display: flex; align-items: center; justify-content: center; gap: 8px; height: 100%; color: #aaa; }
    .md-body { padding: 12px; overflow-y: auto; font-size: 14px; line-height: 1.6; }
    .md-body ::ng-deep pre { background: #f5f5f5; padding: 12px; border-radius: 6px; overflow-x: auto; }
    .md-body ::ng-deep code { background: #f5f5f5; padding: 2px 4px; border-radius: 3px; font-size: 12px; }
    .md-body ::ng-deep table { border-collapse: collapse; }
    .md-body ::ng-deep th, .md-body ::ng-deep td { border: 1px solid #e0e0e0; padding: 6px 10px; }

    /* Mobile: a fixed 230px sidebar leaves almost no room for the editor, so
       stack the file tree above the editor and cap its height. */
    @media (max-width: 768px) {
      .res-wrap { flex-direction: column; }
      .res-tree { width: 100%; max-height: 40%; flex-shrink: 0;
                  border-right: none; border-bottom: 1px solid #e0e0e0; }
    }
  `],
})
export class MethodologyEditorComponent implements OnInit, OnDestroy {
  private store = inject(Store);
  private sanitizer = inject(DomSanitizer);
  private subs: Subscription[] = [];
  private keySubs: Subscription[] = [];

  groups = signal<Group[]>([]);
  selectedKey = signal<string | null>(null);
  content = signal<string>('');
  html = signal<SafeHtml>('');
  loading = signal(false);
  saving = signal(false);
  dirty = signal(false);
  error = signal<string | null>(null);
  preview = signal(false);
  dirtyKeys = signal<Set<string>>(new Set());

  private selectedKind: MethodologyKind | null = null;
  private selectedName: string | null = null;

  key(kind: MethodologyKind, name: string): string { return methodologyKey(kind, name); }

  ngOnInit(): void {
    this.store.dispatch(MethodologyActions.loadFiles());
    this.subs.push(
      this.store.select(selectMethodologyFiles).subscribe((files) => this.groups.set(toGroups(files))),
      this.store.select(selectMethodologyError).subscribe((e) => this.error.set(e)),
      this.store.select(selectMethodologySelectedKey).subscribe((k) => this.bindKey(k)),
    );
  }

  ngOnDestroy(): void {
    this.subs.forEach((s) => s.unsubscribe());
    this.keySubs.forEach((s) => s.unsubscribe());
  }

  open(kind: MethodologyKind, name: string): void {
    this.selectedKind = kind;
    this.selectedName = name;
    this.store.dispatch(MethodologyActions.selectFile({ key: methodologyKey(kind, name) }));
    this.store.dispatch(MethodologyActions.loadFile({ kind, name }));
  }

  reload(): void { this.store.dispatch(MethodologyActions.loadFiles()); }

  onEdit(value: string): void {
    const k = this.selectedKey();
    if (k) this.store.dispatch(MethodologyActions.setDraft({ key: k, content: value }));
  }

  onKey(e: KeyboardEvent): void {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      this.save();
    }
  }

  save(): void {
    if (this.selectedKind && this.selectedName && this.dirty() && !this.saving()) {
      this.store.dispatch(MethodologyActions.saveFile({ kind: this.selectedKind, name: this.selectedName, content: this.content() }));
    }
  }

  private bindKey(key: string | null): void {
    this.selectedKey.set(key);
    this.preview.set(false);
    this.keySubs.forEach((s) => s.unsubscribe());
    this.keySubs = [];
    if (!key) return;
    this.keySubs.push(
      this.store.select(selectMethodologyLoading(key)).subscribe((v) => this.loading.set(v)),
      this.store.select(selectMethodologySaving(key)).subscribe((v) => this.saving.set(v)),
      this.store.select(selectMethodologyContent(key)).subscribe((c) => {
        this.content.set(c ?? '');
        if (c != null) {
          const raw = marked.parse(c) as string;
          this.html.set(this.sanitizer.bypassSecurityTrustHtml(DOMPurify.sanitize(raw)));
        }
      }),
      this.store.select(selectMethodologyDirty(key)).subscribe((d) => {
        this.dirty.set(d);
        const next = new Set(this.dirtyKeys());
        if (d) next.add(key); else next.delete(key);
        this.dirtyKeys.set(next);
      }),
    );
  }
}

function toGroups(files: MethodologyFileMeta[]): Group[] {
  const order: { kind: MethodologyKind; label: string }[] = [
    { kind: 'agent', label: 'Agents' },
    { kind: 'command', label: 'Commands' },
  ];
  return order.map(({ kind, label }) => ({
    kind,
    label,
    files: files.filter((f) => f.kind === kind).sort((a, b) => a.name.localeCompare(b.name)),
  }));
}
