import {
  Component, ElementRef, OnDestroy, AfterViewInit, computed, effect, inject, input, signal, viewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';
import { MatBadgeModule } from '@angular/material/badge';
import type { Terminal as XTerm } from '@xterm/xterm';
import type { FitAddon as XFitAddon } from '@xterm/addon-fit';
import { FileService } from '../../../services/file.service';
import { WorkspaceService } from '../../../services/workspace.service';
import { SessionActivityService } from '../../../services/session-activity.service';

type Status = 'connecting' | 'connected' | 'disconnected' | 'error';

// Mirror the server's SESSION_RE (server.js): tmux session names the PTY bridge
// will accept. Validate here so a bad name is rejected before we open a socket.
const SESSION_NAME_RE = /^[A-Za-z0-9_.-]+$/;

// A live terminal panel that attaches to a tmux session inside WSL via the
// server's /api/terminal WebSocket ⇄ PTY bridge. Keystrokes stream to the PTY;
// terminal output streams back and is rendered by xterm.js.
@Component({
  selector: 'app-terminal',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatButtonModule, MatTooltipModule, MatMenuModule, MatBadgeModule],
  template: `
    <div class="term-wrapper">
      <div class="term-bar">
        <mat-icon class="dot" [class]="status()">fiber_manual_record</mat-icon>
        @if (adding()) {
          <input #nameInput class="session-input" type="text" placeholder="new session name"
                 [value]="newName()" [class.invalid]="!!addError()"
                 (input)="onNameInput(nameInput.value)"
                 (keydown.enter)="confirmAdd()"
                 (keydown.escape)="cancelAdd()" />
          <button mat-icon-button class="bar-btn" matTooltip="Create & attach"
                  (click)="confirmAdd()" [disabled]="!newName().trim()">
            <mat-icon>check</mat-icon>
          </button>
          <button mat-icon-button class="bar-btn" matTooltip="Cancel" (click)="cancelAdd()">
            <mat-icon>close</mat-icon>
          </button>
          @if (addError()) { <span class="add-error">{{ addError() }}</span> }
        } @else {
          <!-- Session picker. A badge marks sessions that finished a Claude turn
               since they were last opened; selecting a session clears its badge. -->
          <button class="session-btn" [matMenuTriggerFor]="sessMenu"
                  [disabled]="sessions().length === 0"
                  [matBadge]="unreadHere()" [matBadgeHidden]="unreadHere() === 0"
                  matBadgeColor="warn" matBadgeSize="small" matBadgeOverlap="false"
                  matTooltip="Switch tmux session">
            <span class="sess-name">{{ session() || (sessions().length ? 'select session' : 'no tmux sessions') }}</span>
            <mat-icon class="caret">arrow_drop_down</mat-icon>
          </button>
          <mat-menu #sessMenu="matMenu">
            @for (s of sessions(); track s) {
              <button mat-menu-item (click)="selectSession(s)">
                <mat-icon>{{ s === session() ? 'check' : 'terminal' }}</mat-icon>
                <span class="menu-sess">{{ s }}</span>
                @if (sessionActivity.isUnread(s)) {
                  <span class="unread-dot" matTooltip="Finished a turn since last opened"></span>
                }
              </button>
            }
            @if (sessions().length === 0) {
              <button mat-menu-item disabled>no tmux sessions</button>
            }
          </mat-menu>
          <button mat-icon-button class="bar-btn" matTooltip="New session by name"
                  (click)="startAdd()">
            <mat-icon>add</mat-icon>
          </button>
        }
        <span class="status-text">{{ statusText() }}</span>
        <span class="spacer"></span>
        <button mat-icon-button class="bar-btn" matTooltip="Refresh session list"
                (click)="refreshSessions()">
          <mat-icon>refresh</mat-icon>
        </button>
        <button mat-icon-button class="bar-btn" matTooltip="Reconnect"
                (click)="reconnect()" [disabled]="!session()">
          <mat-icon>cable</mat-icon>
        </button>
        <!-- Exit hands the decision to the Claude agent in the pane: it types a
             verify-merge/cleanup prompt, and Claude closes the session (via the
             backend) only once the work is landed — or reports what's missing. -->
        <button mat-icon-button class="bar-btn exit-btn" matTooltip="Exit session — Claude verifies merge & cleanup first"
                (click)="exitSession()" [disabled]="!canExit()">
          <mat-icon>power_settings_new</mat-icon>
        </button>
      </div>
      <div class="term-host" #host></div>
    </div>
  `,
  styles: [`
    .term-wrapper { display: flex; flex-direction: column; height: 100%; background: #1e1e1e; }
    .term-bar { display: flex; align-items: center; gap: 8px; padding: 4px 6px; background: #252526; border-bottom: 1px solid #333; flex-shrink: 0; }
    .dot { font-size: 12px; width: 12px; height: 12px; }
    .dot.connected { color: #4caf50; }
    .dot.connecting { color: #ffb300; }
    .dot.disconnected { color: #9e9e9e; }
    .dot.error { color: #ff5252; }
    .session-input { background: #1e1e1e; color: #ddd; border: 1px solid #444; border-radius: 4px; padding: 2px 6px; font-size: 12px; width: 180px; outline: none; }
    .session-input:focus { border-color: #4caf50; }
    .session-input.invalid { border-color: #ff5252; }
    .add-error { color: #ff8a80; font-size: 11px; white-space: nowrap; }
    .session-btn { display: inline-flex; align-items: center; gap: 2px; background: #1e1e1e; color: #ddd;
                   border: 1px solid #444; border-radius: 4px; padding: 2px 4px 2px 8px; font-size: 12px;
                   max-width: 240px; cursor: pointer; height: 24px; }
    .session-btn:hover:not([disabled]) { border-color: #666; }
    .session-btn[disabled] { opacity: 0.6; cursor: default; }
    .session-btn .sess-name { max-width: 190px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .session-btn .caret { font-size: 18px; width: 18px; height: 18px; }
    .menu-sess { flex: 1; }
    .unread-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #f44336;
                  margin-left: 8px; flex-shrink: 0; }
    .status-text { color: #9e9e9e; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .spacer { flex: 1; }
    .bar-btn { width: 28px; height: 28px; line-height: 28px; color: #bbb; }
    .bar-btn mat-icon { font-size: 16px; width: 16px; height: 16px; }
    .exit-btn:not([disabled]) { color: #ff6b6b; }
    .term-host { flex: 1; min-height: 0; overflow: hidden; padding: 2px 4px; }
    .term-host ::ng-deep .xterm { height: 100%; }
  `],
})
export class TerminalComponent implements AfterViewInit, OnDestroy {
  private fileService = inject(FileService);
  private workspace = inject(WorkspaceService);
  protected sessionActivity = inject(SessionActivityService);
  private host = viewChild.required<ElementRef<HTMLDivElement>>('host');
  private nameInput = viewChild<ElementRef<HTMLInputElement>>('nameInput');

