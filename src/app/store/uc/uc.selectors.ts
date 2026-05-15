import { ucFeature } from './uc.reducer';

export const {
  selectUcState,
  selectUsecases,
  selectLoading: selectUcLoading,
  selectError: selectUcError,
} = ucFeature;
