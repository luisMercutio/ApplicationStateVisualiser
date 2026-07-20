import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog } from '@angular/material/dialog';
import { Store } from '@ngrx/store';
import { Subscription } from 'rxjs';
import { Note, NoteInput } from '../../../models/note.model';
import { DbConnection } from '../../../models/db-connection.model';
import { AppDataActions } from '../../../store/app-data/app-data.actions';
import { selectNotes, selectAppDataLoading, selectAppDataError } from '../../../store/app-data/app-data.selectors';
import { selectActiveConnection } from '../../../store/connections/connections.selectors';
import { NoteFormDialogComponent } from '../../note-form-dialog/note-form-dialog.component';

/**
 * The Notes page: a list of free-form ideas for the active application, with full
 * CRUD. Each note has a title, a description, and an optional set of Business Rule
 * references. Backed by the `notes` table in the active connection's database via
 * the appData store — switching connections switches which app's notes show.
 */
@Component({
  selector: 'app-notes-list',
  standalone: true,
  imports: [MatIconModule, MatButtonModule, MatTooltipModule],
  template: `
    <div class="nl-root">
      <div class="nl-toolbar">
        <span class="title">Notes</span>
        @if (active(); as a) { <span class="conn">{{ a.name }}</span> }
        <span class="count">{{ notes().length }}</span>
        <span class="spacer"></span>
        @if (active()) {
          <button mat-icon-button class="sm" matTooltip="Add note" (click)="addNote()"><mat-icon>add</mat-icon></button>
        }
        <button mat-icon-button class="sm" matTooltip="Reload" (click)="reload()"><mat-icon>refresh</mat-icon></button>
      </div>

      @if (!active()) {
        <div class="msg">Select an application connection in the toolbar to see its notes.</div>
      } @else if (loading()) {
        <div class="msg">Loading notes…</div>
      } @else if (error()) {
        <div class="msg err">{{ error() }}</div>
      } @else if (!notes().length) {
        <div class="msg">No notes yet. Click <mat-icon class="inline">add</mat-icon> to jot down an idea.</div>
      } @else {
        <div class="nl-list">
          @for (n of notes(); track n.id) {
            <div class="note-card">
              <div class="nc-head">
                <span class="nc-title">{{ n.title }}</span>
                <span class="spacer"></span>
                <button mat-icon-button class="xs" matTooltip="Edit" (click)="editNote(n)"><mat-icon>edit</mat-icon></button>
                <button mat-icon-button class="xs del" matTooltip="Delete" (click)="deleteNote(n)"><mat-icon>delete</mat-icon></button>
              </div>
              @if (n.description) { <div class="nc-desc">{{ n.description }}</div> }
              @if (n.relatedBrs.length) {
                <div class="nc-brs">
                  @for (ref of n.relatedBrs; track ref) {
                    <span class="br-chip" matTooltip="Assigned to business rule {{ ref }}"><mat-icon>sell</mat-icon>{{ ref }}</span>
                  }
                </div>
              }
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .nl-root { display: flex; flex-direction: column; height: 100%; background: #fbfbfd; }
    .nl-toolbar { display: flex; align-items: center; gap: 8px; padding: 6px 10px; border-bottom: 1px solid #e6e6e6; font-size: 13px; }
    .nl-toolbar .title { font-weight: 600; color: #333; }
    .nl-toolbar .conn { font-size: 11px; color: #3f51b5; background: #eef1fb; padding: 1px 8px; border-radius: 10px; }
    .nl-toolbar .count { color: #999; font-size: 12px; }
    .spacer { flex: 1; } .sm { font-size: 12px; }
    .msg { padding: 24px; color: #999; text-align: center; } .msg.err { color: #c62828; }
    .msg .inline { font-size: 15px; vertical-align: middle; }
    .nl-list { flex: 1; overflow-y: auto; padding: 10px; }
    .note-card { background: white; border: 1px solid #dcdfe4; border-left: 4px solid #3f51b5; border-radius: 6px;
                 padding: 8px 10px; margin-bottom: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.06); max-width: 900px; }
    .note-card:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.12); }
    .nc-head { display: flex; align-items: center; gap: 4px; }
    .nc-title { font-size: 13px; font-weight: 600; color: #222; }
    .xs { width: 28px; height: 28px; line-height: 28px; } .xs mat-icon { font-size: 17px; width: 17px; height: 17px; }
    .del:hover { color: #c62828; }
    .nc-desc { font-size: 12px; color: #444; line-height: 1.4; margin-top: 4px; white-space: pre-wrap; }
    .nc-brs { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
    .br-chip { display: inline-flex; align-items: center; gap: 3px; font-size: 10px; font-family: monospace;
               background: #eef1fb; color: #3f51b5; border: 1px solid #d6ddf5;
               padding: 1px 7px; border-radius: 10px; max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .br-chip mat-icon { font-size: 12px; width: 12px; height: 12px; }
  `],
})
export class NotesListComponent implements OnInit, OnDestroy {
  private store = inject(Store);
  private dialog = inject(MatDialog);
  private subs: Subscription[] = [];

  active = signal<DbConnection | null>(null);
  loading = signal(false);
  error = signal<string | null>(null);
  notes = signal<Note[]>([]);

  ngOnInit(): void {
    this.subs.push(
      this.store.select(selectActiveConnection).subscribe((a) => this.active.set(a)),
      this.store.select(selectAppDataLoading).subscribe((v) => this.loading.set(v)),
      this.store.select(selectAppDataError).subscribe((v) => this.error.set(v)),
      this.store.select(selectNotes).subscribe((n) => this.notes.set(n)),
    );
  }

  ngOnDestroy(): void { this.subs.forEach((s) => s.unsubscribe()); }

  private connId(): string | null { return this.active()?.id ?? null; }

  addNote(): void {
    this.dialog.open(NoteFormDialogComponent).afterClosed().subscribe((input: NoteInput | undefined) => {
      const id = this.connId();
      if (input && id) this.store.dispatch(AppDataActions.createNote({ connectionId: id, input }));
    });
  }

  editNote(note: Note): void {
    this.dialog.open(NoteFormDialogComponent, { data: { note } }).afterClosed().subscribe((input: NoteInput | undefined) => {
      const id = this.connId();
      if (input && id) this.store.dispatch(AppDataActions.updateNote({ connectionId: id, noteId: note.id, input }));
    });
  }

  deleteNote(note: Note): void {
    const id = this.connId();
    if (id && confirm(`Delete note "${note.title}"?`)) {
      this.store.dispatch(AppDataActions.deleteNote({ connectionId: id, noteId: note.id }));
    }
  }

  reload(): void {
    const id = this.connId();
    if (id) this.store.dispatch(AppDataActions.load({ connectionId: id }));
  }
}
