import { createFeature, createReducer, on } from '@ngrx/store';
import { LayoutsActions } from './layouts.actions';

export interface LayoutsState {
  names: string[];
  activeLayout: string | null;
  saving: boolean;
  error: string | null;
}

const initialState: LayoutsState = {
  names: [],
  activeLayout: null,
  saving: false,
  error: null,
};

export const layoutsFeature = createFeature({
  name: 'layouts',
  reducer: createReducer(
    initialState,
    on(LayoutsActions.loadLayoutsSuccess, (state, { names }) => ({ ...state, names })),
    on(LayoutsActions.applyLayout, (state, { name }) => ({ ...state, activeLayout: name })),
    on(LayoutsActions.saveLayout, (state) => ({ ...state, saving: true, error: null })),
    on(LayoutsActions.saveLayoutSuccess, (state, { name }) => ({ ...state, saving: false, activeLayout: name })),
    on(LayoutsActions.saveLayoutFailure, (state, { error }) => ({ ...state, saving: false, error })),
    on(LayoutsActions.deleteLayoutSuccess, (state, { name }) => ({
      ...state,
      names: state.names.filter(n => n !== name),
      activeLayout: state.activeLayout === name ? null : state.activeLayout,
    })),
    on(LayoutsActions.deleteLayoutFailure, (state, { error }) => ({ ...state, error })),
  ),
});