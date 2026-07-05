import { createActionGroup, emptyProps, props } from '@ngrx/store';
import { FileTreeNode } from '../../models/uc.model';

export const ResourcesActions = createActionGroup({
  source: 'Resources',
  events: {
    'Load Tree': emptyProps(),
    'Load Tree Success': props<{ tree: FileTreeNode[] }>(),
    'Load Tree Failure': props<{ error: string }>(),
    'Select File': props<{ path: string }>(),
    'Load File': props<{ path: string }>(),
    'Load File Success': props<{ path: string; content: string }>(),
    'Load File Failure': props<{ path: string; error: string }>(),
    'Set Draft': props<{ path: string; content: string }>(),
    'Save File': props<{ path: string; content: string }>(),
    'Save File Success': props<{ path: string; content: string }>(),
    'Save File Failure': props<{ path: string; error: string }>(),
  },
});
