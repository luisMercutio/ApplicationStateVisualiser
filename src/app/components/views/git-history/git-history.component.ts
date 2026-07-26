import { Component, OnInit, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { forkJoin } from 'rxjs';
import { FileService } from '../../../services/file.service';
import { WorkspaceService } from '../../../services/workspace.service';
import { GitCommit, GitWorktree } from '../../../models/git.model';

// Read-only view over the repo's own git: an overview of the worktrees (each an
// isolated checkout of a branch) plus the commit history. Selecting a worktree
// scopes the history to that worktree's branch, so the page differentiates the
// several branches checked out side by side. Data comes from `/api/git/*`.
@Component({
  selector: 'app-git-history',
  standalone: true,
  imports: [MatIconModule, MatButtonModule, MatTooltipModule],
  template: `
    <div class="git-root">
      <div class="git-toolbar">
        <mat-icon class="t-icon">history</mat-icon>
        <span class="title">Git</span>
        <span class="count">{{ worktrees().length }} worktrees · {{ commits().length }} commits</span>
        <span class="spacer"></span>
        <button mat-icon-button class="sm" matTooltip="Refresh" (click)="refresh()"><mat-icon>refresh</mat-icon></button>
      </div>

      @if (error(); as e) { <div class="msg err">{{ e }}</div> }

      <!-- Worktree overview: one card per checkout, grouped side by side -->
      <div class="section-label">Worktrees</div>
      @if (!worktrees().length) {
        <div class="msg sub">No worktrees found.</div>
      } @else {
        <div class="wt-grid">
          @for (wt of worktrees(); track wt.path) {
            @let state = stateOf(wt);
            <div class="wt-cell">
              <button class="wt-card" [attr.data-state]="state"
                      [class.selected]="selectedRef() === refFor(wt)" (click)="selectWorktree(wt)">
                <div class="wt-top">
                  <mat-icon class="wt-icon">{{ wt.main ? 'home' : (wt.detached ? 'link_off' : 'account_tree') }}</mat-icon>
                  <span class="wt-branch">{{ wt.branch ?? (wt.detached ? 'detached HEAD' : '—') }}</span>
                </div>
                <div class="wt-badges">
                  @if (wt.main) { <span class="badge main">main tree</span> }
                  @if (wt.detached) { <span class="badge det">detached</span> }
                  @if (wt.locked) { <span class="badge lock">locked</span> }
                  @if (state === 'merged-main') { <span class="badge m-main">merged → main</span> }
                  @if (state === 'merged-test') { <span class="badge m-test">merged → test</span> }
                  @if (state === 'stale') { <span class="badge stale" [matTooltip]="staleTip(wt)">stale</span> }
                </div>
                <div class="wt-sha mono">{{ (wt.head ?? '').slice(0, 10) || '—' }}</div>
                <div class="wt-path mono" [matTooltip]="wt.path">{{ shortPath(wt.path) }}</div>
              </button>
              <!-- Open a live tmux terminal session rooted in this worktree, named after
                   it, then jump to the Terminal page attached to it. The fresh session is
                   seeded with a claude command that spins up its own worktree. -->
              <button mat-button class="wt-open" (click)="openSession(wt)"
                      [disabled]="opening() === wt.path"
                      [matTooltip]="'Open a terminal session named ' + sessionNameFor(wt) + ' in this worktree and launch claude to create/work in it'">
                <mat-icon>terminal</mat-icon>
                <span>{{ opening() === wt.path ? 'Opening…' : 'Open session' }}</span>
              </button>
            </div>
          }
        </div>
      }

      <!-- Commit history, scoped to the selected worktree's branch (or all) -->
      <div class="section-label hist">
        <span>History</span>
        <span class="scope">· {{ selectedLabel() }}</span>
        <span class="spacer"></span>
        @if (selectedRef()) {
          <button mat-button class="clear" (click)="selectAll()">
            <mat-icon>clear</mat-icon> Current branch
          </button>
        }
      </div>

      @if (loading()) {
        <div class="msg sub">Loading history…</div>
      } @else if (!commits().length) {
        <div class="msg sub">No commits.</div>
      } @else {
        <div class="log">
          @for (c of commits(); track c.hash; let last = $last) {
            <div class="commit">
              <div class="rail" [class.last]="last"><span class="dot"></span></div>
              <div class="c-body">
                <div class="c-top">
                  <span class="c-subject">{{ c.subject }}</span>
                  @for (r of c.refs; track r) {
                    <span class="ref" [class.head]="isHead(r)" [class.tag]="isTag(r)">{{ cleanRef(r) }}</span>
                  }
                </div>
                <div class="c-meta">
                  <span class="mono hash">{{ c.short }}</span>
                  <span class="sep">·</span>
                  <span class="author">{{ c.author }}</span>
                  <span class="sep">·</span>
                  <span class="when" [matTooltip]="fullDate(c.date)">{{ rel(c.date) }}</span>
                </div>
              </div>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .git-root { display: flex; flex-direction: column; height: 100%; background: #fbfbfd; overflow-y: auto; }
    .git-toolbar { position: sticky; top: 0; z-index: 2; display: flex; align-items: center; gap: 8px;
                   padding: 4px 10px; background: #fbfbfd; border-bottom: 1px solid #e6e6e6; font-size: 13px; }
    .t-icon { color: #5c6bc0; font-size: 20px; width: 20px; height: 20px; }
    .git-toolbar .title { font-weight: 600; color: #333; }
    .git-toolbar .count { color: #999; font-size: 12px; }
    .spacer { flex: 1; }
    .sm { width: 30px; height: 30px; line-height: 30px; } .sm mat-icon { font-size: 18px; width: 18px; height: 18px; }
    .msg { padding: 20px; color: #999; text-align: center; } .msg.err { color: #c62828; } .msg.sub { padding: 14px; }
    .mono { font-family: monospace; }

    .section-label { display: flex; align-items: center; gap: 6px; padding: 12px 12px 4px;
                     font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: #90a4ae; }
    .section-label.hist { position: sticky; top: 32px; background: #fbfbfd; z-index: 1; }
    .section-label .scope { color: #5c6bc0; text-transform: none; letter-spacing: 0; font-weight: 600; }
    .clear { font-size: 12px; min-width: 0; color: #5c6bc0; }
    .clear mat-icon { font-size: 16px; width: 16px; height: 16px; margin-right: 2px; }

    .wt-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 8px; padding: 4px 12px 8px; }
    .wt-cell { display: flex; flex-direction: column; gap: 4px; }
    .wt-card { text-align: left; background: white; border: 1px solid #dcdfe4; border-radius: 8px; padding: 10px;
               cursor: pointer; font: inherit; box-shadow: 0 1px 3px rgba(0,0,0,0.06); transition: border-color .12s, box-shadow .12s; }
    .wt-open { align-self: stretch; font-size: 12px; min-height: 30px; color: #5c6bc0; }
    .wt-open mat-icon { font-size: 16px; width: 16px; height: 16px; margin-right: 4px; }
    .wt-open[disabled] { color: #b0bec5; }
    .wt-card:hover { border-color: #9fa8da; }
    .wt-card.selected { border-color: #5c6bc0; box-shadow: 0 0 0 1px #5c6bc0; }
    .wt-top { display: flex; align-items: center; gap: 6px; }
    .wt-icon { font-size: 18px; width: 18px; height: 18px; color: #5c6bc0; flex-shrink: 0; }
    .wt-branch { font-weight: 600; font-size: 13px; color: #222; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .wt-badges { display: flex; flex-wrap: wrap; gap: 4px; margin: 4px 0; min-height: 4px; }
    .badge { font-size: 9px; text-transform: uppercase; letter-spacing: 0.04em; padding: 1px 6px; border-radius: 8px; font-weight: 700; }
    .badge.main { background: #e8f5e9; color: #2e7d32; }
    .badge.det { background: #fff3e0; color: #ef6c00; }
    .badge.lock { background: #eceff1; color: #607d8b; }
    .badge.m-main { background: #ffebee; color: #c62828; }
    .badge.m-test { background: #fff8e1; color: #f9a825; }
    .badge.stale { background: #f3e5f5; color: #8e24aa; }

    /* Lifecycle colour coding: merged→main (red), merged→test (yellow), stale (violet).
       A left accent bar + faint tint keeps the card readable while signalling state. */
    .wt-card[data-state="merged-main"] { border-left: 4px solid #e53935; background: #fdf4f4; }
    .wt-card[data-state="merged-main"]:hover { border-color: #ef9a9a; }
    .wt-card[data-state="merged-test"] { border-left: 4px solid #f9a825; background: #fffdf3; }
    .wt-card[data-state="merged-test"]:hover { border-color: #ffe082; }
    .wt-card[data-state="stale"] { border-left: 4px solid #8e24aa; background: #faf4fc; }
    .wt-card[data-state="stale"]:hover { border-color: #ce93d8; }
    .wt-sha { font-size: 11px; color: #78909c; }
    .wt-path { font-size: 11px; color: #b0bec5; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

    .log { padding: 2px 12px 16px; }
    .commit { display: flex; gap: 10px; }
    .rail { position: relative; width: 12px; flex-shrink: 0; }
    .rail::before { content: ''; position: absolute; left: 5px; top: 0; bottom: 0; width: 2px; background: #e0e0e0; }
    .rail.last::before { bottom: auto; height: 14px; }
    .dot { position: absolute; left: 1px; top: 8px; width: 10px; height: 10px; border-radius: 50%;
           background: #5c6bc0; border: 2px solid #fbfbfd; box-shadow: 0 0 0 1px #c5cae9; }
    .c-body { flex: 1; min-width: 0; padding: 4px 0 12px; border-bottom: 1px solid #f0f0f0; }
    .commit:last-child .c-body { border-bottom: none; }
    .c-top { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px; }
    .c-subject { font-size: 13px; color: #222; font-weight: 500; }
    .ref { font-size: 10px; font-family: monospace; padding: 1px 6px; border-radius: 8px; background: #eceff1; color: #546e7a; white-space: nowrap; }
    .ref.head { background: #e8eaf6; color: #3949ab; font-weight: 700; }
    .ref.tag { background: #fff8e1; color: #f9a825; }
    .c-meta { font-size: 11px; color: #90a4ae; margin-top: 3px; display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
    .c-meta .hash { color: #78909c; } .c-meta .author { color: #607d8b; } .c-meta .sep { color: #cfd8dc; }
  `],
})
export class GitHistoryComponent implements OnInit {
  private file = inject(FileService);
  private workspace = inject(WorkspaceService);

