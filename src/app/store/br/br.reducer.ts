import { createFeature, createReducer, on } from '@ngrx/store';
import { BusinessRule, BrPosition, BrHighlight } from '../../models/business-rule.model';
import { BrActions } from './br.actions';

export interface BrState {
  rules: BusinessRule[];
  positions: Record<string, BrPosition>;
  loaded: boolean;
  loading: boolean;
  error: string | null;
  selectedBrId: string | null;
  highlight: BrHighlight | null;
}

const initialState: BrState = {
  rules: [],
  positions: {},
  loaded: false,
  loading: false,
  error: null,
  selectedBrId: null,
  highlight: null,
};

// ── Layout ────────────────────────────────────────────────────────────────
// Vertical position follows development order: earliest / most-relevant rules
// (lowest UC, lowest seq) sit at the top; each subsequent UC band drops down
// and drifts slightly right, so dependents cascade down-and-to-the-right.
// Saved positions always win; only rules without one get auto-placed, so
// hand-adjusted layout survives regeneration.
const UC_V_GAP = 190;    // vertical distance between UC bands
const NODE_H_GAP = 240;  // horizontal distance between rules within a band
const UC_DRIFT = 48;     // rightward drift per UC band
const ORIGIN_X = 60;
const ORIGIN_Y = 60;

export function computeLayout(
  rules: BusinessRule[],
  saved: Record<string, BrPosition>,
): Record<string, BrPosition> {
  const positions: Record<string, BrPosition> = {};
  const ucs = [...new Set(rules.map((r) => r.uc))].sort((a, b) => {
    const minA = Math.min(...rules.filter((r) => r.uc === a).map((r) => r.seq));
    const minB = Math.min(...rules.filter((r) => r.uc === b).map((r) => r.seq));
    return minA - minB;
  });
  ucs.forEach((uc, u) => {
    const band = rules.filter((r) => r.uc === uc).sort((a, b) => a.seq - b.seq);
    band.forEach((r, i) => {
      positions[r.id] = saved[r.id] ?? {
        x: ORIGIN_X + i * NODE_H_GAP + u * UC_DRIFT,
        y: ORIGIN_Y + u * UC_V_GAP,
      };
    });
  });
  return positions;
}

export const brFeature = createFeature({
  name: 'br',
  reducer: createReducer(
    initialState,
    on(BrActions.loadGraph, (state) => ({ ...state, loading: true, error: null })),
    on(BrActions.loadGraphSuccess, (state, { rules, positions }) => ({
      ...state,
      rules,
      positions: computeLayout(rules, positions),
      loaded: true,
      loading: false,
    })),
    on(BrActions.loadGraphFailure, (state, { error }) => ({ ...state, loading: false, error })),
    on(BrActions.setPosition, (state, { id, x, y }) => ({
      ...state,
      positions: { ...state.positions, [id]: { x, y } },
    })),
    on(BrActions.relayout, (state) => ({ ...state, positions: computeLayout(state.rules, {}) })),
    on(BrActions.selectBr, (state, { id }) => ({ ...state, selectedBrId: id })),
    on(BrActions.setHighlight, (state, { highlight }) => ({ ...state, highlight })),
    on(BrActions.clearHighlight, (state) => ({ ...state, highlight: null })),
  ),
});
