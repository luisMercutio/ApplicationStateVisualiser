import { createFeature, createReducer, on } from '@ngrx/store';
import { FileTreeNode } from '../../models/uc.model';
import { ResourcesActions } from './resources.actions';

export interface ResourcesState {
  tree: FileTreeNode[];
  selectedPath: string | null;
  original: Record<string, string>; // last loaded/saved content
  draft: Record<string, string>;    // in-editor content
  loading: Record<string, boolean>;
  saving: Record<string, boolean>;
  error: string | null;
}

const initialState: ResourcesState = {
  tree: [],
  selectedPath: null,
  original: {},
  draft: {},
  loading: {},
  saving: {},
  error: null,
};

export const resourcesFeature = createFeature({
  name: 'resources',
  reducer: createReducer(
    initialState,
    on(ResourcesActions.loadTreeSuccess, (state, { tree }) => ({ ...state, tree, error: null })),
    on(ResourcesActions.loadTreeFailure, (state, { error }) => ({ ...state, error })),
    on(ResourcesActions.selectFile, (state, { path }) => ({ ...state, selectedPath: path })),
    on(ResourcesActions.loadFile, (state, { path }) => ({
      ...state,
      loading: { ...state.loading, [path]: true },
      error: null,
    })),
    on(ResourcesActions.loadFileSuccess, (state, { path, content }) => ({
      ...state,
      original: { ...state.original, [path]: content },
      draft: { ...state.draft, [path]: content },
      loading: { ...state.loading, [path]: false },
    })),
    on(ResourcesActions.loadFileFailure, (state, { path, error }) => ({
      ...state,
      loading: { ...state.loading, [path]: false },
      error,
    })),
    on(ResourcesActions.setDraft, (state, { path, content }) => ({
      ...state,
      draft: { ...state.draft, [path]: content },
    })),
    on(ResourcesActions.saveFile, (state, { path }) => ({
      ...state,
      saving: { ...state.saving, [path]: true },
      error: null,
    })),
    on(ResourcesActions.saveFileSuccess, (state, { path, content }) => ({
      ...state,
      original: { ...state.original, [path]: content },
      draft: { ...state.draft, [path]: content },
      saving: { ...state.saving, [path]: false },
    })),
    on(ResourcesActions.saveFileFailure, (state, { path, error }) => ({
      ...state,
      saving: { ...state.saving, [path]: false },
      error,
    })),
  ),
});
