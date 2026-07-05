import { createSelector } from '@ngrx/store';
import { resourcesFeature } from './resources.reducer';

export const {
  selectResourcesState,
  selectTree: selectResourcesTree,
  selectSelectedPath: selectResourcesSelectedPath,
  selectError: selectResourcesError,
} = resourcesFeature;

/** Content shown in the editor: the draft if present, else the loaded original. */
export const selectResourceContent = (path: string) =>
  createSelector(resourcesFeature.selectDraft, resourcesFeature.selectOriginal, (draft, original) =>
    path in draft ? draft[path] : (original[path] ?? null),
  );

export const selectResourceLoading = (path: string) =>
  createSelector(resourcesFeature.selectLoading, (loading) => loading[path] ?? false);

export const selectResourceSaving = (path: string) =>
  createSelector(resourcesFeature.selectSaving, (saving) => saving[path] ?? false);

export const selectResourceLoaded = (path: string) =>
  createSelector(resourcesFeature.selectOriginal, (original) => path in original);

export const selectResourceDirty = (path: string) =>
  createSelector(resourcesFeature.selectDraft, resourcesFeature.selectOriginal, (draft, original) =>
    path in draft && draft[path] !== (original[path] ?? ''),
  );
