import { createActionGroup, emptyProps, props } from '@ngrx/store';
import { UcSummary } from '../../models/uc.model';

export const UcActions = createActionGroup({
  source: 'UC',
  events: {
    'Load Usecases': emptyProps(),
    'Load Usecases Success': props<{ usecases: UcSummary[] }>(),
    'Load Usecases Failure': props<{ error: string }>(),
  },
});
