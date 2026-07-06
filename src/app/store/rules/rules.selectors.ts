import { createSelector } from '@ngrx/store';
import { rulesFeature } from './rules.reducer';
import { featuresInOrder, featureCut, foldTo } from '../../models/rule-index.model';

export const {
  selectRulesState,
  selectEntries: selectRuleEntries,
  selectActiveFeature,
  selectLoading: selectRulesLoading,
  selectLoaded: selectRulesLoaded,
  selectError: selectRulesError,
} = rulesFeature;

export const selectFeatures = createSelector(selectRuleEntries, (entries) => featuresInOrder(entries));

/** Legacy UC id → feature name — lets the BR Net (grouped by UC) set the Active Feature. */
export const selectUcToFeature = createSelector(selectRuleEntries, (entries) => {
  const m: Record<string, string> = {};
  for (const e of entries) if (e.legacyUc && e.features?.[0]) m[e.legacyUc] = e.features[0];
  return m;
});

/** The seq cut for the active feature (or the whole app when none is active). */
export const selectCutSeq = createSelector(selectRuleEntries, selectActiveFeature, (entries, feature) => {
  if (feature) return featureCut(entries, feature);
  return '999999'; // sentinel above any Dewey seq → "whole application"
});

/** The composed application state at the active cut — the fold of all deltas. */
export const selectComposedState = createSelector(selectRuleEntries, selectCutSeq, (entries, cut) =>
  foldTo(entries, cut),
);
