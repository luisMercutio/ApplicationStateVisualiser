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

  // The Business Rule (its creationIndex) the Diagram view should focus on. The
  // BR Diagram page has no input binding (hosted by the app-shell @switch), so a
  // signal here is how the chosen rule reaches it. Read reactively by the view.
  private readonly brDiagram = signal<string>('');
  readonly brDiagramId = this.brDiagram.asReadonly();

  // The Business Rule (its creationIndex) the Tech Specs page should focus on.
  // The Tech Specs page shows exactly one BR's technical spec at a time; the
  // chosen rule reaches it through this signal (same pattern as the Diagram view).
  private readonly techSpec = signal<string>('');
  readonly techSpecBrId = this.techSpec.asReadonly();

  // Switch to the Terminal page focused on `session`.
  openTerminal(session: string): void {
    this.terminalSession.set(session);
    this.page.set('terminal');
  }

  // Switch to the per-BR Diagram page focused on the rule `brId` (its creationIndex).
  openBrDiagram(brId: string): void {
    this.brDiagram.set(brId);
    this.page.set('br-diagram');
  }

  // Switch to the Tech Specs page focused on the rule `brId` (its creationIndex).
  openTechnicalSpec(brId: string): void {
    this.techSpec.set(brId);
    this.page.set('technical-specs');
  }

  // Read the requested session and clear it, so it only takes effect once.
  takeTerminalSession(): string {
    const s = this.terminalSession();
    if (s) this.terminalSession.set('');
    return s;
  }
}
