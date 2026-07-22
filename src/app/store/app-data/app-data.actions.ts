import { createActionGroup, emptyProps, props } from '@ngrx/store';
import { AppBusinessRule, AppBusinessRuleInput, BrAgentInfo, BrAgentInfoInput, Epic, EpicInput } from '../../models/app-data.model';
import { Note, NoteInput } from '../../models/note.model';

// Epics + Business Rules for the ACTIVE application. Every mutating action carries
// the application id it targets so the effects never race against a change of
// active application.
export const AppDataActions = createActionGroup({
  source: 'AppData',
  events: {
    'Load': props<{ applicationId: string }>(),
    'Load Success': props<{ applicationId: string; epics: Epic[]; rules: AppBusinessRule[]; agentInfo: BrAgentInfo[]; notes: Note[] }>(),
    'Load Failure': props<{ error: string }>(),
    'Clear': emptyProps(), // no active application

    'Create Epic': props<{ applicationId: string; input: EpicInput }>(),
    'Create Epic Success': props<{ epic: Epic }>(),
    'Update Epic': props<{ applicationId: string; epicId: string; input: EpicInput }>(),
    'Update Epic Success': props<{ epic: Epic }>(),
    'Delete Epic': props<{ applicationId: string; epicId: string }>(),
    'Delete Epic Success': props<{ epicId: string }>(),

    'Create Rule': props<{ applicationId: string; input: AppBusinessRuleInput }>(),
    'Create Rule Success': props<{ rule: AppBusinessRule }>(),
    'Update Rule': props<{ applicationId: string; ruleId: string; input: AppBusinessRuleInput }>(),
    'Update Rule Success': props<{ rule: AppBusinessRule }>(),
    'Delete Rule': props<{ applicationId: string; ruleId: string }>(),
    'Delete Rule Success': props<{ ruleId: string }>(),

    'Create Note': props<{ applicationId: string; input: NoteInput }>(),
    'Create Note Success': props<{ note: Note }>(),
    'Update Note': props<{ applicationId: string; noteId: string; input: NoteInput }>(),
    'Update Note Success': props<{ note: Note }>(),
    'Delete Note': props<{ applicationId: string; noteId: string }>(),
    'Delete Note Success': props<{ noteId: string }>(),

    'Create Agent Info': props<{ applicationId: string; input: BrAgentInfoInput }>(),
    'Create Agent Info Success': props<{ info: BrAgentInfo }>(),
    'Update Agent Info': props<{ applicationId: string; infoId: string; input: BrAgentInfoInput }>(),
    'Update Agent Info Success': props<{ info: BrAgentInfo }>(),
    'Delete Agent Info': props<{ applicationId: string; infoId: string }>(),
    'Delete Agent Info Success': props<{ infoId: string }>(),

    'Mutation Failure': props<{ error: string }>(),
  },
});
