import { createFeature, createReducer, on } from '@ngrx/store';
import { MethodologyFileMeta } from '../../models/methodology-file.model';
import { MethodologyActions } from './methodology.actions';

export interface MethodologyState {
  files: MethodologyFileMeta[];
  selectedKey: string | null;
  original: Record<string, string>; // last loaded/saved content, keyed by kind/name
  draft: Record<string, string>;    // in-editor content
  loading: Record<string, boolean>;
  saving: Record<string, boolean>;
  error: string | null;
}

const initialState: MethodologyState = {
  files: [],
  selectedKey: null,
  original: {},
  draft: {},
  loading: {},
  saving: {},
  error: null,
};

export const methodologyFeature = createFeature({
  name: 'methodology',
  reducer: createReducer(
    initialState,
    on(MethodologyActions.loadFilesSuccess, (state, { files }) => ({ ...state, files, error: null })),
    on(MethodologyActions.loadFilesFailure, (state, { error }) => ({ ...state, error })),
    on(MethodologyActions.selectFile, (state, { key }) => ({ ...state, selectedKey: key })),
    on(MethodologyActions.loadFile, (state, { kind, name }) => ({
      ...state,
      loading: { ...state.loading, [`${kind}/${name}`]: true },
      error: null,
    })),
    on(MethodologyActions.loadFileSuccess, (state, { key, content }) => ({
      ...state,
      original: { ...state.original, [key]: content },
      draft: { ...state.draft, [key]: content },
      loading: { ...state.loading, [key]: false },
    })),
    on(MethodologyActions.loadFileFailure, (state, { key, error }) => ({
      ...state,
      loading: { ...state.loading, [key]: false },
      error,
    })),
    on(MethodologyActions.setDraft, (state, { key, content }) => ({
      ...state,
      draft: { ...state.draft, [key]: content },
    })),
    on(MethodologyActions.saveFile, (state, { kind, name }) => ({
      ...state,
      saving: { ...state.saving, [`${kind}/${name}`]: true },
      error: null,
    })),
    on(MethodologyActions.saveFileSuccess, (state, { key, content }) => ({
      ...state,
      original: { ...state.original, [key]: content },
      draft: { ...state.draft, [key]: content },
      saving: { ...state.saving, [key]: false },
    })),
    on(MethodologyActions.saveFileFailure, (state, { key, error }) => ({
      ...state,
      saving: { ...state.saving, [key]: false },
      error,
    })),
  ),
});
