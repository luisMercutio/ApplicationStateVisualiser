import {
  Component, ElementRef, OnDestroy, AfterViewInit, inject, input, signal, viewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import type { Terminal as XTerm } from '@xterm/xterm';
import type { FitAddon as XFitAddon } from '@xterm/addon-fit';
import { FileService } from '../../../services/file.service';

type Status = 'connecting' | 'connected' | 'disconnected' | 'error';

// A live terminal panel that attaches to a tmux session inside WSL via the
// server's /api/terminal WebSocket ⇄ PTY bridge. Keystrokes stream to the PTY;
// terminal output streams back and is rendered by xterm.js.
@Component({
  selector: 'app-terminal',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatButtonModule, MatTooltipModule],
  template: `
    <div class="term-wrapper">
      <div class="term-bar">
        <mat-icon class="dot" [class]="status()">fiber_manual_record</mat-icon>
        <select class="session-select" [value]="session()"
                (change)="onSessionChange($event)"
                [disabled]="sessions().length === 0">
          @for (s of sessions(); track s) {
            <option [value]="s">{{ s }}</option>
          }
          @if (sessions().length === 0) {
            <option value="">no tmux sessions</option>
          }
        </select>
        <span class="status-text">{{ statusText() }}</span>
        <span class="spacer"></span>
        <button mat-icon-button class="bar-btn" matTooltip="Refresh session list"
                (click)="refreshSessions()">
          <mat-icon>refresh</mat-icon>
        </button>
        <button mat-icon-button class="bar-btn" matTooltip="Reconnect"
                (click)="reconnect()" [disabled]="!session()">
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
    .session-select { background: #1e1e1e; color: #ddd; border: 1px solid #444; border-radius: 4px; padding: 2px 6px; font-size: 12px; max-width: 220px; }
    .status-text { color: #9e9e9e; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .spacer { flex: 1; }
    .bar-btn { width: 28px; height: 28px; line-height: 28px; color: #bbb; }
    .bar-btn mat-icon { font-size: 16px; width: 16px; height: 16px; }
    .term-host { flex: 1; min-height: 0; overflow: hidden; padding: 2px 4px; }
    .term-host ::ng-deep .xterm { height: 100%; }
  `],
})
export class TerminalComponent implements AfterViewInit, OnDestroy {
  private fileService = inject(FileService);
  private host = viewChild.required<ElementRef<HTMLDivElement>>('host');

  // When set (e.g. by the Claude Sessions page), attach to this session on init
  // instead of auto-selecting the default tmux session.
  initialSession = input<string>('');

  sessions = signal<string[]>([]);
  session = signal<string>('');
  status = signal<Status>('connecting');
  statusText = signal<string>('Loading sessions…');

  private term?: XTerm;
  private fit?: XFitAddon;
  private ws?: WebSocket;
  private resizeObserver?: ResizeObserver;
  private disposed = false;

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
    // explicit session was requested.
    const initial = this.initialSession();
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

  onSessionChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if (value && value !== this.session()) this.connect(value);
  }

  reconnect(): void {
    if (this.session()) this.connect(this.session());
  }

  private connect(session: string): void {
    if (!this.term) return;
    this.teardownSocket();
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
    if (!this.ws) return;
    const ws = this.ws;
    this.ws = undefined;
    ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null;
    try { ws.close(); } catch { /* already closed */ }
  }
}
