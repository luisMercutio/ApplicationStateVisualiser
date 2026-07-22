import { createActionGroup, emptyProps, props } from '@ngrx/store';
import { Application, ApplicationInput } from '../../models/application.model';

export const ApplicationsActions = createActionGroup({
  source: 'Applications',
  events: {
    // Load status + list + active selection together.
    'Load Applications': emptyProps(),
    'Load Applications Success': props<{
      applications: Application[];
      activeId: string | null;
      storeReady: boolean;
      storeError: string | null;
    }>(),
    'Load Applications Failure': props<{ error: string }>(),

    'Create Application': props<{ input: ApplicationInput }>(),
    'Create Application Success': props<{ application: Application }>(),
    'Create Application Failure': props<{ error: string }>(),

    'Update Application': props<{ id: string; input: ApplicationInput }>(),
    'Update Application Success': props<{ application: Application }>(),
    'Update Application Failure': props<{ error: string }>(),

    'Delete Application': props<{ id: string }>(),
    'Delete Application Success': props<{ id: string }>(),
    'Delete Application Failure': props<{ error: string }>(),

    'Set Active': props<{ id: string | null }>(),
    'Set Active Success': props<{ activeId: string | null }>(),
    'Set Active Failure': props<{ error: string }>(),
  },
});
