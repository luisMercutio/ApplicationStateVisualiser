import { createSelector } from '@ngrx/store';
import { filesFeature } from './files.reducer';

export const {
  selectFilesState,
  selectCache,
  selectLoading: selectFilesLoading,
  selectErrors: selectFilesErrors,
} = filesFeature;

export const selectFileContent = (filePath: string) =>
  createSelector(selectCache, cache => cache[filePath] ?? null);

export const selectFileLoading = (filePath: string) =>
  createSelector(selectFilesLoading, loading => loading[filePath] ?? false);

export const selectFileError = (filePath: string) =>
  createSelector(selectFilesErrors, errors => errors[filePath] ?? null);
