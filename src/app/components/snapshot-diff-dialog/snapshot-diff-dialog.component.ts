import { Component, computed, inject, signal } from '@angular/core';
import { MatDialogModule, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { BrDiff } from '../../models/br-diff';

export interface SnapshotDiffDialogData {
  snapshotLabel: string;
  snapshotCreatedAt: string;
  diff: BrDiff;
}

// Read-only view of a computed diff between a snapshot and the current BR set.
// Ordering is the headline: the "Moved" section shows execution-order / epic
// changes with a before → after arrow; "Modified" lists content-field edits;
// "Added"/"Removed" cover rules that appeared or disappeared.
@Component({
  selector: 'app-snapshot-diff-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule, MatIconModule, MatTooltipModule],
  template: `
    <h2 mat-dialog-title>
      <mat-icon class="ttl-ic">difference</mat-icon>
      Diff · {{ data.snapshotLabel }} → current
    </h2>
    <mat-dialog-content>
      <div class="summary">
        <span class="cap">{{ fmtDate(data.snapshotCreatedAt) }}</span>
        <span class="spacer"></span>
        <span class="chip added" [class.dim]="!c.added">+{{ c.added }} added</span>
        <span class="chip removed" [class.dim]="!c.removed">−{{ c.removed }} removed</span>
        <span class="chip moved" [class.dim]="!c.moved">↕ {{ c.moved }} moved</span>
        <span class="chip modified" [class.dim]="!c.modified">✎ {{ c.modified }} modified</span>
        <span class="chip unchanged" [class.dim]="!c.unchanged">= {{ c.unchanged }} unchanged</span>
      </div>

      @if (isIdentical()) {
        <div class="empty">
          <mat-icon>check_circle</mat-icon>
          <span>No differences — the current Business Rules match this snapshot exactly.</span>
        </div>
      }

      @if (diff.epics.length) {
        <div class="section">
          <div class="sec-head">Epics</div>
          @for (e of diff.epics; track e.id) {
            <div class="epic-row" [class]="e.kind">
              <span class="badge {{ e.kind }}">{{ e.kind }}</span>
              <span class="e-label">{{ e.label }}</span>
              @if (e.changes.length) {
                <span class="e-changes">
                  @for (ch of e.changes; track ch.field) {
                    <span class="fld">{{ ch.field }}: <del>{{ ch.before || '∅' }}</del> → <ins>{{ ch.after || '∅' }}</ins></span>
                  }
                </span>
              }
            </div>
          }
        </div>
      }

      @if (moved().length) {
        <div class="section">
          <div class="sec-head">↕ Moved <span class="hint">execution order or epic changed</span></div>
          @for (r of moved(); track r.creationIndex) {
            <div class="row moved">
              <div class="r-top">
                <span class="r-name">{{ r.name }}</span>
                <span class="order-move">
                  <span class="ord before">{{ r.beforeOrder ?? '—' }}</span>
                  <mat-icon>arrow_forward</mat-icon>
                  <span class="ord after">{{ r.afterOrder ?? '—' }}</span>
                </span>
                @if (r.beforeEpic !== r.afterEpic) {
                  <span class="epic-move"><del>{{ r.beforeEpic }}</del> → <ins>{{ r.afterEpic }}</ins></span>
                }
                @if (r.modified) { <span class="also">also modified</span> }
              </div>
              <div class="r-rule">{{ r.ruleText }}</div>
            </div>
          }
        </div>
      }

      @if (modifiedOnly().length) {
        <div class="section">
          <div class="sec-head">✎ Modified <span class="hint">content edited, position unchanged</span></div>
          @for (r of modifiedOnly(); track r.creationIndex) {
            <div class="row modified">
              <div class="r-top"><span class="r-name">{{ r.name }}</span><span class="ord after">#{{ r.afterOrder ?? '—' }}</span></div>
              @for (ch of r.fieldChanges; track ch.field) {
                <div class="fld-change">
                  <span class="fld-name">{{ ch.field }}</span>
                  <del>{{ ch.before || '∅' }}</del>
                  <mat-icon>arrow_forward</mat-icon>
                  <ins>{{ ch.after || '∅' }}</ins>
                </div>
              }
            </div>
          }
        </div>
      }

      @if (diff.added.length) {
        <div class="section">
          <div class="sec-head">+ Added <span class="hint">not present in the snapshot</span></div>
          @for (r of diff.added; track r.creationIndex) {
            <div class="row added">
              <div class="r-top"><span class="r-name">{{ r.name }}</span><span class="ord after">#{{ r.afterOrder ?? '—' }}</span><span class="epic-tag">{{ r.afterEpic }}</span></div>
              <div class="r-rule">{{ r.ruleText }}</div>
            </div>
          }
        </div>
      }

      @if (diff.removed.length) {
        <div class="section">
          <div class="sec-head">− Removed <span class="hint">was in the snapshot, gone now</span></div>
          @for (r of diff.removed; track r.creationIndex) {
            <div class="row removed">
              <div class="r-top"><span class="r-name">{{ r.name }}</span><span class="ord before">was #{{ r.beforeOrder ?? '—' }}</span><span class="epic-tag">{{ r.beforeEpic }}</span></div>
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
    mat-dialog-content { min-width: 620px; max-width: 760px; padding-top: 4px !important; }
    .ttl-ic { vertical-align: middle; margin-right: 4px; }
    .summary { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-bottom: 12px;
               position: sticky; top: 0; background: white; padding: 4px 0; z-index: 1; }
    .summary .cap { font-size: 11px; color: #999; }
    .spacer { flex: 1; }
    .chip { font-size: 11px; padding: 2px 8px; border-radius: 10px; font-weight: 600; }
    .chip.dim { opacity: 0.35; font-weight: 400; }
    .chip.added { background: #e6f4ea; color: #1b7f3b; }
    .chip.removed { background: #fdecea; color: #c0392b; }
    .chip.moved { background: #e8eefc; color: #2b52c4; }
    .chip.modified { background: #fff4e0; color: #b26a00; }
    .chip.unchanged { background: #f0f0f0; color: #888; }
    .empty { display: flex; align-items: center; gap: 8px; color: #1b7f3b; padding: 16px; font-size: 13px; }
    .section { margin-bottom: 16px; }
    .sec-head { font-size: 12px; font-weight: 700; color: #444; text-transform: uppercase; letter-spacing: 0.4px;
                border-bottom: 1px solid #eee; padding-bottom: 3px; margin-bottom: 6px; }
    .sec-head .hint { font-weight: 400; text-transform: none; letter-spacing: 0; color: #aaa; font-size: 11px; margin-left: 6px; }
    .row { border: 1px solid #e6e6e6; border-left: 3px solid #ccc; border-radius: 5px; padding: 6px 8px; margin-bottom: 6px; background: #fcfcfd; }
    .row.moved { border-left-color: #2b52c4; }
    .row.modified { border-left-color: #b26a00; }
    .row.added { border-left-color: #1b7f3b; }
    .row.removed { border-left-color: #c0392b; background: #fdf6f5; }
    .r-top { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .r-name { font-family: monospace; font-size: 12px; font-weight: 700; color: #333; }
    .order-move { display: inline-flex; align-items: center; gap: 3px; }
    .order-move mat-icon, .fld-change mat-icon { font-size: 15px; width: 15px; height: 15px; color: #999; }
    .ord { font-family: monospace; font-size: 12px; font-weight: 700; padding: 0 6px; border-radius: 8px; }
    .ord.before { background: #eee; color: #999; text-decoration: line-through; }
    .ord.after { background: #e8eefc; color: #2b52c4; }
    .epic-move { font-size: 11px; color: #555; }
    .epic-tag { font-size: 10px; color: #777; background: #f0f0f0; border-radius: 8px; padding: 1px 7px; }
    .also { font-size: 10px; color: #b26a00; background: #fff4e0; border-radius: 8px; padding: 1px 7px; }
    .r-rule { font-size: 12px; color: #555; margin-top: 3px; line-height: 1.35; }
    .fld-change { display: flex; align-items: center; gap: 6px; margin-top: 4px; font-size: 12px; flex-wrap: wrap; }
    .fld-name { font-family: monospace; font-size: 10px; color: #b26a00; background: #fff4e0; border-radius: 6px; padding: 1px 6px; }
    del { color: #c0392b; text-decoration: line-through; background: #fdecea; border-radius: 3px; padding: 0 3px; }
    ins { color: #1b7f3b; text-decoration: none; background: #e6f4ea; border-radius: 3px; padding: 0 3px; }
    .fld { display: block; font-size: 11px; margin-top: 2px; }
    .epic-row { display: flex; align-items: center; gap: 8px; padding: 3px 0; font-size: 12px; flex-wrap: wrap; }
    .badge { font-size: 9px; text-transform: uppercase; font-weight: 700; padding: 1px 6px; border-radius: 8px; }
    .badge.added { background: #e6f4ea; color: #1b7f3b; }
    .badge.removed { background: #fdecea; color: #c0392b; }
    .badge.renamed { background: #fff4e0; color: #b26a00; }
    .e-label { font-weight: 600; color: #333; }
    .e-changes { display: flex; flex-direction: column; }
  `],
})
export class SnapshotDiffDialogComponent {
  data = inject<SnapshotDiffDialogData>(MAT_DIALOG_DATA);
  diff = this.data.diff;
  c = this.diff.counts;

  moved = signal(this.diff.changed.filter((r) => r.moved));
  modifiedOnly = signal(this.diff.changed.filter((r) => r.modified && !r.moved));

  isIdentical = computed(() =>
    this.c.added === 0 && this.c.removed === 0 && this.c.moved === 0 &&
    this.c.modified === 0 && this.diff.epics.length === 0);

  fmtDate(iso: string): string {
    const d = new Date(iso);
    return isNaN(d.getTime()) ? iso : d.toLocaleString();
  }
}
