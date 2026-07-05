import { createFeature, createReducer, on } from '@ngrx/store';
import { RuleEntry } from '../../models/rule-index.model';
import { RulesActions } from './rules.actions';

export interface RulesState {
  entries: RuleEntry[];
  activeFeature: string | null; // null = whole application (fold everything)
  loaded: boolean;
  loading: boolean;
  error: string | null;
}

const initialState: RulesState = {
  entries: [],
  activeFeature: null,
  loaded: false,
  loading: false,
  error: null,
};

export const rulesFeature = createFeature({
  name: 'rules',
  reducer: createReducer(
    initialState,
    on(RulesActions.loadRules, (state) => ({ ...state, loading: true, error: null })),
    on(RulesActions.loadRulesSuccess, (state, { entries }) => ({
      ...state, entries, loaded: true, loading: false,
    })),
    on(RulesActions.loadRulesFailure, (state, { error }) => ({ ...state, loading: false, error })),
    on(RulesActions.setActiveFeature, (state, { feature }) => ({ ...state, activeFeature: feature })),
  ),
});
