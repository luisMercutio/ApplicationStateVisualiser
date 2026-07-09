import { Component, OnDestroy, AfterViewInit, inject, signal, computed } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivityMessage } from '../../../models/activity.model';
import { DbService } from '../../../services/db.service';

type Status = 'connecting' | 'connected' | 'disconnected' | 'error';

// A few of the ntfy tags our notifiers send map to a nicer glyph. Anything else
// falls through and renders as a plain text chip.
const TAG_EMOJI: Record<string, string> = {
  desktop_computer: '🖥️',
  penguin: '🐧',
  white_check_mark: '✅',
};

/**
 * Live "Claude done" activity feed page. The server subscribes to the self-hosted
 * ntfy topic (fed by the Claude Code Stop hook) and streams notifications over
 * the /api/activity WebSocket: a backlog of recent messages on connect, then each
 * new one live. Read-only and in-memory — this page never writes anything, and it
 * is independent of the active database connection.
 */
@Component({
  selector: 'app-activity-feed',
  standalone: true,
  imports: [MatIconModule, MatButtonModule, MatTooltipModule],
  template: `
    <div class="act-root">
      <div class="act-toolbar">
        <mat-icon class="dot" [class]="status()">fiber_manual_record</mat-icon>
        <span class="title">Activity</span>
        <span class="count">{{ messages().length }}</span>
        <span class="status-text">{{ statusText() }}</span>
        <span class="spacer"></span>
        <button mat-icon-button class="sm" matTooltip="Reconnect" (click)="reconnect()"><mat-icon>power_settings_new</mat-icon></button>
      </div>

      @if (!messages().length) {
        <div class="msg">
          @if (status() === 'connected') { No notifications yet. Finish a Claude turn and it'll appear here. }
          @else if (status() === 'connecting') { Connecting to the activity feed… }
          @else { Not connected. Click <mat-icon class="inline">power_settings_new</mat-icon> to retry. }
        </div>
      } @else {
        <div class="act-list">
          @for (m of messages(); track m.id) {
            <div class="act-card" [class]="'p' + m.priority">
              <div class="ac-head">
                <span class="ac-title">{{ m.title || '(no title)' }}</span>
                <span class="spacer"></span>
                <span class="ac-time" [matTooltip]="fullTime(m.time)">{{ shortTime(m.time) }}</span>
              </div>
              @if (m.message) { <div class="ac-body">{{ m.message }}</div> }
              @if (m.tags.length) {
                <div class="ac-tags">
                  @for (t of m.tags; track t) { <span class="tag">{{ tagLabel(t) }}</span> }
                </div>
              }
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .act-root { display: flex; flex-direction: column; height: 100%; background: #fbfbfd; }
    .act-toolbar { display: flex; align-items: center; gap: 8px; padding: 6px 10px; border-bottom: 1px solid #e6e6e6; font-size: 13px; }
    .act-toolbar .title { font-weight: 600; color: #333; } .act-toolbar .count { color: #999; font-size: 12px; }
    .status-text { color: #9e9e9e; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .spacer { flex: 1; } .sm { font-size: 12px; }
    .dot { font-size: 11px; width: 11px; height: 11px; }
    .dot.connected { color: #4caf50; } .dot.connecting { color: #ffb300; }
    .dot.disconnected { color: #9e9e9e; } .dot.error { color: #ff5252; }
    .msg { padding: 24px; color: #999; text-align: center; }
    .msg .inline { font-size: 15px; vertical-align: middle; }
    .act-list { flex: 1; overflow-y: auto; padding: 10px; }
    .act-card { background: white; border: 1px solid #dcdfe4; border-left: 4px solid #4caf50; border-radius: 6px;
                padding: 8px 10px; margin-bottom: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.06); max-width: 900px; }
    .act-card:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.12); }
    .act-card.p4 { border-left-color: #fb8c00; } .act-card.p5 { border-left-color: #e53935; }
    .ac-head { display: flex; align-items: baseline; gap: 6px; }
    .ac-title { font-size: 13px; font-weight: 600; color: #222; }
    .ac-time { font-size: 11px; color: #999; white-space: nowrap; }
    .ac-body { font-size: 12px; color: #444; line-height: 1.4; margin-top: 4px; white-space: pre-wrap;
               font-family: Consolas, "Cascadia Mono", monospace; }
    .ac-tags { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
    .tag { font-size: 11px; background: #eef7ee; color: #2e7d32; border: 1px solid #cfe6cf;
           padding: 1px 7px; border-radius: 10px; }
  `],
})
export class ActivityFeedComponent implements AfterViewInit, OnDestroy {
  private db = inject(DbService);

  private raw = signal<ActivityMessage[]>([]);
  // Newest first for display.
  messages = computed(() => [...this.raw()].sort((a, b) => b.time - a.time));
  status = signal<Status>('connecting');
  statusText = signal<string>('Connecting…');

  private ws?: WebSocket;
  private disposed = false;

  ngAfterViewInit(): void { this.connect(); }

  ngOnDestroy(): void {
    this.disposed = true;
    this.teardownSocket();
  }

  reconnect(): void { this.connect(); }

  tagLabel(tag: string): string { return TAG_EMOJI[tag] ?? tag; }

  shortTime(sec: number): string {
    if (!sec) return '';
    return new Date(sec * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  fullTime(sec: number): string {
    if (!sec) return '';
    return new Date(sec * 1000).toLocaleString();
  }

  private connect(): void {
    this.teardownSocket();
    this.status.set('connecting');
    this.statusText.set('Connecting…');

    const ws = new WebSocket(this.db.activityWsUrl());
    this.ws = ws;

    ws.onopen = () => {
      this.status.set('connected');
      this.statusText.set('Live');
    };
    ws.onmessage = (ev: MessageEvent) => {
      let msg: { type?: string; events?: ActivityMessage[]; event?: ActivityMessage };
      try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.type === 'backlog' && Array.isArray(msg.events)) {
        this.raw.set(msg.events);
      } else if (msg.type === 'message' && msg.event) {
        const incoming = msg.event;
        // Dedupe defensively — the server already dedupes, but reconnect backlog
        // can overlap a live message.
        this.raw.update(list => list.some(m => m.id === incoming.id) ? list : [...list, incoming]);
      }
    };
    ws.onclose = () => {
      if (this.disposed || this.ws !== ws) return;
      this.status.set('disconnected');
      this.statusText.set('Disconnected');
    };
    ws.onerror = () => {
      if (this.disposed || this.ws !== ws) return;
      this.status.set('error');
      this.statusText.set('Connection error');
    };
  }

  private teardownSocket(): void {
    if (!this.ws) return;
    const ws = this.ws;
    this.ws = undefined;
    ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null;
    try { ws.close(); } catch { /* already closed */ }
  }
}
