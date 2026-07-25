// Epics + Business Rules as stored in each registered application's OWN database.
// The viewer reads/writes these through the active connection: switching the
// active connection switches which application's epics/BRs are shown. Mirrors the
// db-store.js DTOs (arrays/objects are JSON columns there, plain values here).

export interface Epic {
  id: string;
  key: string | null;         // optional human key, e.g. "EPIC-001"
  title: string;
  description: string | null;
  seq: string | null;         // Dewey-ish ordering string
  createdAt: string;
  updatedAt: string;
}

export interface EpicInput {
  key?: string | null;
  title: string;
  description?: string | null;
  seq?: string | null;
}

// A Business Rule row. Fields mirror the file-based RuleEntry so the two BR
// worlds stay convertible; `epicId` groups a rule under an Epic.
export interface AppBusinessRule {
  creationIndex: string;      // stable identity (UUID), assigned at creation
  name: string;               // slug / human id, unique per application
  epicId: string | null;
  executionOrder: number | null; // global ordering; drives display + drag-drop
  rule: string;
  rationale: string | null;
  category: string | null;
  features: string[];
  modifiesFeatures: string[];
  dependsOn: string[];
  touches: Record<string, string[]>;
  delta: Record<string, unknown>;
  needsToBeEstablished: boolean; // handed to a Claude session, still to be built
  createdAt: string;
  updatedAt: string;
}

export interface AppBusinessRuleInput {
  name: string;
  epicId?: string | null;
  executionOrder?: number | null;
  rule: string;
  rationale?: string | null;
  category?: string | null;
  features?: string[];
  modifiesFeatures?: string[];
  dependsOn?: string[];
  touches?: Record<string, string[]>;
  delta?: Record<string, unknown>;
  needsToBeEstablished?: boolean;
}

// Any Claude session that ran in this repo — one row per saved transcript UUID,
// mirrored into .claude/conversations/ by the Stop/SessionEnd hook. These aren't
// tied to a Business Rule or a live tmux session: they survive closing the tmux
// window and can be viewed or resumed (claude --resume).
export interface RepoSession {
  id: string;                // session UUID (== claude --resume <id>)
  prefix: string;            // source working-tree basename (repo name or BR slug)
  file: string;              // <prefix>__<id>.jsonl in .claude/conversations/
  title: string | null;     // first user prompt (or transcript summary)
  turns: number;            // prompt/answer turn count
  startedAt: string | null;  // first transcript timestamp
  lastAt: string | null;     // last transcript timestamp
  cwd: string | null;
  gitBranch: string | null;
  savedAt: string;           // transcript file mtime (ISO)
}

// One turn of a Claude conversation, reduced to prompt/answer only (thinking and
// tool calls stripped) by the server from the archived transcript JSONL.
export interface ConversationMessage {
  role: 'user' | 'assistant';
  text: string;
  at: string | null;        // ISO timestamp, when the transcript carried one
}

// Extra, agent-facing context attached to one Business Rule. During development
// these descriptions are loaded into the developer agents once the BR under
// development has reached (executionOrder >=) the referenced BR.
// `brName`/`brExecutionOrder` are the referenced rule, joined server-side for display.
export interface BrAgentInfo {
  id: string;
  businessRuleId: string;
  description: string;
  brName: string | null;
  brExecutionOrder: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface BrAgentInfoInput {
  businessRuleId: string;
  description: string;
}

// A point-in-time snapshot of the whole Epic + Business Rule set for the active
// application. The list view carries only metadata; the full snapshot embeds the
// frozen epics/rules DTO arrays so it can be diffed against the live set. Frozen
// data — never mutated after capture.
export interface BrSnapshotMeta {
  id: string;
  label: string;
  epicCount: number;
  ruleCount: number;
  createdAt: string;
}

export interface BrSnapshot extends BrSnapshotMeta {
  epics: Epic[];
  rules: AppBusinessRule[];
}

export interface BrSnapshotInput {
  label: string;
}
