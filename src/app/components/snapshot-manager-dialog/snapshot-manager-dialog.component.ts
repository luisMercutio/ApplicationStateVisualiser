import { Component, OnInit, inject, signal } from '@angular/core';
import { MatDialog, MatDialogModule, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar } from '@angular/material/snack-bar';
import { FormsModule } from '@angular/forms';
import { Store } from '@ngrx/store';
import { take } from 'rxjs/operators';
import { forkJoin } from 'rxjs';
import { BrSnapshotMeta } from '../../models/app-data.model';
import { DbService } from '../../services/db.service';
import { computeBrDiff } from '../../models/br-diff';
import { selectEpics, selectAppRules } from '../../store/app-data/app-data.selectors';
import { SnapshotDiffDialogComponent, SnapshotDiffDialogData } from '../snapshot-diff-dialog/snapshot-diff-dialog.component';

export interface SnapshotManagerDialogData {
  connectionId: string;
  connectionName: string;
}

// Manage point-in-time snapshots of the whole Epic + Business Rule set for one
// application: capture a new snapshot (with a label), list existing snapshots,
// delete them, and open a diff of any snapshot against the current live set.
// Talks to the API directly (DbService) — snapshots are not part of the live
// editable NgRx state — while reading the CURRENT epics/rules from the store to
// compute the diff.
@Component({
  selector: 'app-snapshot-manager-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule, MatTooltipModule, FormsModule],
  template: `
    <h2 mat-dialog-title><mat-icon class="ttl-ic">photo_camera</mat-icon> Snapshots · {{ data.connectionName }}</h2>
    <mat-dialog-content>
      <p class="hint">
        A snapshot freezes the current Epics and Business Rules so you can reorder freely and
        later diff against how they looked. Save as many as you like.
      </p>

      <div class="create">
        <mat-form-field appearance="outline" class="grow">
          <mat-label>Snapshot label</mat-label>
          <input matInput [(ngModel)]="label" placeholder="e.g. Before reorder" (keyup.enter)="create()" [disabled]="busy()">
        </mat-form-field>
        <button mat-flat-button color="primary" (click)="create()" [disabled]="busy()">
          <mat-icon>add_a_photo</mat-icon> Create snapshot
        </button>
      </div>

      @if (loading()) {
        <p class="empty">Loading snapshots…</p>
      } @else if (!snapshots().length) {
        <p class="empty">No snapshots yet. Create one above to capture the current state.</p>
      } @else {
        <div class="list">
          @for (s of snapshots(); track s.id) {
            <div class="snap">
              <mat-icon class="s-ic">history</mat-icon>
              <div class="s-body">
                <div class="s-label">{{ s.label }}</div>
                <div class="s-meta">{{ fmtDate(s.createdAt) }} · {{ s.ruleCount }} rules · {{ s.epicCount }} epics</div>
              </div>
              <button mat-stroked-button class="s-diff" (click)="openDiff(s)" [disabled]="busy()">
                <mat-icon>difference</mat-icon> Diff vs current
              </button>
              <button mat-icon-button matTooltip="Delete snapshot" (click)="remove(s)" [disabled]="busy()"><mat-icon>delete</mat-icon></button>
            </div>
          }
        </div>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Close</button>
    </mat-dialog-actions>
  `,
  styles: [`
    mat-dialog-content { min-width: 560px; max-width: 680px; padding-top: 4px !important; }
    .ttl-ic { vertical-align: middle; margin-right: 4px; }
    .hint { font-size: 12px; color: #888; margin: 0 0 12px; }
    .create { display: flex; align-items: flex-start; gap: 8px; margin-bottom: 8px; }
    .grow { flex: 1; }
    .empty { color: #999; font-size: 13px; font-style: italic; padding: 8px 0; }
    .list { display: flex; flex-direction: column; gap: 6px; }
    .snap { display: flex; align-items: center; gap: 10px; border: 1px solid #e4e4e8; border-radius: 6px;
            padding: 6px 10px; background: #fcfcfd; }
    .s-ic { color: #7986cb; }
    .s-body { flex: 1; min-width: 0; }
    .s-label { font-size: 13px; font-weight: 600; color: #333; }
    .s-meta { font-size: 11px; color: #999; }
    .s-diff mat-icon { font-size: 16px; width: 16px; height: 16px; margin-right: 2px; }
  `],
})
export class SnapshotManagerDialogComponent implements OnInit {
  private db = inject(DbService);
  private store = inject(Store);
  private dialog = inject(MatDialog);
  private snackBar = inject(MatSnackBar);
  data = inject<SnapshotManagerDialogData>(MAT_DIALOG_DATA);

  snapshots = signal<BrSnapshotMeta[]>([]);
  loading = signal(true);
  busy = signal(false);
  label = '';

  ngOnInit(): void { this.reload(); }

  private reload(): void {
    this.loading.set(true);
    this.db.listSnapshots(this.data.connectionId).subscribe({
      next: (r) => { this.snapshots.set(r.snapshots); this.loading.set(false); },
      error: (e) => { this.loading.set(false); this.fail(e); },
    });
  }

  create(): void {
    const label = this.label.trim() || 'Snapshot';
    this.busy.set(true);
    this.db.createSnapshot(this.data.connectionId, { label }).subscribe({
      next: (snap) => {
        this.snapshots.set([snap, ...this.snapshots()]);
        this.label = '';
        this.busy.set(false);
        this.snackBar.open(`Snapshot "${snap.label}" captured (${snap.ruleCount} rules).`, 'Dismiss', { duration: 3000 });
      },
      error: (e) => { this.busy.set(false); this.fail(e); },
    });
  }

  remove(s: BrSnapshotMeta): void {
    if (!confirm(`Delete snapshot "${s.label}"? This cannot be undone.`)) return;
    this.busy.set(true);
    this.db.deleteSnapshot(this.data.connectionId, s.id).subscribe({
      next: () => { this.snapshots.set(this.snapshots().filter((x) => x.id !== s.id)); this.busy.set(false); },
      error: (e) => { this.busy.set(false); this.fail(e); },
    });
  }

  // Fetch the full snapshot and the CURRENT epics/rules (fresh from the store),
  // compute the diff, and open the read-only diff view.
  openDiff(s: BrSnapshotMeta): void {
    this.busy.set(true);
    forkJoin({
      snapshot: this.db.getSnapshot(this.data.connectionId, s.id),
      epics: this.store.select(selectEpics).pipe(take(1)),
      rules: this.store.select(selectAppRules).pipe(take(1)),
    }).subscribe({
      next: ({ snapshot, epics, rules }) => {
        this.busy.set(false);
        const diff = computeBrDiff(
          { epics: snapshot.epics, rules: snapshot.rules },
          { epics, rules },
        );
        const dialogData: SnapshotDiffDialogData = {
          snapshotLabel: snapshot.label, snapshotCreatedAt: snapshot.createdAt, diff,
        };
        this.dialog.open(SnapshotDiffDialogComponent, { data: dialogData });
      },
      error: (e) => { this.busy.set(false); this.fail(e); },
    });
  }

  fmtDate(iso: string): string {
    const d = new Date(iso);
    return isNaN(d.getTime()) ? iso : d.toLocaleString();
  }

  private fail(err: unknown): void {
    const e = err as { error?: { error?: string }; message?: string };
    this.snackBar.open(e?.error?.error ?? e?.message ?? 'Request failed', 'Dismiss', { duration: 4500 });
  }
}
