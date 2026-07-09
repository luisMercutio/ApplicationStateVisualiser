import { createFeature, createReducer, on } from '@ngrx/store';
import { ConnectionsActions } from './connections.actions';
import { DbConnection } from '../../models/db-connection.model';

export interface ConnectionsState {
  items: DbConnection[];
  activeId: string | null;
  storeReady: boolean;
  storeError: string | null;
  loading: boolean;
  error: string | null;
}

const initialState: ConnectionsState = {
  items: [],
  activeId: null,
  storeReady: false,
  storeError: null,
  loading: false,
  error: null,
};

function upsert(items: DbConnection[], conn: DbConnection): DbConnection[] {
  const idx = items.findIndex(c => c.id === conn.id);
  const next = idx >= 0 ? items.map(c => (c.id === conn.id ? conn : c)) : [...items, conn];
  return next.sort((a, b) => a.name.localeCompare(b.name));
}

export const connectionsFeature = createFeature({
  name: 'connections',
  reducer: createReducer(
    initialState,
    on(ConnectionsActions.loadConnections, (state) => ({ ...state, loading: true, error: null })),
    on(ConnectionsActions.loadConnectionsSuccess, (state, { connections, activeId, storeReady, storeError }) => ({
      ...state,
      items: connections,
      // Drop a stale active id if the profile it pointed at is gone.
      activeId: connections.some(c => c.id === activeId) ? activeId : null,
      storeReady,
      storeError,
      loading: false,
    })),
    on(ConnectionsActions.loadConnectionsFailure, (state, { error }) => ({ ...state, loading: false, error })),

    on(ConnectionsActions.createConnectionSuccess, (state, { connection }) => ({
      ...state, items: upsert(state.items, connection), error: null,
    })),
    on(ConnectionsActions.updateConnectionSuccess, (state, { connection }) => ({
      ...state, items: upsert(state.items, connection), error: null,
    })),
    on(ConnectionsActions.deleteConnectionSuccess, (state, { id }) => ({
      ...state,
      items: state.items.filter(c => c.id !== id),
      activeId: state.activeId === id ? null : state.activeId,
    })),

    on(ConnectionsActions.setActiveSuccess, (state, { activeId }) => ({ ...state, activeId })),

    on(
      ConnectionsActions.createConnectionFailure,
      ConnectionsActions.updateConnectionFailure,
      ConnectionsActions.deleteConnectionFailure,
      ConnectionsActions.setActiveFailure,
      (state, { error }) => ({ ...state, error }),
    ),
  ),
});
