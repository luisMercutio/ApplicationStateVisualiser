import { createSelector } from '@ngrx/store';
import { TechnicalSpec } from '../../models/technical-spec.model';
import { technicalSpecsFeature } from './technical-specs.reducer';

export const {
  selectTechnicalSpecsState,
  selectSpecs,
  selectLoading: selectTechnicalSpecsLoading,
  selectError: selectTechnicalSpecsError,
  selectConnectionId: selectTechnicalSpecsConnectionId,
} = technicalSpecsFeature;

/** The spec attached to each business_rule id (at most one per BR). */
export const selectSpecByRuleId = createSelector(
  selectSpecs,
  (specs): Record<string, TechnicalSpec> => {
    const byRule: Record<string, TechnicalSpec> = {};
    for (const s of specs) byRule[s.businessRuleId] = s;
    return byRule;
  },
);

/** Count of technical-spec entries per business_rule id (= entries.length). */
export const selectSpecEntryCountByRule = createSelector(
  selectSpecs,
  (specs): Record<string, number> => {
    const counts: Record<string, number> = {};
    for (const s of specs) counts[s.businessRuleId] = s.entries.length;
    return counts;
  },
);
