import { createActionGroup, emptyProps, props } from '@ngrx/store';
import { BusinessRule, BrPosition, BrHighlight } from '../../models/business-rule.model';

export const BrActions = createActionGroup({
  source: 'BR',
  events: {
    'Load Graph': emptyProps(),
    'Load Graph Success': props<{ rules: BusinessRule[]; positions: Record<string, BrPosition> }>(),
    'Load Graph Failure': props<{ error: string }>(),
    'Set Position': props<{ id: string; x: number; y: number }>(),
    'Relayout': emptyProps(),
    'Select Br': props<{ id: string | null }>(),
    'Set Highlight': props<{ highlight: BrHighlight }>(),
    'Clear Highlight': emptyProps(),
  },
});
