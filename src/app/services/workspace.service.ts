import { Injectable, signal } from '@angular/core';
import { AppPage } from '../models/app-page.model';

// Owns the active top-level page and a one-shot "open the Terminal on this session"
// channel, so any view can drive navigation. The Terminal view is hosted by the
// app-shell @switch with no input binding, so a signal here is how a requested
// session reaches it. Root singleton.
@Injectable({ providedIn: 'root' })
export class WorkspaceService {
  // Source of truth for which page the shell shows (app.component binds to this).
  readonly page = signal<AppPage>('br-list');

  // The tmux session the Terminal view should attach to on its next open. Consumed
  // once (see takeTerminalSession) so a later plain navigation doesn't reattach.
  private readonly terminalSession = signal<string>('');

  // Switch to the Terminal page focused on `session`.
  openTerminal(session: string): void {
    this.terminalSession.set(session);
    this.page.set('terminal');
  }

  // Read the requested session and clear it, so it only takes effect once.
  takeTerminalSession(): string {
    const s = this.terminalSession();
    if (s) this.terminalSession.set('');
    return s;
  }
}
