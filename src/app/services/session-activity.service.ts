import { Injectable, computed, inject, signal } from '@angular/core';
import { DbService } from './db.service';
import { FileService } from './file.service';

// Persisted so a page refresh keeps the badges (unread finishes).
const LS_UNREAD = 'asv.sessionActivity.unread';
const RECONNECT_MS = 5000;
const KNOWN_REFRESH_MS = 15000;

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

/**
 * Tracks which terminal (tmux) sessions have finished a Claude turn since you last
 * opened them, so the UI can show a "notification" badge until you look.
 *
 * The badge is driven by an EXACT signal, not by guessing: a Stop hook running
 * inside the tmux session POSTs its session name (`tmux display-message -p '#S'`)
 * to /api/session-finished, which the server rebroadcasts over the /api/activity
 * WebSocket as a `session-finished` frame. We flag that session name verbatim —
 * no directory/tmux-name correlation, so the mismatch class of bug is gone.
 *
 * The same WebSocket also carries the ntfy activity mirror (`message`/`backlog`
 * frames); those belong to the Activity page and are ignored here. A session name
 * that's no longer live is pruned by reconcileUnread() so a killed/renamed session
 * can't keep the aggregate nav badge lit forever (BR-085).
 */
@Injectable({ providedIn: 'root' })
export class SessionActivityService {
  private db = inject(DbService);
  private file = inject(FileService);

  // tmux session names (as the picker lists them) with an unseen finish.
  private unreadSet = signal<Set<string>>(loadSet(LS_UNREAD));
  // Live tmux session names, refreshed periodically. A signal so `count` reacts to
  // it: the aggregate badge must only count finishes for sessions that are still
  // live — those are exactly the ones the picker offers a menu item for, so opening
  // one there decrements the badge. A finish for a session no longer listed has no
  // way to be cleared and must not inflate the badge (that was the "stuck at 1" bug).
  private knownSessions = signal<string[]>([]);

  /**
   * Number of lately-finished sessions still live enough to appear in the picker —
   * i.e. the sum of the per-session notifications shown there. Bounding it to live
   * sessions keeps the badge == the openable notifications, so opening a session
   * from the picker menu always decrements it and it can reach 0. (BR-085)
   */
  readonly count = computed(() => {
    const unread = this.unreadSet();
    if (!unread.size) return 0;
    const live = new Set(this.knownSessions().map(s => s.toLowerCase()));
    let n = 0;
    for (const s of unread) if (live.has(s.toLowerCase())) n++;
    return n;
  });

  // Sessions currently attached in an open terminal panel, ref-counted so several
  // panels viewing the same session don't detach it prematurely. A finish for an
  // attached session raises no notification — the user is already watching it. (BR-088)
  private attached = new Map<string, number>();

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

  /**
   * Register that a terminal panel is now attached to (viewing) this session.
   * While attached, finishes for it raise no notification, and any pending one is
   * cleared, because the user is already watching it complete. (BR-088)
   */
  attach(session: string): void {
    if (!session) return;
    this.attached.set(session, (this.attached.get(session) ?? 0) + 1);
    this.markOpened(session);
  }

  /** Register that a terminal panel detached from this session (closed or switched). */
  detach(session: string): void {
    if (!session) return;
    const n = (this.attached.get(session) ?? 0) - 1;
    if (n > 0) this.attached.set(session, n);
    else this.attached.delete(session);
  }

  private isAttached(session: string): boolean {
    for (const s of this.attached.keys()) {
      if (s.toLowerCase() === session.toLowerCase()) return true;
    }
    return false;
  }

  private flag(session: string): void {
    // A panel is attached to this session — the user is watching it finish, so it's
    // already seen; don't raise a notification. (BR-088)
    if (this.isAttached(session)) return;
    // The finish came from a Stop hook running *inside* this tmux session, so the
    // session is live right now even if our cached list hasn't refreshed yet. Seed
    // it into the live set so the badge (which only counts live sessions) reflects
    // the finish immediately rather than up to KNOWN_REFRESH_MS later.
    if (!this.knownSessions().some(s => s.toLowerCase() === session.toLowerCase())) {
      this.knownSessions.set([...this.knownSessions(), session]);
    }
    const set = this.unreadSet();
    if (set.has(session)) return;
    const next = new Set(set);
    next.add(session);
    this.unreadSet.set(next);
    persistSet(LS_UNREAD, next);
  }

  private refreshKnown(): void {
    this.file.getTmuxSessions().subscribe({
      next: ({ sessions }) => { this.knownSessions.set(sessions ?? []); this.reconcileUnread(); },
      error: () => { /* keep the last known list; try again next tick */ },
    });
  }

  // Drop unread flags whose session is no longer live: a killed/renamed session
  // never re-appears in the picker, so its badge could never be cleared by opening
  // it — yet it would keep the aggregate nav badge (count()) lit forever. Matching
  // is case-insensitive to tolerate any case drift in the tmux listing. (BR-085)
  private reconcileUnread(): void {
    const set = this.unreadSet();
    if (!set.size) return;
    const live = new Set(this.knownSessions().map(s => s.toLowerCase()));
    const next = new Set([...set].filter(s => live.has(s.toLowerCase())));
    if (next.size === set.size) return;
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
    let msg: { type?: string; session?: string };
    try { msg = JSON.parse(ev.data); } catch { return; }
    // Exact, hook-driven finish signal — the only thing that flags a badge.
    // ntfy `message`/`backlog` frames on this socket belong to the Activity page.
    if (msg.type === 'session-finished' && msg.session) this.flag(msg.session);
    // A session was closed via the Terminal Exit button — clear its badge at once
    // rather than waiting for reconcileUnread() to notice it left the live list.
    else if (msg.type === 'session-exited' && msg.session) this.markOpened(msg.session);
  }
}
