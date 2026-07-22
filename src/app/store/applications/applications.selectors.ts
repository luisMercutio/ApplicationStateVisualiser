import { createSelector } from '@ngrx/store';
import { applicationsFeature } from './applications.reducer';

export const {
  selectApplicationsState,
  selectItems: selectApplications,
  selectActiveId,
  selectStoreReady,
  selectStoreError,
  selectLoading: selectApplicationsLoading,
} = applicationsFeature;

export const selectActiveApplication = createSelector(
  selectApplications,
  selectActiveId,
  (items, activeId) => items.find(c => c.id === activeId) ?? null,
);
