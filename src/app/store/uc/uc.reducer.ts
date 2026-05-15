import { createFeature, createReducer, on } from '@ngrx/store';
import { UcSummary } from '../../models/uc.model';
import { UcActions } from './uc.actions';

export interface UcState {
  usecases: UcSummary[];
  loading: boolean;
  error: string | null;
}

const initialState: UcState = {
  usecases: [],
  loading: false,
  error: null,
};

export const ucFeature = createFeature({
  name: 'uc',
  reducer: createReducer(
    initialState,
    on(UcActions.loadUsecases, state => ({ ...state, loading: true, error: null })),
    on(UcActions.loadUsecasesSuccess, (state, { usecases }) => ({ ...state, usecases, loading: false })),
    on(UcActions.loadUsecasesFailure, (state, { error }) => ({ ...state, error, loading: false })),
  ),
});