  worktrees = signal<GitWorktree[]>([]);
  commits = signal<GitCommit[]>([]);
  selectedRef = signal<string>('');       // '' → current branch (repo HEAD)
  selectedLabel = signal<string>('current branch');
  loading = signal<boolean>(false);
  error = signal<string | null>(null);
  opening = signal<string>('');           // path of the worktree whose session is opening

  ngOnInit(): void { this.refresh(); }

  refresh(): void {
    this.loading.set(true);
    forkJoin({
      worktrees: this.file.getGitWorktrees(),
      commits: this.file.getGitLog(this.selectedRef() || undefined),
    }).subscribe({
      next: ({ worktrees, commits }) => {
        this.worktrees.set(worktrees);
        this.commits.set(commits);
        this.error.set(null);
        this.loading.set(false);
      },
      error: err => { this.error.set(errMsg(err)); this.loading.set(false); },
    });
  }

  private loadLog(): void {
    this.loading.set(true);
    this.file.getGitLog(this.selectedRef() || undefined).subscribe({
      next: commits => { this.commits.set(commits); this.error.set(null); this.loading.set(false); },
      error: err => { this.error.set(errMsg(err)); this.loading.set(false); },
    });
  }

  // A worktree is "stale" once its HEAD hasn't moved for over a week.
  private static readonly STALE_MS = 7 * 24 * 60 * 60 * 1000;

