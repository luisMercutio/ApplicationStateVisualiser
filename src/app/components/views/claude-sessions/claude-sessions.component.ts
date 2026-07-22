import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Store } from '@ngrx/store';
import { Subscription, timer } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { FileService } from '../../../services/file.service';
import { ClaudeSession, AppBusinessRule } from '../../../models/app-data.model';
import { selectAppRules } from '../../../store/app-data/app-data.selectors';
import { ClaudeConversationDialogComponent } from './claude-conversation-dialog.component';
import { WorkspaceService } from '../../../services/workspace.service';

// Mirror server.js brSlug so a rule name maps deterministically to its tmux
// session (`claude-<slug>`) and branch (`claude/<slug>`). This is how the page
// joins live sessions back to the Business Rule that spawned them — no extra
// bookkeeping needed.
function brSlug(name: string): string {
  return String(name || '').trim().toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[-._]+|[-._]+$/g, '')
    .slice(0, 60)
    .replace(/[-._]+$/g, '');
}

interface Row {
  session: string;       // tmux session name
  brName: string | null; // the BR that spawned it, when identifiable
  branch: string;        // claude/<slug>
  running: boolean;      // live in tmux right now
  hasTranscript: boolean;// an archived conversation exists → viewable
}

// Lists the Claude sessions spawned by "Submit with Claude": each is a claude CLI
// running in a per-BR git worktree. Running state is polled from the server (tmux);
// BRs flagged needs-establishing whose session isn't live show as dead. Attach opens
// the live session on the Terminal page; running sessions can also be killed.
@Component({
  selector: 'app-claude-sessions',
  standalone: true,
  imports: [MatIconModule, MatButtonModule, MatTooltipModule, MatMenuModule],
  template: `
    <div class="cs-root">
      <div class="cs-toolbar">
        <span class="title">Claude Sessions</span>
        <span class="count">{{ rows().length }} · {{ runningCount() }} running</span>
        <span class="spacer"></span>
        <button mat-icon-button class="sm" matTooltip="Refresh" (click)="refresh()"><mat-icon>refresh</mat-icon></button>
      </div>

      @if (error(); as e) { <div class="msg err">{{ e }}</div> }

      @if (!rows().length) {
        <div class="msg">No Claude sessions yet. Use <b>Submit with Claude</b> on a Business Rule to start one.</div>
      } @else {
        <div class="cs-list">
          @for (row of rows(); track row.session) {
            <div class="cs-row">
              <mat-icon class="dot" [class.on]="row.running" [class.off]="!row.running">fiber_manual_record</mat-icon>
              <div class="cs-body">
                <div class="cs-br">{{ row.brName ?? row.session }}</div>
                <div class="cs-sub"><span class="mono">{{ row.session }}</span> · <span class="mono">{{ row.branch }}</span></div>
              </div>
              <span class="state" [class.on]="row.running">{{ row.running ? 'running' : 'dead' }}</span>
              @if (row.running) {
                <button mat-stroked-button class="attach" (click)="attach(row.session)">
                  <mat-icon>open_in_new</mat-icon> Attach
                </button>
                <button mat-icon-button class="sm kill" matTooltip="Kill session"
                        (click)="kill(row)" [disabled]="busy() === row.session">
                  <mat-icon>{{ busy() === row.session ? 'hourglass_empty' : 'stop_circle' }}</mat-icon>
                </button>
              } @else {
                <button mat-stroked-button class="attach" (click)="reopen(row)" [disabled]="busy() === row.session">
                  <mat-icon>{{ busy() === row.session ? 'hourglass_empty' : 'play_arrow' }}</mat-icon> Reopen
                </button>
              }
              <button mat-icon-button class="sm" [matMenuTriggerFor]="menu" matTooltip="More"><mat-icon>more_vert</mat-icon></button>
              <mat-menu #menu>
                @if (row.running) {
                  <button mat-menu-item (click)="attach(row.session)"><mat-icon>open_in_new</mat-icon> Attach</button>
                  <button mat-menu-item (click)="kill(row)" [disabled]="busy() === row.session"><mat-icon>stop_circle</mat-icon> Kill session</button>
                } @else {
                  <button mat-menu-item (click)="reopen(row)" [disabled]="busy() === row.session"><mat-icon>play_arrow</mat-icon> Reopen (resume)</button>
                }
                <button mat-menu-item (click)="viewConversation(row)" [disabled]="!row.hasTranscript">
                  <mat-icon>forum</mat-icon> View conversation
                </button>
              </mat-menu>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .cs-root { display: flex; flex-direction: column; height: 100%; background: #fbfbfd; }
    .cs-toolbar { display: flex; align-items: center; gap: 8px; padding: 4px 8px; border-bottom: 1px solid #e6e6e6; font-size: 13px; }
    .cs-toolbar .title { font-weight: 600; color: #333; }
    .cs-toolbar .count { color: #999; font-size: 12px; }
    .spacer { flex: 1; } .sm { width: 30px; height: 30px; line-height: 30px; } .sm mat-icon { font-size: 18px; width: 18px; height: 18px; }
    .msg { padding: 20px; color: #999; text-align: center; } .msg.err { color: #c62828; }
    .cs-list { padding: 8px; overflow-y: auto; }
    .cs-row { display: flex; align-items: center; gap: 10px; background: white; border: 1px solid #dcdfe4;
              border-radius: 6px; padding: 8px 10px; margin-bottom: 6px; box-shadow: 0 1px 3px rgba(0,0,0,0.06); }
    .dot { font-size: 12px; width: 12px; height: 12px; flex-shrink: 0; }
    .dot.on { color: #4caf50; } .dot.off { color: #bdbdbd; }
    .cs-body { min-width: 0; flex: 1; }
    .cs-br { font-size: 13px; color: #222; font-weight: 600; }
    .cs-sub { font-size: 11px; color: #999; } .mono { font-family: monospace; }
    .state { font-size: 10px; color: #9e9e9e; text-transform: uppercase; letter-spacing: 0.04em; }
    .state.on { color: #2e7d32; }
    .attach { font-size: 12px; } .attach mat-icon { font-size: 15px; width: 15px; height: 15px; margin-right: 2px; }
    .kill { color: #c62828; }
  `],
})
export class ClaudeSessionsComponent implements OnInit, OnDestroy {
  private store = inject(Store);
  private file = inject(FileService);
  private dialog = inject(MatDialog);
  private snack = inject(MatSnackBar);
  private workspace = inject(WorkspaceService);
  private subs: Subscription[] = [];

