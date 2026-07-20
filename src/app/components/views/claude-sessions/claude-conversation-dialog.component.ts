import { Component, OnInit, inject, signal } from '@angular/core';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { FileService } from '../../../services/file.service';
import { ConversationMessage } from '../../../models/app-data.model';

export interface ConversationDialogData {
  session: string;
  brName: string | null;
}

// Read-only view of a session's archived conversation, prompt/answer only (the
// server strips thinking and tool calls). Opened from the Claude Sessions row menu.
@Component({
  selector: 'app-claude-conversation-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule],
  template: `
    <div class="cc-head">
      <div class="cc-titles">
        <div class="cc-title">{{ data.brName ?? data.session }}</div>
        <div class="cc-sub mono">{{ data.session }}</div>
      </div>
      <span class="spacer"></span>
      <button mat-icon-button (click)="ref.close()" aria-label="Close"><mat-icon>close</mat-icon></button>
    </div>

    <div class="cc-body" mat-dialog-content>
      @if (loading()) {
        <div class="cc-msg"><mat-spinner diameter="26"></mat-spinner> Loading conversation…</div>
      } @else if (error(); as e) {
        <div class="cc-msg err">{{ e }}</div>
      } @else if (!messages().length) {
        <div class="cc-msg">This transcript has no prompt/answer turns yet.</div>
      } @else {
        @for (m of messages(); track $index) {
          <div class="turn" [class.user]="m.role === 'user'" [class.assistant]="m.role === 'assistant'">
            <div class="who">{{ m.role === 'user' ? 'You' : 'Claude' }}</div>
            <div class="text">{{ m.text }}</div>
          </div>
        }
      }
    </div>
  `,
  styles: [`
    :host { display: flex; flex-direction: column; max-height: 80vh; }
    .cc-head { display: flex; align-items: center; gap: 8px; padding: 10px 14px; border-bottom: 1px solid #e6e6e6; }
    .cc-title { font-weight: 600; font-size: 15px; color: #222; }
    .cc-sub { font-size: 11px; color: #999; } .mono { font-family: monospace; }
    .spacer { flex: 1; }
    .cc-body { padding: 12px 14px; overflow-y: auto; }
    .cc-msg { display: flex; align-items: center; gap: 10px; padding: 24px; color: #999; justify-content: center; }
    .cc-msg.err { color: #c62828; }
    .turn { margin-bottom: 12px; max-width: 88%; }
    .turn.user { margin-left: auto; text-align: right; }
    .turn .who { font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: #9e9e9e; margin-bottom: 3px; }
    .turn .text { display: inline-block; text-align: left; white-space: pre-wrap; word-break: break-word;
                  font-size: 13px; line-height: 1.5; padding: 8px 11px; border-radius: 10px; }
    .turn.user .text { background: #ede7f6; color: #4a148c; }
    .turn.assistant .text { background: #f4f4f6; color: #222; }
  `],
})
export class ClaudeConversationDialogComponent implements OnInit {
  data = inject<ConversationDialogData>(MAT_DIALOG_DATA);
  ref = inject(MatDialogRef<ClaudeConversationDialogComponent>);
  private file = inject(FileService);

  loading = signal(true);
  error = signal<string | null>(null);
  messages = signal<ConversationMessage[]>([]);

  ngOnInit(): void {
    this.file.getClaudeConversation(this.data.session).subscribe({
      next: r => { this.messages.set(r.messages); this.loading.set(false); },
      error: err => { this.error.set(err?.error?.error ?? err?.message ?? 'Cannot load conversation'); this.loading.set(false); },
    });
  }
}