  // How many of the sessions currently in the picker have an unseen finish —
  // drives the small badge on the picker button.
  unreadHere = computed(() => this.sessions().filter(s => this.sessionActivity.isUnread(s)).length);

  // Only a Claude agent session can act on the exit-check prompt, so the Exit button
  // is enabled only when a claude-* session is attached (mirrors the naming used by
  // the Claude-session endpoints in file.service.ts / server.js).
  canExit = computed(() => this.session().startsWith('claude-'));

  // When set (e.g. by embedding the component with a binding), attach to this
  // session on init instead of auto-selecting the default tmux session. When hosted
  // as the Terminal page, the requested session arrives via WorkspaceService instead.
  initialSession = input<string>('');

  sessions = signal<string[]>([]);
  session = signal<string>('');
  status = signal<Status>('connecting');
  statusText = signal<string>('Loading sessions…');

  // "New session by name" flow: swaps the picker for an inline name input.
  adding = signal<boolean>(false);
  newName = signal<string>('');
  addError = signal<string>('');

  private term?: XTerm;
  private fit?: XFitAddon;
  private ws?: WebSocket;
  private resizeObserver?: ResizeObserver;
  private disposed = false;
  // The session we've registered as attached with SessionActivityService, so we can
  // release it exactly once when switching sessions or tearing the panel down.
  private attachedSession = '';

