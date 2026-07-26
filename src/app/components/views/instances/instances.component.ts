import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { forkJoin } from 'rxjs';
import { FileService } from '../../../services/file.service';
import { GitWorktree } from '../../../models/git.model';
import { AppInstance } from '../../../models/instance.model';

// Control panel for running app instances. Every git worktree can be booted as its
// own Express API + Angular dev server on its own port pair via the ~/dev-remote
// helper. This page (itself the base `test` instance on 4201) lists the worktrees,
// shows which are live and on which port, and lets you start/stop each and jump to
// its running UI. Ports are auto-allocated by the helper (next free pair from 4201),
// so the first launch after the base lands on 4202, the next on 4203, and so on.
type Row = { wt: GitWorktree; name: string; instance: AppInstance | null };

@Component({
  selector: 'app-instances',
  standalone: true,
  imports: [MatIconModule, MatButtonModule, MatTooltipModule],
  template: `
    <div class="inst-root">
      <div class="inst-toolbar">
        <mat-icon class="t-icon">dns</mat-icon>
        <span class="title">Instances</span>
        <span class="count">{{ runningCount() }} running · {{ rows().length }} worktrees</span>
        <span class="spacer"></span>
        <button mat-icon-button class="sm" matTooltip="Refresh" (click)="refresh()"><mat-icon>refresh</mat-icon></button>
      </div>

      @if (error(); as e) { <div class="msg err">{{ e }}</div> }
      @if (notice(); as n) { <div class="msg note">{{ n }}</div> }

      @if (loading() && !rows().length) {
        <div class="msg sub">Loading worktrees…</div>
      } @else if (!rows().length) {
        <div class="msg sub">No worktrees found.</div>
      } @else {
        <div class="inst-grid">
          @for (row of rows(); track row.name) {
            @let inst = row.instance;
            @let live = !!inst?.running;
            <div class="inst-card" [class.running]="live" [class.busy]="busy() === row.name">
              <div class="c-top">
                <mat-icon class="c-icon">{{ row.wt.main ? 'home' : 'account_tree' }}</mat-icon>
                <span class="c-name">{{ row.name }}</span>
                <span class="dot" [class.on]="live" [class.stale]="inst && !inst.running"
                      [matTooltip]="live ? 'Running' : (inst ? 'Stale record — process gone' : 'Stopped')"></span>
              </div>

              <div class="c-branch mono" [matTooltip]="row.wt.path">
                {{ row.wt.branch ?? (row.wt.detached ? 'detached HEAD' : '—') }}
              </div>

              @if (inst && inst.webPort) {
                <div class="c-ports">
                  <span class="port">web :{{ inst.webPort }}</span>
                  <span class="port api">api :{{ inst.apiPort }}</span>
                </div>
              } @else {
                <div class="c-ports muted">not started</div>
              }

              <div class="c-actions">
                @if (live) {
                  <a mat-button class="act open" [href]="webUrl(inst!)" target="_blank" rel="noopener">
                    <mat-icon>open_in_new</mat-icon> Open
                  </a>
                  <button mat-button class="act stop" [disabled]="busy() === row.name" (click)="stop(row)">
                    <mat-icon>stop_circle</mat-icon> Stop
                  </button>
                } @else {
                  <button mat-button class="act start" [disabled]="busy() === row.name" (click)="start(row)">
                    <mat-icon>play_circle</mat-icon> Start
                  </button>
                }
              </div>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .inst-root { display: flex; flex-direction: column; height: 100%; background: #fbfbfd; overflow-y: auto; }
    .inst-toolbar { position: sticky; top: 0; z-index: 2; display: flex; align-items: center; gap: 8px;
                    padding: 4px 10px; background: #fbfbfd; border-bottom: 1px solid #e6e6e6; font-size: 13px; }
    .t-icon { color: #5c6bc0; font-size: 20px; width: 20px; height: 20px; }
    .inst-toolbar .title { font-weight: 600; color: #333; }
    .inst-toolbar .count { color: #999; font-size: 12px; }
    .spacer { flex: 1; }
    .sm { width: 30px; height: 30px; line-height: 30px; } .sm mat-icon { font-size: 18px; width: 18px; height: 18px; }
    .msg { padding: 14px 20px; color: #999; text-align: center; font-size: 13px; }
    .msg.err { color: #c62828; } .msg.note { color: #2e7d32; } .msg.sub { color: #999; }
    .mono { font-family: monospace; }

    .inst-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 10px; padding: 12px; }
    .inst-card { display: flex; flex-direction: column; gap: 6px; background: white; border: 1px solid #dcdfe4;
                 border-radius: 8px; padding: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.06);
                 transition: border-color .12s, box-shadow .12s; }
    .inst-card.running { border-left: 4px solid #43a047; background: #f6fbf6; }
    .inst-card.busy { opacity: 0.6; pointer-events: none; }

    .c-top { display: flex; align-items: center; gap: 6px; }
    .c-icon { font-size: 18px; width: 18px; height: 18px; color: #5c6bc0; flex-shrink: 0; }
    .c-name { font-weight: 600; font-size: 14px; color: #222; overflow: hidden; text-overflow: ellipsis;
              white-space: nowrap; flex: 1; }
    .dot { width: 9px; height: 9px; border-radius: 50%; background: #cfd8dc; flex-shrink: 0; }
    .dot.on { background: #43a047; box-shadow: 0 0 0 3px rgba(67,160,71,0.18); }
    .dot.stale { background: #ffb300; }

    .c-branch { font-size: 11px; color: #78909c; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .c-ports { display: flex; gap: 6px; font-family: monospace; font-size: 11px; }
    .c-ports .port { background: #e8f5e9; color: #2e7d32; border-radius: 6px; padding: 1px 6px; }
    .c-ports .port.api { background: #e8eaf6; color: #3949ab; }
    .c-ports.muted { color: #b0bec5; }

    .c-actions { display: flex; gap: 4px; margin-top: 2px; }
    .act { font-size: 12px; min-width: 0; line-height: 30px; }
    .act mat-icon { font-size: 16px; width: 16px; height: 16px; margin-right: 2px; }
    .act.start { color: #2e7d32; }
    .act.stop { color: #c62828; }
    .act.open { color: #5c6bc0; }
  `],
})
export class InstancesComponent implements OnInit, OnDestroy {
  private file = inject(FileService);

