// A Technical Specification is a per-Business-Rule parent entity describing how
// that ONE rule is implemented. It owns two child collections: `entries`
// (implementation instructions, authored by a user or an agent) and `artifacts`
// (the generated file changes that realise the rule). Mirrors the db-store.js
// DTOs; `brName`/`brSeq` are the referenced rule, joined server-side for display.

export type SpecSource = 'user' | 'agent';
export type SpecChangeType = 'add' | 'modify' | 'remove';

export interface TechnicalSpecEntry {
  id: string;
  technicalSpecificationId: string;
  description: string;
  source: SpecSource;
  createdAt: string;
  updatedAt: string;
}

export interface TechnicalSpecArtifact {
  id: string;
  technicalSpecificationId: string;
  kind: string;
  path: string;
  changeType: SpecChangeType;
  summary: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TechnicalSpec {
  id: string;
  businessRuleId: string;
  title: string | null;
  overview: string | null;
  status: string;
  brName: string | null;
  brSeq: string | null;
  entries: TechnicalSpecEntry[];
  artifacts: TechnicalSpecArtifact[];
  createdAt: string;
  updatedAt: string;
}

export interface TechnicalSpecInput {
  businessRuleId?: string;
  title?: string | null;
  overview?: string | null;
  status?: string;
}

export interface TechnicalSpecEntryInput {
  description: string;
  source: SpecSource;
}

export interface TechnicalSpecArtifactInput {
  kind: string;
  path: string;
  changeType: SpecChangeType;
  summary?: string | null;
}
