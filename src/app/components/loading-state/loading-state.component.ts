import { Component, Input, OnChanges, OnDestroy, SimpleChanges, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';

const HINTS = ['Reading file…', 'Parsing content…', 'Preparing view…', 'Almost there…'];

@Component({
  selector: 'app-loading-state',
  standalone: true,
  imports: [MatIconModule, MatProgressBarModule],
  template: `
    @if (loading) {
      <div class="ls-wrap">
        <mat-progress-bar mode="indeterminate"></mat-progress-bar>
        <div class="ls-body">
          <mat-icon class="ls-spinner">sync</mat-icon>
          <span class="ls-hint">{{ hint() }}</span>
          <span class="ls-elapsed">{{ elapsed() }}s</span>
        </div>
      </div>
    } @else if (error) {
      <div class="placeholder-empty">
        @if (isNotFound()) {
          <mat-icon class="ls-icon-notfound">insert_drive_file</mat-icon>
          <span class="ls-err-title">Not yet generated</span>
          <span class="ls-err-sub">Run the generator to create this artifact.</span>
        } @else {
          <mat-icon class="ls-icon-err">error_outline</mat-icon>
          <span class="ls-err-title">Failed to load</span>
          <span class="ls-err-sub">{{ error }}</span>
        }
      </div>
    }
  `,
  styles: [`
    :host { display: block; height: 100%; }
    .ls-wrap { height: 100%; display: flex; flex-direction: column; }
    mat-progress-bar { flex-shrink: 0; }
    .ls-body { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; }
    .ls-spinner { font-size: 36px; width: 36px; height: 36px; color: #3f51b5; animation: ls-spin 1.4s linear infinite; }
    @keyframes ls-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    .ls-hint { font-size: 13px; color: #888; font-style: italic; }
    .ls-elapsed { font-size: 12px; color: #bbb; }
    .ls-icon-notfound { font-size: 36px; width: 36px; height: 36px; color: #9e9e9e; }
    .ls-icon-err { font-size: 36px; width: 36px; height: 36px; color: #e53935; }
    .ls-err-title { font-size: 14px; font-weight: 500; }
    .ls-err-sub { font-size: 12px; color: #999; text-align: center; max-width: 240px; word-break: break-word; }
  `],
})
export class LoadingStateComponent implements OnChanges, OnDestroy {
  @Input() loading = false;
  @Input() error: string | null = null;

  elapsed = signal(0);
  hint = signal(HINTS[0]);
  private timer: ReturnType<typeof setInterval> | null = null;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['loading']) {
      this.loading ? this.startTimer() : this.stopTimer();
    }
  }

  ngOnDestroy(): void { this.stopTimer(); }

  isNotFound(): boolean {
    const e = (this.error ?? '').toLowerCase();
    return e.includes('404') || e.includes('not found') || e.includes('enoent') || e.includes('no such file');
  }

  private startTimer(): void {
    this.stopTimer();
    this.elapsed.set(0);
    this.hint.set(HINTS[0]);
    let t = 0;
    this.timer = setInterval(() => {
      this.elapsed.set(++t);
      this.hint.set(HINTS[Math.min(Math.floor(t / 3), HINTS.length - 1)]);
    }, 1000);
  }

  private stopTimer(): void {
    if (this.timer !== null) { clearInterval(this.timer); this.timer = null; }
  }
}