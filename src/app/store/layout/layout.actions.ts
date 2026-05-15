import { createActionGroup, props } from '@ngrx/store';
import { Panel } from '../../models/panel.model';

export const LayoutActions = createActionGroup({
  source: 'Layout',
  events: {
    'Set Root Path': props<{ rootPath: string }>(),
    'Set Global Uc': props<{ ucId: string }>(),
    'Add Panel': props<{ panel: Panel }>(),
    'Remove Panel': props<{ panelId: string }>(),
    'Update Panel': props<{ panel: Panel }>(),
    'Update Panels': props<{ panels: Panel[] }>(),
    'Toggle Pin': props<{ panelId: string }>(),
    'Pin Uc': props<{ panelId: string; ucId: string }>(),
  },
});
