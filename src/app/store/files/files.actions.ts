import { createActionGroup, emptyProps, props } from '@ngrx/store';

export const FilesActions = createActionGroup({
  source: 'Files',
  events: {
    'Load File': props<{ path: string }>(),
    'Load File Success': props<{ path: string; content: string }>(),
    'Load File Failure': props<{ path: string; error: string }>(),
    'Clear Cache': emptyProps(),
  },
});