  private rules = signal<AppBusinessRule[]>([]);
  private sessions = signal<ClaudeSession[]>([]);
  busy = signal<string>('');   // session currently being reopened or killed
  error = signal<string | null>(null);

  rows = computed<Row[]>(() => {
    const rules = this.rules();
    const bySession = new Map<string, string>();
    for (const r of rules) {
      const slug = brSlug(r.name);
      if (slug) bySession.set(`claude-${slug}`, r.name);
    }
    const seen = new Set<string>();
    const rows: Row[] = [];
    // Server list: running (live in tmux) + dead (worktree or archive exists).
    for (const s of this.sessions()) {
      rows.push({
        session: s.name, brName: bySession.get(s.name) ?? null, branch: branchFor(s.name),
        running: s.running, hasTranscript: !!s.hasTranscript,
      });
      seen.add(s.name);
    }
    // Flagged BRs the server hasn't surfaced yet (submitted, but no worktree/archive
    // — e.g. the claude CLI was missing) → show as dead so they're still visible.
    for (const r of rules) {
      if (!r.needsToBeEstablished) continue;
      const slug = brSlug(r.name);
      const name = `claude-${slug}`;
      if (!slug || seen.has(name)) continue;
      rows.push({ session: name, brName: r.name, branch: branchFor(name), running: false, hasTranscript: false });
      seen.add(name);
    }
    // Running first, then alphabetical — keeps the live work at the top.
    return rows.sort((a, b) => (a.running === b.running ? a.session.localeCompare(b.session) : a.running ? -1 : 1));
  });

