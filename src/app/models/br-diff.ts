// Pure diff between a captured BR snapshot and the live (current) Epic + Business
// Rule set. Business Rules are matched by `creationIndex` (their stable identity),
// so a rename, reorder, epic reassignment or edit is tracked on the SAME row
// rather than reading as a delete + add. Epics are matched by `id`.
//
// The primary lens is ORDERING: `moved` flags a rule whose global executionOrder
// or owning epic changed — the reason snapshots exist here is to see how a
// reorder rearranged the rules. `modified` flags any content-field edit. A rule
// can be both.

import { AppBusinessRule, Epic } from './app-data.model';

export interface BrFieldChange {
  field: string;
  before: string;
  after: string;
}

export type BrChangeKind = 'added' | 'removed' | 'moved' | 'modified' | 'unchanged';

export interface BrDiffRow {
  creationIndex: string;
  name: string;
  /** Representative statement: the current rule for added/moved/modified/unchanged,
   *  the snapshot rule for removed. Shown for context in the diff view. */
  ruleText: string;
  /** Coarsest classification, for grouping/badge. A row that is both moved and
   *  modified reports 'moved' here (ordering is the headline) but sets both flags. */
  kind: BrChangeKind;
  moved: boolean;
  modified: boolean;
  beforeOrder: number | null;
  afterOrder: number | null;
  beforeEpic: string | null; // human label ("EPIC-003 · Title") or null / "Ungrouped"
  afterEpic: string | null;
  fieldChanges: BrFieldChange[]; // content edits (rule text, category, features, …)
}

export interface EpicDiffRow {
  id: string;
  label: string;
  kind: 'added' | 'removed' | 'renamed';
  changes: BrFieldChange[]; // for 'renamed': which of key/title/seq changed
}

export interface BrDiff {
  added: BrDiffRow[];
  removed: BrDiffRow[];
  changed: BrDiffRow[]; // present in both AND moved and/or modified, ordered by afterOrder
  unchanged: BrDiffRow[];
  epics: EpicDiffRow[];
  counts: { added: number; removed: number; moved: number; modified: number; unchanged: number; total: number };
}

function epicLabel(epicId: string | null, epics: Epic[]): string | null {
  if (!epicId) return 'Ungrouped';
  const e = epics.find((x) => x.id === epicId);
  if (!e) return 'Ungrouped';
  return e.key ? `${e.key} · ${e.title}` : e.title;
}

function arr(v: string[] | undefined | null): string {
  return (v ?? []).join(', ');
}

function obj(v: Record<string, unknown> | undefined | null): string {
  const o = v ?? {};
  const keys = Object.keys(o).sort();
  if (!keys.length) return '';
  return keys.map((k) => `${k}: ${JSON.stringify((o as Record<string, unknown>)[k])}`).join('; ');
}

/** Content fields (excludes epicId/executionOrder, which are the "moved" axes). */
function contentChanges(before: AppBusinessRule, after: AppBusinessRule): BrFieldChange[] {
  const out: BrFieldChange[] = [];
  const push = (field: string, b: string, a: string) => { if (b !== a) out.push({ field, before: b, after: a }); };
  push('name', before.name, after.name);
  push('rule', before.rule, after.rule);
  push('rationale', before.rationale ?? '', after.rationale ?? '');
  push('category', before.category ?? '', after.category ?? '');
  push('features', arr(before.features), arr(after.features));
  push('modifiesFeatures', arr(before.modifiesFeatures), arr(after.modifiesFeatures));
  push('dependsOn', arr(before.dependsOn), arr(after.dependsOn));
  push('touches', obj(before.touches), obj(after.touches));
  return out;
}

export function computeBrDiff(
  snapshot: { epics: Epic[]; rules: AppBusinessRule[] },
  current: { epics: Epic[]; rules: AppBusinessRule[] },
): BrDiff {
  const beforeRules = new Map(snapshot.rules.map((r) => [r.creationIndex, r]));
  const afterRules = new Map(current.rules.map((r) => [r.creationIndex, r]));

  const added: BrDiffRow[] = [];
  const removed: BrDiffRow[] = [];
  const changed: BrDiffRow[] = [];
  const unchanged: BrDiffRow[] = [];

  // Removed: in snapshot, gone from current.
  for (const b of snapshot.rules) {
    if (afterRules.has(b.creationIndex)) continue;
    removed.push({
      creationIndex: b.creationIndex, name: b.name, ruleText: b.rule, kind: 'removed', moved: false, modified: false,
      beforeOrder: b.executionOrder, afterOrder: null,
      beforeEpic: epicLabel(b.epicId, snapshot.epics), afterEpic: null, fieldChanges: [],
    });
  }

  // Added / moved / modified / unchanged: iterate current so ordering reads top-down.
  for (const a of current.rules) {
    const b = beforeRules.get(a.creationIndex);
    if (!b) {
      added.push({
        creationIndex: a.creationIndex, name: a.name, ruleText: a.rule, kind: 'added', moved: false, modified: false,
        beforeOrder: null, afterOrder: a.executionOrder,
        beforeEpic: null, afterEpic: epicLabel(a.epicId, current.epics), fieldChanges: [],
      });
      continue;
    }
    const beforeEpic = epicLabel(b.epicId, snapshot.epics);
    const afterEpic = epicLabel(a.epicId, current.epics);
    const moved = b.executionOrder !== a.executionOrder || b.epicId !== a.epicId;
    const fieldChanges = contentChanges(b, a);
    const modified = fieldChanges.length > 0;
    const row: BrDiffRow = {
      creationIndex: a.creationIndex, name: a.name, ruleText: a.rule,
      kind: moved ? 'moved' : modified ? 'modified' : 'unchanged',
      moved, modified,
      beforeOrder: b.executionOrder, afterOrder: a.executionOrder,
      beforeEpic, afterEpic, fieldChanges,
    };
    if (moved || modified) changed.push(row); else unchanged.push(row);
  }

  return {
    added, removed, changed, unchanged,
    epics: computeEpicDiff(snapshot.epics, current.epics),
    counts: {
      added: added.length,
      removed: removed.length,
      moved: changed.filter((r) => r.moved).length,
      modified: changed.filter((r) => r.modified).length,
      unchanged: unchanged.length,
      total: added.length + removed.length + changed.length + unchanged.length,
    },
  };
}

function computeEpicDiff(before: Epic[], after: Epic[]): EpicDiffRow[] {
  const beforeMap = new Map(before.map((e) => [e.id, e]));
  const afterMap = new Map(after.map((e) => [e.id, e]));
  const out: EpicDiffRow[] = [];
  for (const b of before) {
    if (!afterMap.has(b.id)) out.push({ id: b.id, label: b.key ? `${b.key} · ${b.title}` : b.title, kind: 'removed', changes: [] });
  }
  for (const a of after) {
    const b = beforeMap.get(a.id);
    if (!b) { out.push({ id: a.id, label: a.key ? `${a.key} · ${a.title}` : a.title, kind: 'added', changes: [] }); continue; }
    const changes: BrFieldChange[] = [];
    if ((b.key ?? '') !== (a.key ?? '')) changes.push({ field: 'key', before: b.key ?? '', after: a.key ?? '' });
    if (b.title !== a.title) changes.push({ field: 'title', before: b.title, after: a.title });
    if ((b.seq ?? '') !== (a.seq ?? '')) changes.push({ field: 'seq', before: b.seq ?? '', after: a.seq ?? '' });
    if (changes.length) out.push({ id: a.id, label: a.key ? `${a.key} · ${a.title}` : a.title, kind: 'renamed', changes });
  }
  return out;
}
