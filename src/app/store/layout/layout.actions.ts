import { createActionGroup, props } from '@ngrx/store';
import { Panel } from '../../models/panel.model';

export const LayoutActions = createActionGroup({
  source: 'Layout',
  events: {
    'Add Panel': props<{ panel: Panel }>(),
    'Remove Panel': props<{ panelId: string }>(),
    'Update Panel': props<{ panel: Panel }>(),
    'Update Panels': props<{ panels: Panel[] }>(),
  },
});
