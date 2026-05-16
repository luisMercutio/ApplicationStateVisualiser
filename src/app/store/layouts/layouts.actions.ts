import { createActionGroup, emptyProps, props } from '@ngrx/store';

export const LayoutsActions = createActionGroup({
  source: 'Layouts',
  events: {
    'Load Layouts': emptyProps(),
    'Load Layouts Success': props<{ names: string[] }>(),
    'Load Layouts Failure': props<{ error: string }>(),
    'Apply Layout': props<{ name: string }>(),
    'Save Layout': props<{ name: string }>(),
    'Save Layout Success': props<{ name: string }>(),
    'Save Layout Failure': props<{ error: string }>(),
    'Delete Layout': props<{ name: string }>(),
    'Delete Layout Success': props<{ name: string }>(),
    'Delete Layout Failure': props<{ error: string }>(),
  },
});