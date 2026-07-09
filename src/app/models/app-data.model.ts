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
  id: string;
  name: string;               // slug / human id, unique per application
  epicId: string | null;
  seq: string | null;
  rule: string;
  rationale: string | null;
  category: string | null;
  features: string[];
  modifiesFeatures: string[];
  dependsOn: string[];
  touches: Record<string, string[]>;
  delta: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface AppBusinessRuleInput {
  name: string;
  epicId?: string | null;
  seq?: string | null;
  rule: string;
  rationale?: string | null;
  category?: string | null;
  features?: string[];
  modifiesFeatures?: string[];
  dependsOn?: string[];
  touches?: Record<string, string[]>;
  delta?: Record<string, unknown>;
}

// Extra, agent-facing context attached to one Business Rule. During development
// these descriptions are loaded into the developer agents once the BR under
// development has reached (seq >=) the referenced BR. `brName`/`brSeq` are the
// referenced rule, joined server-side for display.
export interface BrAgentInfo {
  id: string;
  businessRuleId: string;
  description: string;
  brName: string | null;
  brSeq: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BrAgentInfoInput {
  businessRuleId: string;
  description: string;
}
