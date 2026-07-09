import { createSelector } from '@ngrx/store';
import { appDataFeature } from './app-data.reducer';

export const {
  selectAppDataState,
  selectEpics,
  selectRules: selectAppRules,
  selectAgentInfo,
  selectLoading: selectAppDataLoading,
  selectError: selectAppDataError,
  selectConnectionId: selectAppDataConnectionId,
} = appDataFeature;

/** Count of agent-info entries per business_rule id. */
export const selectAgentInfoCountByRule = createSelector(
  selectAgentInfo,
  (info) => {
    const counts: Record<string, number> = {};
    for (const i of info) counts[i.businessRuleId] = (counts[i.businessRuleId] ?? 0) + 1;
    return counts;
  },
);

/** Epics with their member rules attached, plus an "(ungrouped)" bucket. */
export const selectEpicsWithRules = createSelector(
  selectEpics,
  selectAppRules,
  (epics, rules) => {
    const grouped = epics.map(epic => ({
      epic,
      rules: rules.filter(r => r.epicId === epic.id),
    }));
    const ungrouped = rules.filter(r => !r.epicId);
    return { grouped, ungrouped };
  },
);
