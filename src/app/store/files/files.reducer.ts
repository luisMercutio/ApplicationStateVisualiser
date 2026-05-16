import { createFeature, createReducer, on } from '@ngrx/store';
import { FilesActions } from './files.actions';

export interface FilesState {
  cache: Record<string, string>;
  loading: Record<string, boolean>;
  errors: Record<string, string>;
}

const initialState: FilesState = {
  cache: {},
  loading: {},
  errors: {},
};

export const filesFeature = createFeature({
  name: 'files',
  reducer: createReducer(
    initialState,
    on(FilesActions.loadFile, (state, { path }) =>
      path in state.cache
        ? state
        : { ...state, loading: { ...state.loading, [path]: true }, errors: { ...state.errors, [path]: '' } }
    ),
    on(FilesActions.loadFileSuccess, (state, { path, content }) => ({
      ...state,
      cache: { ...state.cache, [path]: content },
      loading: { ...state.loading, [path]: false },
    })),
    on(FilesActions.loadFileFailure, (state, { path, error }) => ({
      ...state,
      loading: { ...state.loading, [path]: false },
      errors: { ...state.errors, [path]: error },
    })),
    on(FilesActions.clearCache, () => initialState),
  ),
});
