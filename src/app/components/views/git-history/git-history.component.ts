import { Component, OnInit, OnDestroy, computed, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { forkJoin } from 'rxjs';
import { FileService } from '../../../services/file.service';
import { GitCommit, GitWorktree } from '../../../models/git.model';
import { AppInstance } from '../../../models/instance.model';

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
      @if (notice(); as n) { <div class="msg ok">{{ n }}</div> }

      <!-- Merge bar: merge one worktree's branch into another -->
      @if (mergeableBranches().length > 1) {
        <div class="merge-bar">
          <mat-icon class="m-icon">merge_type</mat-icon>
          <span class="m-label">Merge</span>
          <select class="m-select" [value]="mergeFrom()" (change)="mergeFrom.set($any($event.target).value)">
            <option value="" disabled>from…</option>
            @for (b of mergeableBranches(); track b) { <option [value]="b">{{ b }}</option> }
          </select>
          <mat-icon class="m-arrow">arrow_forward</mat-icon>
          <select class="m-select" [value]="mergeInto()" (change)="mergeInto.set($any($event.target).value)">
            <option value="" disabled>into…</option>
            @for (b of mergeableBranches(); track b) { <option [value]="b">{{ b }}</option> }
          </select>
          <button mat-button class="m-go" [disabled]="!canMerge() || busy()" (click)="doMerge()">
            <mat-icon>merge</mat-icon> Merge
          </button>
        </div>
      }

      <!-- Worktree overview: one card per checkout, grouped side by side -->
      <div class="section-label">Worktrees</div>
      @if (!worktrees().length) {
        <div class="msg sub">No worktrees found.</div>
      } @else {
        <div class="wt-grid">
          @for (wt of worktrees(); track wt.path) {
            @let state = stateOf(wt);
            @let inst = instanceOf(wt);
            @let live = !!inst?.running;
            <div class="wt-card" [attr.data-state]="state" [class.running]="live"
                 [class.selected]="selectedRef() === refFor(wt)"
                 role="button" tabindex="0" (click)="selectWorktree(wt)" (keydown.enter)="selectWorktree(wt)">
              <div class="wt-top">
                <mat-icon class="wt-icon">{{ wt.main ? 'home' : (wt.detached ? 'link_off' : 'account_tree') }}</mat-icon>
                <span class="wt-branch">{{ wt.branch ?? (wt.detached ? 'detached HEAD' : '—') }}</span>
                <span class="run-dot" [class.on]="live"
                      [matTooltip]="live ? 'Instance running on :' + inst!.webPort : (inst ? 'Instance stopped' : 'No instance')"></span>
                @if (!isProtected(wt)) {
                  <button mat-icon-button class="wt-del" matTooltip="Remove worktree" [disabled]="busy()"
                          (click)="$event.stopPropagation(); removeWorktree(wt)">
                    <mat-icon>delete_outline</mat-icon>
                  </button>
                }
              </div>
              <div class="wt-badges">
                @if (wt.main) { <span class="badge main">main tree</span> }
                @if (wt.detached) { <span class="badge det">detached</span> }
                @if (wt.locked) { <span class="badge lock">locked</span> }
                @if (live) { <span class="badge run">running :{{ inst!.webPort }}</span> }
                @if (state === 'merged-main') { <span class="badge m-main">merged → main</span> }
                @if (state === 'merged-test') { <span class="badge m-test">merged → test</span> }
                @if (state === 'stale') { <span class="badge stale" [matTooltip]="staleTip(wt)">stale</span> }
              </div>
              <div class="wt-sha mono">{{ (wt.head ?? '').slice(0, 10) || '—' }}</div>
              <div class="wt-path mono" [matTooltip]="wt.path">{{ shortPath(wt.path) }}</div>

              <!-- Run the worktree as its own app instance (next-free port pair via dev-remote) -->
              <div class="wt-run" (click)="$event.stopPropagation()">
                @if (live) {
                  <a mat-button class="run-act open" [href]="webUrl(inst!)" target="_blank" rel="noopener"
                     matTooltip="Open web :{{ inst!.webPort }} · api :{{ inst!.apiPort }}">
                    <mat-icon>open_in_new</mat-icon> Open
                  </a>
                  <button mat-button class="run-act stop" [disabled]="instBusy() === nameOf(wt)"
                          (click)="stopInstance(wt)">
                    <mat-icon>stop_circle</mat-icon> Stop
                  </button>
                } @else {
                  <button mat-button class="run-act start" [disabled]="instBusy() === nameOf(wt)"
                          (click)="startInstance(wt)">
                    <mat-icon>play_circle</mat-icon> Start
                  </button>
                }
              </div>
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
                  <span class="spacer"></span>
                  @if (canDrop()) {
                    <button mat-icon-button class="c-drop" matTooltip="Drop this commit from {{ selectedLabel() }}"
                            [disabled]="busy()" (click)="dropCommit(c)">
                      <mat-icon>delete_sweep</mat-icon>
                    </button>
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
    .msg.ok { color: #2e7d32; background: #f1f8f2; }
    .mono { font-family: monospace; }

    .merge-bar { display: flex; align-items: center; gap: 8px; padding: 8px 12px; margin: 6px 12px 0;
                 background: #f4f6ff; border: 1px solid #e0e5ff; border-radius: 8px; font-size: 12px; }
    .merge-bar .m-icon { color: #5c6bc0; font-size: 18px; width: 18px; height: 18px; }
    .merge-bar .m-label { font-weight: 600; color: #444; }
    .merge-bar .m-arrow { color: #9fa8da; font-size: 16px; width: 16px; height: 16px; }
    .m-select { font: inherit; font-size: 12px; padding: 3px 6px; border: 1px solid #c5cae9; border-radius: 6px;
                background: white; color: #333; max-width: 200px; }
    .m-go { font-size: 12px; min-width: 0; color: #fff; background: #5c6bc0; border-radius: 6px; padding: 0 10px; }
    .m-go[disabled] { background: #c5cae9; color: #fff; }
    .m-go mat-icon { font-size: 16px; width: 16px; height: 16px; margin-right: 2px; }
    .wt-del { width: 26px; height: 26px; line-height: 26px; margin-left: auto; color: #b0777c; flex-shrink: 0; }
    .wt-del mat-icon { font-size: 17px; width: 17px; height: 17px; }
    .wt-del:hover { color: #c62828; }
    .c-drop { width: 24px; height: 24px; line-height: 24px; color: #c0a0a0; flex-shrink: 0; }
    .c-drop mat-icon { font-size: 16px; width: 16px; height: 16px; }
    .c-drop:hover { color: #c62828; }

    .section-label { display: flex; align-items: center; gap: 6px; padding: 12px 12px 4px;
                     font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: #90a4ae; }
    .section-label.hist { position: sticky; top: 32px; background: #fbfbfd; z-index: 1; }
    .section-label .scope { color: #5c6bc0; text-transform: none; letter-spacing: 0; font-weight: 600; }
    .clear { font-size: 12px; min-width: 0; color: #5c6bc0; }
    .clear mat-icon { font-size: 16px; width: 16px; height: 16px; margin-right: 2px; }

    .wt-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 8px; padding: 4px 12px 8px; }
    .wt-card { text-align: left; background: white; border: 1px solid #dcdfe4; border-radius: 8px; padding: 10px;
               cursor: pointer; font: inherit; box-shadow: 0 1px 3px rgba(0,0,0,0.06); transition: border-color .12s, box-shadow .12s; }
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
    .badge.run { background: #e8f5e9; color: #2e7d32; }

    /* Running-instance indicator: a green dot in the card header + a green accent
       ring so a live worktree is obvious among the merged/stale colour coding. */
    .run-dot { width: 8px; height: 8px; border-radius: 50%; background: #cfd8dc; flex-shrink: 0; margin-left: auto; }
    .run-dot.on { background: #43a047; box-shadow: 0 0 0 3px rgba(67,160,71,0.18); }
    .wt-top:has(.wt-del) .run-dot { margin-left: auto; }
    .wt-card.running { box-shadow: 0 0 0 1px #a5d6a7, 0 1px 3px rgba(0,0,0,0.06); }

    .wt-run { display: flex; align-items: center; gap: 4px; margin-top: 6px; }
    .run-act { font-size: 12px; min-width: 0; line-height: 28px; padding: 0 8px; }
    .run-act mat-icon { font-size: 16px; width: 16px; height: 16px; margin-right: 2px; }
    .run-act.start { color: #2e7d32; }
    .run-act.stop { color: #c62828; }
    .run-act.open { color: #5c6bc0; }

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
export class GitHistoryComponent implements OnInit, OnDestroy {
  private file = inject(FileService);

  worktrees = signal<GitWorktree[]>([]);
  commits = signal<GitCommit[]>([]);
  instances = signal<AppInstance[]>([]);  // running (or once-running) worktree app instances
  selectedRef = signal<string>('');       // '' → current branch (repo HEAD)
  selectedLabel = signal<string>('current branch');
  loading = signal<boolean>(false);
  error = signal<string | null>(null);
  notice = signal<string | null>(null);   // transient success message
  busy = signal<boolean>(false);          // a mutating action is in flight
  instBusy = signal<string | null>(null); // worktree name whose instance is starting/stopping

  // Instances keyed by the dev-remote worktree token, so each card can find its own.
  private instanceByName = computed(() => new Map(this.instances().map(i => [i.worktree, i])));
  private poll?: ReturnType<typeof setInterval>;

  // Merge bar state: pick a source and target branch (both must be checked out).
  mergeFrom = signal<string>('');
  mergeInto = signal<string>('');

  // Branches that are checked out in a worktree — the candidates for a merge.
  mergeableBranches = computed(() =>
    this.worktrees().map(w => w.branch).filter((b): b is string => !!b));
  canMerge = computed(() => {
    const f = this.mergeFrom(), i = this.mergeInto();
    return !!f && !!i && f !== i;
  });
  // Dropping a commit rewrites the branch's history, so it's only offered when the
  // log is scoped to a real (checked-out, non-protected) branch — not "current
  // branch" or a detached HEAD.
  canDrop = computed(() => {
    const ref = this.selectedRef();
    if (!ref || isProtectedBranch(ref)) return false;
    return this.worktrees().some(w => w.branch === ref);
  });

  ngOnInit(): void {
    this.refresh();
    // Keep instance liveness/ports fresh while the page is open (a start settles
    // asynchronously — the dev server takes a moment to bind its port).
    this.poll = setInterval(() => this.reloadInstances(), 5000);
  }

  ngOnDestroy(): void { if (this.poll) clearInterval(this.poll); }

  refresh(): void {
    this.loading.set(true);
    forkJoin({
      worktrees: this.file.getGitWorktrees(),
      commits: this.file.getGitLog(this.selectedRef() || undefined),
      instances: this.file.getInstances(),
    }).subscribe({
      next: ({ worktrees, commits, instances }) => {
        this.worktrees.set(worktrees);
        this.commits.set(commits);
        this.instances.set(instances);
        this.error.set(null);
        this.loading.set(false);
      },
      error: err => { this.error.set(errMsg(err)); this.loading.set(false); },
    });
  }

  private reloadInstances(): void {
    this.file.getInstances().subscribe({
      next: instances => this.instances.set(instances),
      error: () => { /* keep the last good list; the toolbar refresh can retry */ },
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

  // The main and test worktrees are never removable (mirrors the server guard).
  isProtected(wt: GitWorktree): boolean {
    const base = wt.path.replace(/[\\/]+$/, '').split(/[\\/]/).pop();
    return !!wt.main || isProtectedBranch(wt.branch ?? '') || base === 'test';
  }

  // ── Mutating actions ──
  private flash(msg: string): void {
    this.notice.set(msg);
    this.error.set(null);
    setTimeout(() => this.notice.set(null), 6000);
  }

  removeWorktree(wt: GitWorktree, force = false): void {
    if (this.isProtected(wt)) return;
    const label = wt.branch ?? this.shortPath(wt.path);
    if (!force && !confirm(`Remove the worktree for "${label}"?\n\n${wt.path}\n\nThe branch itself is kept.`)) return;
    this.busy.set(true);
    this.file.removeGitWorktree(wt.path, force).subscribe({
      next: () => { this.busy.set(false); this.flash(`Removed worktree ${label}.`); this.refresh(); },
      error: err => {
        this.busy.set(false);
        // Server flags "needs force" when the tree has uncommitted/untracked changes.
        if (err?.error?.needsForce && confirm(
          `That worktree has uncommitted or untracked changes.\n\n${err.error.error}\n\nForce-remove it anyway?`)) {
          this.removeWorktree(wt, true);
        } else {
          this.error.set(errMsg(err));
        }
      },
    });
  }

  dropCommit(c: GitCommit): void {
    const branch = this.selectedRef();
    if (!branch || !this.canDrop()) return;
    if (!confirm(`Drop this commit from "${branch}"?\n\n${c.short}  ${c.subject}\n\n`
      + `This rewrites the branch's history and cannot be easily undone.`)) return;
    this.busy.set(true);
    this.file.dropGitCommit(branch, c.hash).subscribe({
      next: r => { this.busy.set(false); this.flash(`Dropped ${c.short} from ${branch}. New head ${r.head.slice(0, 10)}.`); this.refresh(); },
      error: err => { this.busy.set(false); this.error.set(errMsg(err)); },
    });
  }

  doMerge(): void {
    const from = this.mergeFrom(), into = this.mergeInto();
    if (!this.canMerge()) return;
    if (!confirm(`Merge "${from}" into "${into}"?`)) return;
    this.busy.set(true);
    this.file.mergeGitBranch(from, into).subscribe({
      next: () => {
        this.busy.set(false);
        this.flash(`Merged ${from} into ${into}.`);
        this.mergeFrom.set(''); this.mergeInto.set('');
        this.refresh();
      },
      error: err => { this.busy.set(false); this.error.set(errMsg(err)); },
    });
  }

  // ── Worktree instances (start/stop the worktree as its own running app) ──
  // dev-remote's worktree token: the primary checkout is 'main', linked worktrees
  // are their directory basename (they live under .claude/worktrees/<name>).
  nameOf(wt: GitWorktree): string {
    if (wt.main) return 'main';
    return wt.path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || wt.path;
  }

  instanceOf(wt: GitWorktree): AppInstance | null {
    return this.instanceByName().get(this.nameOf(wt)) ?? null;
  }

  // The URL to open a running instance: this page's host, the instance's web port.
  webUrl(inst: AppInstance): string {
    const host = typeof window !== 'undefined' && window.location?.hostname ? window.location.hostname : 'localhost';
    const proto = typeof window !== 'undefined' && window.location?.protocol === 'https:' ? 'https' : 'http';
    return `${proto}://${host}:${inst.webPort}`;
  }

  startInstance(wt: GitWorktree): void {
    const name = this.nameOf(wt);
    this.instBusy.set(name);
    this.file.startInstance(name).subscribe({
      next: res => {
        this.instBusy.set(null);
        if (res.instance) this.flash(`Started ${name} on web :${res.instance.webPort} (api :${res.instance.apiPort}).`);
        else this.error.set((res.stdout || res.stderr || 'Start failed.').trim());
        this.reloadInstances();
      },
      error: err => { this.instBusy.set(null); this.error.set(errMsg(err)); },
    });
  }

  stopInstance(wt: GitWorktree): void {
    const name = this.nameOf(wt);
    this.instBusy.set(name);
    this.file.stopInstance(name).subscribe({
      next: () => { this.instBusy.set(null); this.flash(`Stopped ${name}.`); this.reloadInstances(); },
      error: err => { this.instBusy.set(null); this.error.set(errMsg(err)); },
    });
  }

  isHead(ref: string): boolean { return ref.includes('HEAD'); }
  isTag(ref: string): boolean { return ref.startsWith('tag:'); }
  cleanRef(ref: string): string { return ref.replace(/^HEAD -> /, '').replace(/^tag: /, ''); }
  shortPath(p: string): string { const parts = p.split(/[\\/]/).filter(Boolean); return parts.slice(-2).join('/'); }
  fullDate(ms: number): string { return new Date(ms).toLocaleString(); }
  rel(ms: number): string { return relativeTime(ms); }
}

// The main and test branches are off-limits to history rewrites and worktree
// removal — mirrors the server's FIXED RULE guard (see CLAUDE.md).
function isProtectedBranch(branch: string): boolean {
  return branch === 'main' || branch === 'test';
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