  private worktrees = signal<GitWorktree[]>([]);
  private instances = signal<AppInstance[]>([]);
  loading = signal<boolean>(false);
  error = signal<string | null>(null);
  notice = signal<string | null>(null);
  busy = signal<string | null>(null);      // name of the worktree mid start/stop

  // Join each worktree to its instance record (matched by worktree token), then
  // surface any instance whose worktree is no longer listed (e.g. removed) so a live
  // process is never hidden. The base tree reports as 'main' to dev-remote.
  rows = computed<Row[]>(() => {
    const byName = new Map(this.instances().map(i => [i.worktree, i]));
    const rows: Row[] = this.worktrees().map(wt => {
      const name = this.nameOf(wt);
      return { wt, name, instance: byName.get(name) ?? null };
    });
    const known = new Set(rows.map(r => r.name));
    for (const inst of this.instances()) {
      if (!known.has(inst.worktree)) {
        rows.push({ wt: { path: inst.dir ?? '', head: null, branch: null, detached: false,
                          bare: false, locked: false }, name: inst.worktree, instance: inst });
      }
    }
    return rows;
  });

  runningCount = computed(() => this.instances().filter(i => i.running).length);

  private poll?: ReturnType<typeof setInterval>;

  ngOnInit(): void {
    this.refresh();
    // Keep liveness/ports fresh while the page is open (starts settle asynchronously).
    this.poll = setInterval(() => this.reloadInstances(), 5000);
  }

  ngOnDestroy(): void { if (this.poll) clearInterval(this.poll); }

  refresh(): void {
    this.loading.set(true);
    forkJoin({ worktrees: this.file.getGitWorktrees(), instances: this.file.getInstances() })
      .subscribe({
        next: ({ worktrees, instances }) => {
          this.worktrees.set(worktrees);
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

  start(row: Row): void {
    this.busy.set(row.name);
    this.notice.set(null);
    this.file.startInstance(row.name).subscribe({
      next: res => {
        this.busy.set(null);
        if (res.instance) {
          this.notice.set(`Started ${row.name} on web :${res.instance.webPort} (api :${res.instance.apiPort}).`);
        } else {
          this.error.set((res.stdout || res.stderr || 'Start failed.').trim());
        }
        this.reloadInstances();
      },
      error: err => { this.busy.set(null); this.error.set(errMsg(err)); },
    });
  }

  stop(row: Row): void {
    this.busy.set(row.name);
    this.notice.set(null);
    this.file.stopInstance(row.name).subscribe({
      next: () => { this.busy.set(null); this.notice.set(`Stopped ${row.name}.`); this.reloadInstances(); },
      error: err => { this.busy.set(null); this.error.set(errMsg(err)); },
    });
  }

  // The URL to open a running instance: same host as this page, the instance's web
  // port. Mirrors FileService's host derivation so it works over Tailscale too.
  webUrl(inst: AppInstance): string {
    const host = typeof window !== 'undefined' && window.location?.hostname ? window.location.hostname : 'localhost';
    const proto = typeof window !== 'undefined' && window.location?.protocol === 'https:' ? 'https' : 'http';
    return `${proto}://${host}:${inst.webPort}`;
  }

  // dev-remote's worktree token: the primary checkout is 'main', linked worktrees are
  // their directory basename (that's how they live under .claude/worktrees/<name>).
  private nameOf(wt: GitWorktree): string {
    if (wt.main) return 'main';
    const parts = wt.path.split(/[\\/]/).filter(Boolean);
    return parts[parts.length - 1] ?? wt.path;
  }
}

function errMsg(err: unknown): string {
  const e = err as { error?: { error?: string }; message?: string };
  return e?.error?.error ?? e?.message ?? 'Cannot reach server';
}
