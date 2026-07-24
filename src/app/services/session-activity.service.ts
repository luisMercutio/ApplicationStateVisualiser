import { Injectable, computed, inject, signal } from '@angular/core';
import { DbService } from './db.service';
import { ActivityMessage } from '../models/activity.model';

// Persisted so a page refresh keeps the badges (unread finishes) and so the
// activity backlog isn't re-counted as "new" every time we (re)connect.
const LS_UNREAD = 'asv.sessionActivity.unread';
const LS_PROCESSED = 'asv.sessionActivity.processed';
const PROCESSED_CAP = 400;   // keep the processed-id set bounded
const RECONNECT_MS = 5000;

// A "Claude done" notification carries the finishing tmux session name on its own
// body line, e.g. `tmux: claude-br-042`. That's the join key back to a terminal
// session. The done event is also tagged white_check_mark by the notifier.
const TMUX_LINE = /^\s*tmux:\s*(\S+)\s*$/m;

function sessionOf(ev: ActivityMessage): string {
  const m = TMUX_LINE.exec(ev.message || '');
  return m ? m[1] : '';
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
 * Tracks which Claude terminal sessions have finished a turn since you last
 * opened them, so the UI can show a "notification" badge until you look.
 *
 * A single app-wide WebSocket to /api/activity (the same ntfy mirror the Activity
 * page reads) stays connected for the life of the app — independent of which page
 * is showing — so finishes accumulate in the background. Each "Claude done" event
 * names the finishing tmux session on a `tmux:` body line; we flag that session as
 * unread and clear it when the user selects/opens it.
 */
@Injectable({ providedIn: 'root' })
export class SessionActivityService {
  private db = inject(DbService);

  // tmux session names (e.g. claude-br-042) with an unseen finish.
  private unreadSet = signal<Set<string>>(loadSet(LS_UNREAD));
  // ntfy message ids already accounted for — stops the reconnect/refresh backlog
  // from re-flagging a finish we've already surfaced (or baselined at startup).
  private processed = loadSet(LS_PROCESSED);

  /** Number of sessions with an unseen finish (for an aggregate badge). */
  readonly count = computed(() => this.unreadSet().size);

  private ws?: WebSocket;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  // The very first backlog after startup is a baseline: historical finishes are
  // recorded as processed but NOT flagged, so opening the app doesn't light up
  // every session that ever finished. Live messages after that do flag.
  private baselined = false;

  constructor() { this.connect(); }

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
      const baseline = !this.baselined;
      for (const e of msg.events) this.consume(e, baseline);
      this.baselined = true;
      persistSet(LS_PROCESSED, this.processed);
    } else if (msg.type === 'message' && msg.event) {
      this.consume(msg.event, false);
      persistSet(LS_PROCESSED, this.processed);
    }
  }

  private consume(ev: ActivityMessage, baselineOnly: boolean): void {
    if (!ev?.id || this.processed.has(ev.id)) return;
    this.processed.add(ev.id);
    capSet(this.processed, PROCESSED_CAP);
    if (baselineOnly || !isDone(ev)) return;
    const session = sessionOf(ev);
    if (session) this.flag(session);
  }
}
