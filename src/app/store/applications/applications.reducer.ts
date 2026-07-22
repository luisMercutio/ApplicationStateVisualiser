import { createFeature, createReducer, on } from '@ngrx/store';
import { ApplicationsActions } from './applications.actions';
import { Application } from '../../models/application.model';

export interface ApplicationsState {
  items: Application[];
  activeId: string | null;
  storeReady: boolean;
  storeError: string | null;
  loading: boolean;
  error: string | null;
}

const initialState: ApplicationsState = {
  items: [],
  activeId: null,
  storeReady: false,
  storeError: null,
  loading: false,
  error: null,
};

function upsert(items: Application[], app: Application): Application[] {
  const idx = items.findIndex(c => c.id === app.id);
  const next = idx >= 0 ? items.map(c => (c.id === app.id ? app : c)) : [...items, app];
  return next.sort((a, b) => a.name.localeCompare(b.name));
}

export const applicationsFeature = createFeature({
  name: 'applications',
  reducer: createReducer(
    initialState,
    on(ApplicationsActions.loadApplications, (state) => ({ ...state, loading: true, error: null })),
    on(ApplicationsActions.loadApplicationsSuccess, (state, { applications, activeId, storeReady, storeError }) => ({
      ...state,
      items: applications,
      // Drop a stale active id if the application it pointed at is gone.
      activeId: applications.some(c => c.id === activeId) ? activeId : null,
      storeReady,
      storeError,
      loading: false,
    })),
    on(ApplicationsActions.loadApplicationsFailure, (state, { error }) => ({ ...state, loading: false, error })),

    on(ApplicationsActions.createApplicationSuccess, (state, { application }) => ({
      ...state, items: upsert(state.items, application), error: null,
    })),
    on(ApplicationsActions.updateApplicationSuccess, (state, { application }) => ({
      ...state, items: upsert(state.items, application), error: null,
    })),
    on(ApplicationsActions.deleteApplicationSuccess, (state, { id }) => ({
      ...state,
      items: state.items.filter(c => c.id !== id),
      activeId: state.activeId === id ? null : state.activeId,
    })),

    on(ApplicationsActions.setActiveSuccess, (state, { activeId }) => ({ ...state, activeId })),

    on(
      ApplicationsActions.createApplicationFailure,
      ApplicationsActions.updateApplicationFailure,
      ApplicationsActions.deleteApplicationFailure,
      ApplicationsActions.setActiveFailure,
      (state, { error }) => ({ ...state, error }),
    ),
  ),
});