  // Lifecycle state driving the card colour. Merged states outrank staleness (a
  // merged tree is the more actionable signal), and main beats test.
  stateOf(wt: GitWorktree): 'merged-main' | 'merged-test' | 'stale' | '' {
    if (wt.mergedToMain) return 'merged-main';
    if (wt.mergedToTest) return 'merged-test';
    if (wt.lastCommitMs != null && Date.now() - wt.lastCommitMs > GitHistoryComponent.STALE_MS) return 'stale';
    return '';
  }

  staleTip(wt: GitWorktree): string {
    return wt.lastCommitMs != null ? `Last commit ${relativeTime(wt.lastCommitMs)}` : 'No recent activity';
  }

  // The ref to log for a worktree: its branch, or its detached HEAD sha.
  refFor(wt: GitWorktree): string { return wt.branch ?? wt.head ?? ''; }

  selectWorktree(wt: GitWorktree): void {
    const ref = this.refFor(wt);
    if (!ref) return;
    this.selectedRef.set(ref);
    this.selectedLabel.set(wt.branch ?? `${(wt.head ?? '').slice(0, 10)} (detached)`);
    this.loadLog();
  }

  selectAll(): void {
    this.selectedRef.set('');
    this.selectedLabel.set('current branch');
    this.loadLog();
  }

  // The tmux session name a worktree's "Open session" action will use — its checked-out
  // branch, or (when detached) its directory name — tmux-safe (mirrors the server's
  // worktreeSessionName). Shown in the tooltip.
  sessionNameFor(wt: GitWorktree): string {
    const raw = wt.branch ?? ((wt.path || '').split(/[\\/]/).filter(Boolean).pop() || '');
    return raw.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^[-._]+/, '').slice(0, 60).replace(/[-._]+$/g, '');
  }

  // Ask the server to open (or reuse) a shell session rooted in this worktree, then hand
  // off to the Terminal page attached to it. One in-flight open at a time (opening()).
  openSession(wt: GitWorktree): void {
    if (this.opening()) return;
    this.opening.set(wt.path);
    this.file.openWorktreeSession(wt.path).subscribe({
      next: ({ session }) => {
        this.opening.set('');
        this.error.set(null);
        this.workspace.openTerminal(session);
      },
      error: err => { this.opening.set(''); this.error.set(errMsg(err)); },
    });
  }

  isHead(ref: string): boolean { return ref.includes('HEAD'); }
  isTag(ref: string): boolean { return ref.startsWith('tag:'); }
  cleanRef(ref: string): string { return ref.replace(/^HEAD -> /, '').replace(/^tag: /, ''); }
  shortPath(p: string): string { const parts = p.split(/[\\/]/).filter(Boolean); return parts.slice(-2).join('/'); }
  fullDate(ms: number): string { return new Date(ms).toLocaleString(); }
  rel(ms: number): string { return relativeTime(ms); }
}

function errMsg(err: unknown): string {
  const e = err as { error?: { error?: string }; message?: string };
  return e?.error?.error ?? e?.message ?? 'Cannot reach server';
}

// Compact "3d ago" style relative time.
function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 0) return 'just now';
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}
