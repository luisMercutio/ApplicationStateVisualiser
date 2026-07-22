import { createSelector } from '@ngrx/store';
import { connectionsFeature } from './connections.reducer';

export const {
  selectConnectionsState,
  selectItems: selectConnections,
  selectActiveId,
  selectStoreReady,
  selectStoreError,
  selectLoading: selectConnectionsLoading,
} = connectionsFeature;

export const selectActiveConnection = createSelector(
  selectConnections,
  selectActiveId,
  (items, activeId) => items.find(c => c.id === activeId) ?? null,
);
