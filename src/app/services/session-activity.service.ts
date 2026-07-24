import { Injectable, computed, inject, signal } from '@angular/core';
import { DbService } from './db.service';
import { FileService } from './file.service';
import { ActivityMessage } from '../models/activity.model';

// Persisted so a page refresh keeps the badges (unread finishes) and so the
// activity backlog isn't re-counted as "new" every time we (re)connect.
const LS_UNREAD = 'asv.sessionActivity.unread';
const LS_PROCESSED = 'asv.sessionActivity.processed';
const PROCESSED_CAP = 400;   // keep the processed-id set bounded
const RECONNECT_MS = 5000;
const KNOWN_REFRESH_MS = 15000;

// A "Claude done" notification identifies the run that finished by directory —
// the notifier puts the worktree/cwd basename in the title ("Claude done (…): NAME")
// and the full path on a `dir:` body line. When Claude runs inside WSL tmux it also
// adds a `tmux: <session>` line. Any of these can name a terminal session; we match
// the candidates against the live tmux session list (case-insensitive) so only a
// finish that maps to a real session in the picker lights up a badge.
const TMUX_LINE = /^\s*tmux:\s*(\S+)\s*$/m;
const DIR_LINE = /^\s*dir:\s*(.+?)\s*$/m;
const TITLE_TAIL = /:\s*([^:]+?)\s*$/;   // trailing "…: NAME"

function basename(p: string): string {
  const parts = String(p).split(/[\\/]+/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : '';
}

// Names in the message that could correspond to a terminal session.
function candidatesOf(ev: ActivityMessage): string[] {
  const out: string[] = [];
  const tmux = TMUX_LINE.exec(ev.message || '');
  if (tmux) out.push(tmux[1]);
  const dir = DIR_LINE.exec(ev.message || '');
  if (dir) { const b = basename(dir[1]); if (b) out.push(b); }
  const title = TITLE_TAIL.exec(ev.title || '');
  if (title) out.push(title[1].trim());
  return out;
}

function isDone(ev: ActivityMessage): boolean {
  return (ev.tags || []).includes('white_check_mark') || /^Claude done\b/i.test(ev.title || '');
}

function loadSet(key: string): Set<string> {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr.map(String) : []);
  } catch { return new Set<string>(); }
}

function persistSet(key: string, set: Set<string>): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, JSON.stringify([...set]));
  } catch { /* storage full or unavailable — badges just won't survive a refresh */ }
}

// Drop oldest entries (Sets preserve insertion order) until within cap.
function capSet(set: Set<string>, cap: number): void {
  if (set.size <= cap) return;
  let drop = set.size - cap;
  for (const k of set) { if (drop-- <= 0) break; set.delete(k); }
}

/**
 * Tracks which terminal (tmux) sessions have finished a Claude turn since you last
 * opened them, so the UI can show a "notification" badge until you look.
 *
 * A single app-wide WebSocket to /api/activity (the same ntfy mirror the Activity
 * page reads) stays connected for the life of the app — independent of which page
 * is showing — so finishes accumulate in the background. Each "Claude done" event
 * names the finished run by directory (its worktree/cwd basename) and, when run in
 * WSL tmux, by tmux session; we match those against the live tmux session list and
 * flag the matching session as unread, cleared when the user selects/opens it.
 *
 * Only finishes observed live (after the app is open) flag a badge — the historical
 * backlog present at startup is baselined so a fresh load doesn't light everything up.
 */
@Injectable({ providedIn: 'root' })
export class SessionActivityService {
  private db = inject(DbService);
  private file = inject(FileService);

  // tmux session names (as the picker lists them) with an unseen finish.
  private unreadSet = signal<Set<string>>(loadSet(LS_UNREAD));
  // ntfy message ids already accounted for — stops the reconnect/refresh backlog
  // from re-flagging a finish we've already surfaced (or baselined at startup).
  private processed = loadSet(LS_PROCESSED);
  // Live tmux session names, refreshed periodically, used to correlate a finish
  // (by directory/tmux name) to a real session in the picker.
  private knownSessions: string[] = [];

  /** Number of sessions with an unseen finish (for an aggregate badge). */
  readonly count = computed(() => this.unreadSet().size);

  private ws?: WebSocket;
  private reconnectTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    this.refreshKnown();
    setInterval(() => this.refreshKnown(), KNOWN_REFRESH_MS);
    this.connect();
  }

  /** True when this session finished a turn we haven't opened since. */
  isUnread(session: string): boolean {
    return this.unreadSet().has(session);
  }

  /** Clear a session's badge — call when the user selects/opens it. */
  markOpened(session: string): void {
    const set = this.unreadSet();
    if (!session || !set.has(session)) return;
    const next = new Set(set);
    next.delete(session);
    this.unreadSet.set(next);
    persistSet(LS_UNREAD, next);
  }

  private flag(session: string): void {
    const set = this.unreadSet();
    if (set.has(session)) return;
    const next = new Set(set);
    next.add(session);
    this.unreadSet.set(next);
    persistSet(LS_UNREAD, next);
  }

  // Resolve any of the message's candidate names to a live session (case-insensitive).
  private matchKnown(candidates: string[]): string | null {
    const lc = candidates.map(c => c.toLowerCase());
    return this.knownSessions.find(s => lc.includes(s.toLowerCase())) ?? null;
  }

  private refreshKnown(): Promise<void> {
    return new Promise(resolve => {
      this.file.getTmuxSessions().subscribe({
        next: ({ sessions }) => { this.knownSessions = sessions ?? []; resolve(); },
        error: () => resolve(),
      });
    });
  }

  private connect(): void {
    let ws: WebSocket;
    try { ws = new WebSocket(this.db.activityWsUrl()); }
    catch { this.scheduleReconnect(); return; }
    this.ws = ws;
    ws.onmessage = ev => this.onMessage(ev);
    ws.onclose = () => { if (this.ws === ws) this.scheduleReconnect(); };
    ws.onerror = () => { try { ws.close(); } catch { /* already closing */ } };
  }

  private scheduleReconnect(): void {
    this.ws = undefined;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => this.connect(), RECONNECT_MS);
  }

  private onMessage(ev: MessageEvent): void {
    let msg: { type?: string; events?: ActivityMessage[]; event?: ActivityMessage };
    try { msg = JSON.parse(ev.data); } catch { return; }
    if (msg.type === 'backlog' && Array.isArray(msg.events)) {
      // Baseline the backlog: mark every historical finish processed without flagging.
      for (const e of msg.events) { if (e?.id) this.processed.add(e.id); }
      capSet(this.processed, PROCESSED_CAP);
      persistSet(LS_PROCESSED, this.processed);
    } else if (msg.type === 'message' && msg.event) {
      void this.consumeLive(msg.event);
    }
  }

  private async consumeLive(ev: ActivityMessage): Promise<void> {
    if (!ev?.id || this.processed.has(ev.id)) return;
    this.processed.add(ev.id);
    capSet(this.processed, PROCESSED_CAP);
    persistSet(LS_PROCESSED, this.processed);
    if (!isDone(ev)) return;
    const candidates = candidatesOf(ev);
    if (!candidates.length) return;
    // Match against the live session list; if nothing matches, the session may have
    // just been created — refresh once and retry before giving up.
    let match = this.matchKnown(candidates);
    if (!match) { await this.refreshKnown(); match = this.matchKnown(candidates); }
    if (match) this.flag(match);
  }
}