  runningCount = computed(() => this.rows().filter(r => r.running).length);

  ngOnInit(): void {
    this.subs.push(this.store.select(selectAppRules).subscribe(r => this.rules.set(r)));
    // Poll the live sessions every 5s (running state lives in tmux, not the DB).
    this.subs.push(
      timer(0, 5000).pipe(switchMap(() => this.file.getClaudeSessions())).subscribe({
        next: s => { this.sessions.set(s); this.error.set(null); },
        error: err => this.error.set(err?.error?.error ?? err?.message ?? 'Cannot reach server'),
      }),
    );
  }

  ngOnDestroy(): void { this.subs.forEach(s => s.unsubscribe()); }

  refresh(): void {
    this.file.getClaudeSessions().subscribe({
      next: s => { this.sessions.set(s); this.error.set(null); },
      error: err => this.error.set(err?.error?.error ?? err?.message ?? 'Cannot reach server'),
    });
  }

  // Open the Terminal page attached to this session (handoff via WorkspaceService).
  attach(session: string): void { this.workspace.openTerminal(session); }

  // Kill a running session's tmux session. The worktree and archived conversation
  // survive, so it can be reopened later; confirm first to avoid losing a live turn.
  kill(row: Row): void {
    if (this.busy()) return;
    if (!confirm(`Kill ${row.session}? Its tmux session and Claude process will exit. The worktree and conversation are kept, so you can reopen it later.`)) return;
    this.busy.set(row.session);
    this.file.killClaudeSession(row.session).subscribe({
      next: () => {
        this.busy.set('');
        this.snack.open(`Killed ${row.session}`, 'OK', { duration: 4000 });
        this.refresh();
      },
      error: err => {
        this.busy.set('');
        this.snack.open(err?.error?.error ?? err?.message ?? 'Kill failed', 'Dismiss', { duration: 6000 });
      },
    });
  }

  // Reopen a dead session. The server resumes the prior conversation when it can;
  // we pass the rule so it can start fresh (seeded) if there's nothing to replay.
  reopen(row: Row): void {
    if (this.busy()) return;
    this.busy.set(row.session);
    const br = row.brName ? this.rules().find(r => r.name === row.brName) ?? null : null;
    this.file.reopenClaudeSession(row.session, { rule: br?.rule, description: br?.rationale ?? null }).subscribe({
      next: r => {
        this.busy.set('');
        this.snack.open(reopenMessage(r.mode, row.session), 'OK', { duration: 5000 });
        this.refresh();
        this.attach(row.session);   // drop straight into the reopened tmux session
      },
      error: err => {
        this.busy.set('');
        this.snack.open(err?.error?.error ?? err?.message ?? 'Reopen failed', 'Dismiss', { duration: 6000 });
      },
    });
  }

  viewConversation(row: Row): void {
    this.dialog.open(ClaudeConversationDialogComponent, {
      data: { session: row.session, brName: row.brName },
      width: '760px', maxWidth: '94vw', autoFocus: false,
    });
  }
}

// Human-readable summary of what the server did when reopening a session.
function reopenMessage(mode: string, session: string): string {
  switch (mode) {
    case 'resumed': return `Resumed ${session} — continuing the previous conversation`;
    case 'rehydrated': return `Restored ${session} from the archive and resumed`;
    case 'fresh-seeded': return `Could not restore the previous conversation — started ${session} fresh from the rule`;
    case 'fresh': return `Could not restore the previous conversation — started ${session} fresh`;
    case 'already-running': return `${session} is already running`;
    default: return `Reopened ${session}`;
  }
}

function branchFor(session: string): string {
  return session.startsWith('claude-') ? `claude/${session.slice('claude-'.length)}` : session;
}