  constructor() {
    // Focus the name field as soon as the add-input is rendered.
    effect(() => { if (this.adding()) this.nameInput()?.nativeElement.focus(); });
  }

  // xterm is ~250 kB and CommonJS; load it lazily so it stays out of the initial
  // bundle and only downloads when a terminal panel is actually opened.
  async ngAfterViewInit(): Promise<void> {
    const [{ Terminal }, { FitAddon }] = await Promise.all([
      import('@xterm/xterm'),
      import('@xterm/addon-fit'),
    ]);
    if (this.disposed) return;

    this.term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: 'Consolas, "Cascadia Mono", "DejaVu Sans Mono", monospace',
      scrollback: 5000,
      theme: { background: '#1e1e1e', foreground: '#e0e0e0' },
    });
    this.fit = new FitAddon();
    this.term.loadAddon(this.fit);
    this.term.open(this.host().nativeElement);
    this.safeFit();

    // Refit whenever the panel is resized (gridster drag/resize, window resize).
    this.resizeObserver = new ResizeObserver(() => this.onResize());
    this.resizeObserver.observe(this.host().nativeElement);

    // Forward keystrokes to the PTY as binary frames.
    this.term.onData(data => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(new TextEncoder().encode(data));
      }
    });

    // Populate the picker either way; only auto-connect to the default when no
    // explicit session was requested (via an input binding, or via WorkspaceService
    // when the Claude Sessions page navigated here with a session to attach).
    const initial = this.initialSession() || this.workspace.takeTerminalSession();
    if (initial) {
      this.refreshSessions(/* autoConnect */ false);
      this.connect(initial);
    } else {
      this.refreshSessions(/* autoConnect */ true);
    }
  }

  ngOnDestroy(): void {
    this.disposed = true;
    this.resizeObserver?.disconnect();
    this.teardownSocket();
    this.term?.dispose();
  }

  refreshSessions(autoConnect = false): void {
    this.fileService.getTmuxSessions().subscribe({
      next: ({ sessions, default: def }) => {
        if (this.disposed) return;
        this.sessions.set(sessions);
        if (autoConnect || !this.session()) {
          const target = sessions.includes(def) ? def : sessions[0] ?? def;
          if (target) this.connect(target);
          else {
            this.status.set('disconnected');
            this.statusText.set('No tmux sessions running');
          }
        }
      },
      error: err => {
        if (this.disposed) return;
        this.status.set('error');
        this.statusText.set('Cannot reach server: ' + (err?.message ?? 'error'));
      },
    });
  }

  selectSession(session: string): void {
    if (!session) return;
    // Clear the badge as soon as it's picked, then attach (no-op if already on it).
    this.sessionActivity.markOpened(session);
    if (session !== this.session()) this.connect(session);
  }

  startAdd(): void {
    this.newName.set('');
    this.addError.set('');
    this.adding.set(true);
  }

  cancelAdd(): void {
    this.adding.set(false);
    this.newName.set('');
    this.addError.set('');
  }

  onNameInput(value: string): void {
    this.newName.set(value);
    if (this.addError()) this.addError.set('');
  }

  // Create (or attach to) a tmux session by name. The PTY bridge runs
  // `tmux new-session -A`, so an unknown name is created on attach; a name that
  // already exists just attaches. Validate against the server's SESSION_RE first.
  confirmAdd(): void {
    const name = this.newName().trim();
    if (!name) return;
    if (!SESSION_NAME_RE.test(name)) {
      this.addError.set('Only letters, numbers, and _ . -');
      return;
    }
    if (!this.sessions().includes(name)) {
      this.sessions.update(list => [...list, name]);
    }
    this.adding.set(false);
    this.newName.set('');
    this.addError.set('');
    this.connect(name);
  }

  reconnect(): void {
    if (this.session()) this.connect(this.session());
  }

  // Ask the Claude agent running in this pane to close the session — but only after
  // it confirms the change is merged onto main and test and the worktree is cleaned
  // up. We just type the prompt into the live PTY (same path as any keystroke); Claude
  // does the checking and, when satisfied, POSTs /api/terminal/sessions/exit itself,
  // which kills the tmux session. If something's missing it reports that and waits.
  exitSession(): void {
    const session = this.session();
    if (!this.canExit() || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    if (!window.confirm(
      `Ask Claude to close "${session}"?\n\nClaude will first check that the change is merged onto ` +
      `main and test and the worktree is cleaned up. If so it closes the session; otherwise it ` +
      `tells you what's missing.`)) return;
    this.ws.send(new TextEncoder().encode(this.exitPrompt(session) + '\r'));
    this.statusText.set('Asked Claude to verify merge/cleanup before exit…');
  }

  // A single line (Claude's TUI submits on the first newline, so no embedded \n). The
  // session name is baked in so Claude curls the exact session back to the backend.
  private exitPrompt(session: string): string {
    return `Before I close this terminal session: is this change merged onto main AND test, and is ` +
      `the worktree cleaned up? If all three are done, close this session by running: curl -sS -X POST ` +
      `http://localhost:3001/api/terminal/sessions/exit -H 'Content-Type: application/json' -d ` +
      `'{"session":"${session}","mergedMain":true,"mergedTest":true,"worktreeCleaned":true}' — if ` +
      `anything is missing, list exactly what's missing and do NOT exit unless I explicitly tell you ` +
      `to exit anyway.`;
  }

  private connect(session: string): void {
    if (!this.term) return;
    this.teardownSocket();
    // Attaching to a session counts as "seen": clear any finished badge and register
    // it as attached so finishes arriving while we watch it raise no new badge.
    this.sessionActivity.attach(session);
    this.attachedSession = session;
    this.session.set(session);
    this.status.set('connecting');
    this.statusText.set(`Connecting to ${session}…`);
    this.term.reset();
    this.safeFit();

    const cols = this.term.cols || 80;
    const rows = this.term.rows || 24;
    const ws = new WebSocket(this.fileService.terminalWsUrl(session, cols, rows));
    ws.binaryType = 'arraybuffer';
    this.ws = ws;

    ws.onopen = () => {
      this.status.set('connected');
      this.statusText.set(`Attached to ${session}`);
      this.sendResize();
      this.term?.focus();
    };
    ws.onmessage = (ev: MessageEvent) => {
      if (typeof ev.data === 'string') { this.handleControl(ev.data); return; }
      this.term?.write(new Uint8Array(ev.data as ArrayBuffer));
    };
    ws.onclose = () => {
      if (this.disposed || this.ws !== ws) return;
      this.status.set('disconnected');
      this.statusText.set(`Disconnected from ${session}`);
    };
    ws.onerror = () => {
      if (this.disposed || this.ws !== ws) return;
      this.status.set('error');
      this.statusText.set('Connection error');
    };
  }

  private handleControl(raw: string): void {
    let msg: { type?: string; message?: string; code?: number };
    try { msg = JSON.parse(raw); } catch { return; }
    if (msg.type === 'error') {
      this.status.set('error');
      this.statusText.set(msg.message ?? 'Error');
    } else if (msg.type === 'exit') {
      this.statusText.set(`Session ended (code ${msg.code ?? 0})`);
      // The tmux session is gone (e.g. an Exit-session close) — drop it from the picker.
      this.refreshSessions(/* autoConnect */ false);
    }
  }

  private onResize(): void {
    this.safeFit();
    this.sendResize();
  }

  private sendResize(): void {
    if (!this.term || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type: 'resize', cols: this.term.cols, rows: this.term.rows }));
  }

  private safeFit(): void {
    try { this.fit?.fit(); } catch { /* container not laid out yet */ }
  }

  private teardownSocket(): void {
    // Release the attachment first, whether or not a socket is open, so finishes for
    // this session badge normally once we're no longer viewing it.
    if (this.attachedSession) {
      this.sessionActivity.detach(this.attachedSession);
      this.attachedSession = '';
    }
    if (!this.ws) return;
    const ws = this.ws;
    this.ws = undefined;
    ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null;
    try { ws.close(); } catch { /* already closed */ }
  }
}
