import { createSelector } from '@ngrx/store';
import { methodologyFeature } from './methodology.reducer';

export const {
  selectMethodologyState,
  selectFiles: selectMethodologyFiles,
  selectSelectedKey: selectMethodologySelectedKey,
  selectError: selectMethodologyError,
} = methodologyFeature;

/** Content shown in the editor: the draft if present, else the loaded original. */
export const selectMethodologyContent = (key: string) =>
  createSelector(methodologyFeature.selectDraft, methodologyFeature.selectOriginal, (draft, original) =>
    key in draft ? draft[key] : (original[key] ?? null),
  );

export const selectMethodologyLoading = (key: string) =>
  createSelector(methodologyFeature.selectLoading, (loading) => loading[key] ?? false);

export const selectMethodologySaving = (key: string) =>
  createSelector(methodologyFeature.selectSaving, (saving) => saving[key] ?? false);

export const selectMethodologyDirty = (key: string) =>
  createSelector(methodologyFeature.selectDraft, methodologyFeature.selectOriginal, (draft, original) =>
    key in draft && draft[key] !== (original[key] ?? ''),
  );
