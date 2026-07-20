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

// A live Claude session spawned by "Submit with Claude": a tmux session running
// the claude CLI in a per-BR git worktree. `running` is derived from tmux; the
// BR/branch/worktree join is filled in client-side from the rule's delta.
export interface ClaudeSession {
  name: string;              // tmux session name, e.g. claude-br-042
  running: boolean;
  brName?: string;
  branch?: string;
  worktree?: string;
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
