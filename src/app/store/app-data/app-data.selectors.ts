import { createSelector } from '@ngrx/store';
import { appDataFeature } from './app-data.reducer';

export const {
  selectAppDataState,
  selectEpics,
  selectRules: selectAppRules,
  selectLoading: selectAppDataLoading,
  selectError: selectAppDataError,
  selectConnectionId: selectAppDataConnectionId,
} = appDataFeature;

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
