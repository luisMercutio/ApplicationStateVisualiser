import { createActionGroup, emptyProps, props } from '@ngrx/store';
import { RuleEntry } from '../../models/rule-index.model';

export const RulesActions = createActionGroup({
  source: 'Rules',
  events: {
    'Load Rules': emptyProps(),
    'Load Rules Success': props<{ entries: RuleEntry[] }>(),
    'Load Rules Failure': props<{ error: string }>(),
    'Set Active Feature': props<{ feature: string | null }>(), // null = whole application
  },
});
