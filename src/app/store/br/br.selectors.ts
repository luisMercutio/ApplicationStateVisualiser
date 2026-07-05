import { createSelector } from '@ngrx/store';
import { brFeature } from './br.reducer';
import { BusinessRule } from '../../models/business-rule.model';

export const {
  selectBrState,
  selectRules: selectBrRules,
  selectPositions: selectBrPositions,
  selectLoading: selectBrLoading,
  selectLoaded: selectBrLoaded,
  selectError: selectBrError,
  selectSelectedBrId,
  selectHighlight: selectBrHighlight,
} = brFeature;

export const selectBrById = createSelector(selectBrRules, (rules) => {
  const map: Record<string, BusinessRule> = {};
  for (const r of rules) map[r.id] = r;
  return map;
});

/** Directed prerequisite edges: from a prerequisite rule -> the rule that needs it. */
export const selectBrEdges = createSelector(selectBrRules, selectBrById, (rules, byId) => {
  const edges: Array<{ from: string; to: string }> = [];
  for (const r of rules) {
    for (const dep of r.dependsOn ?? []) {
      if (byId[dep]) edges.push({ from: dep, to: r.id });
    }
  }
  return edges;
});

export const selectSelectedBr = createSelector(
  selectSelectedBrId,
  selectBrById,
  (id, byId) => (id ? byId[id] ?? null : null),
);

/** Transitive closure (ancestors + descendants + self) of the selected rule —
 * the connected sub-net highlighted in colour when a rule is selected. */
export const selectConnectedBrIds = createSelector(
  selectSelectedBrId,
  selectBrEdges,
  (selected, edges): Set<string> => {
    if (!selected) return new Set();
    const upstream = new Map<string, string[]>();   // to -> [from]
    const downstream = new Map<string, string[]>(); // from -> [to]
    for (const e of edges) {
      (upstream.get(e.to) ?? upstream.set(e.to, []).get(e.to)!).push(e.from);
      (downstream.get(e.from) ?? downstream.set(e.from, []).get(e.from)!).push(e.to);
    }
    const result = new Set<string>([selected]);
    const walk = (start: string, adj: Map<string, string[]>) => {
      const stack = [start];
      while (stack.length) {
        const n = stack.pop()!;
        for (const next of adj.get(n) ?? []) {
          if (!result.has(next)) { result.add(next); stack.push(next); }
        }
      }
    };
    walk(selected, upstream);
    walk(selected, downstream);
    return result;
  },
);
