import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Store } from '@ngrx/store';
import { Subscription, timer } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { FileService } from '../../../services/file.service';
import { ClaudeSession, AppBusinessRule } from '../../../models/app-data.model';
import { selectAppRules } from '../../../store/app-data/app-data.selectors';
import { TerminalComponent } from '../terminal/terminal.component';

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
}

// Lists the Claude sessions spawned by "Submit with Claude": each is a claude CLI
// running in a per-BR git worktree. Running state is polled from the server (tmux);
// BRs flagged needs-establishing whose session isn't live show as stopped. Attach
// opens the live session in an embedded terminal.
@Component({
  selector: 'app-claude-sessions',
  standalone: true,
  imports: [MatIconModule, MatButtonModule, MatTooltipModule, TerminalComponent],
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
            <div class="cs-row" [class.selected]="selected() === row.session">
              <mat-icon class="dot" [class.on]="row.running" [class.off]="!row.running">fiber_manual_record</mat-icon>
              <div class="cs-body">
                <div class="cs-br">{{ row.brName ?? row.session }}</div>
                <div class="cs-sub"><span class="mono">{{ row.session }}</span> · <span class="mono">{{ row.branch }}</span></div>
              </div>
              <span class="state" [class.on]="row.running">{{ row.running ? 'running' : 'stopped' }}</span>
              <button mat-stroked-button class="attach" (click)="attach(row.session)" [disabled]="!row.running">
                <mat-icon>open_in_new</mat-icon> Attach
              </button>
            </div>
          }
        </div>
      }

      @for (s of selectedList(); track s) {
        <div class="cs-term">
          <div class="cs-term-bar">
            <span>Attached to <span class="mono">{{ s }}</span></span>
            <span class="spacer"></span>
            <button mat-icon-button class="sm" matTooltip="Close terminal" (click)="detach()"><mat-icon>close</mat-icon></button>
          </div>
          <div class="cs-term-host"><app-terminal [initialSession]="s"></app-terminal></div>
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
    .cs-row.selected { border-color: #8e24aa; box-shadow: 0 0 0 1px #8e24aa; }
    .dot { font-size: 12px; width: 12px; height: 12px; flex-shrink: 0; }
    .dot.on { color: #4caf50; } .dot.off { color: #bdbdbd; }
    .cs-body { min-width: 0; flex: 1; }
    .cs-br { font-size: 13px; color: #222; font-weight: 600; }
    .cs-sub { font-size: 11px; color: #999; } .mono { font-family: monospace; }
    .state { font-size: 10px; color: #9e9e9e; text-transform: uppercase; letter-spacing: 0.04em; }
    .state.on { color: #2e7d32; }
    .attach { font-size: 12px; } .attach mat-icon { font-size: 15px; width: 15px; height: 15px; margin-right: 2px; }
    .cs-term { display: flex; flex-direction: column; flex: 1; min-height: 200px; border-top: 1px solid #ddd; }
    .cs-term-bar { display: flex; align-items: center; gap: 8px; padding: 3px 8px; background: #252526; color: #ccc; font-size: 12px; }
    .cs-term-host { flex: 1; min-height: 0; }
  `],
})
export class ClaudeSessionsComponent implements OnInit, OnDestroy {
  private store = inject(Store);
  private file = inject(FileService);
  private subs: Subscription[] = [];

  private rules = signal<AppBusinessRule[]>([]);
  private sessions = signal<ClaudeSession[]>([]);
  selected = signal<string>('');
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
    for (const s of this.sessions()) {
      rows.push({ session: s.name, brName: bySession.get(s.name) ?? null, branch: branchFor(s.name), running: true });
      seen.add(s.name);
    }
    // Flagged BRs whose session isn't currently live → show as stopped.
    for (const r of rules) {
      if (!r.needsToBeEstablished) continue;
      const slug = brSlug(r.name);
      const name = `claude-${slug}`;
      if (!slug || seen.has(name)) continue;
      rows.push({ session: name, brName: r.name, branch: branchFor(name), running: false });
      seen.add(name);
    }
    return rows;
  });

  runningCount = computed(() => this.rows().filter(r => r.running).length);
  // Single-item list so @for re-creates the terminal when the target changes.
  selectedList = computed<string[]>(() => (this.selected() ? [this.selected()] : []));

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

  attach(session: string): void { this.selected.set(session); }
  detach(): void { this.selected.set(''); }
}

function branchFor(session: string): string {
  return session.startsWith('claude-') ? `claude/${session.slice('claude-'.length)}` : session;
}
