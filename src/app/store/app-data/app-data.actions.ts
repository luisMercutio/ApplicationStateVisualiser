import { createActionGroup, emptyProps, props } from '@ngrx/store';
import { AppBusinessRule, AppBusinessRuleInput, BrAgentInfo, BrAgentInfoInput, Epic, EpicInput } from '../../models/app-data.model';
import { Note, NoteInput } from '../../models/note.model';

// Epics + Business Rules for the ACTIVE application database. Every mutating
// action carries the connection id it targets so the effects never race against
// a change of active connection.
export const AppDataActions = createActionGroup({
  source: 'AppData',
  events: {
    'Load': props<{ connectionId: string }>(),
    'Load Success': props<{ connectionId: string; epics: Epic[]; rules: AppBusinessRule[]; agentInfo: BrAgentInfo[]; notes: Note[] }>(),
    'Load Failure': props<{ error: string }>(),
    'Clear': emptyProps(), // no active connection

    'Create Epic': props<{ connectionId: string; input: EpicInput }>(),
    'Create Epic Success': props<{ epic: Epic }>(),
    'Update Epic': props<{ connectionId: string; epicId: string; input: EpicInput }>(),
    'Update Epic Success': props<{ epic: Epic }>(),
    'Delete Epic': props<{ connectionId: string; epicId: string }>(),
    'Delete Epic Success': props<{ epicId: string }>(),

    'Create Rule': props<{ connectionId: string; input: AppBusinessRuleInput }>(),
    'Create Rule Success': props<{ rule: AppBusinessRule }>(),
    'Update Rule': props<{ connectionId: string; ruleId: string; input: AppBusinessRuleInput }>(),
    'Update Rule Success': props<{ rule: AppBusinessRule }>(),
    'Delete Rule': props<{ connectionId: string; ruleId: string }>(),
    'Delete Rule Success': props<{ ruleId: string }>(),

    // "Submit with Claude": persist the rule with needsToBeEstablished=true, then
    // spawn a claude session for it. ruleId is null when adding, set when editing.
    // The store is synced via the ordinary create/update-rule success actions; this
    // success action only carries the spawned session for the snackbar notice.
    'Submit To Claude': props<{ connectionId: string; ruleId: string | null; input: AppBusinessRuleInput }>(),
    'Submit To Claude Success': props<{ rule: AppBusinessRule; session: string }>(),

    // Dragging a rule out of its epic spawns a fresh epic that adopts it: the
    // effect creates the epic, then reassigns the rule to it.
    'Move Rule To New Epic': props<{ connectionId: string; ruleId: string; input: AppBusinessRuleInput; epicTitle: string }>(),
    'Move Rule To New Epic Success': props<{ epic: Epic; rule: AppBusinessRule }>(),

    'Create Note': props<{ connectionId: string; input: NoteInput }>(),
    'Create Note Success': props<{ note: Note }>(),
    'Update Note': props<{ connectionId: string; noteId: string; input: NoteInput }>(),
    'Update Note Success': props<{ note: Note }>(),
    'Delete Note': props<{ connectionId: string; noteId: string }>(),
    'Delete Note Success': props<{ noteId: string }>(),

    'Create Agent Info': props<{ connectionId: string; input: BrAgentInfoInput }>(),
    'Create Agent Info Success': props<{ info: BrAgentInfo }>(),
    'Update Agent Info': props<{ connectionId: string; infoId: string; input: BrAgentInfoInput }>(),
    'Update Agent Info Success': props<{ info: BrAgentInfo }>(),
    'Delete Agent Info': props<{ connectionId: string; infoId: string }>(),
    'Delete Agent Info Success': props<{ infoId: string }>(),

    'Mutation Failure': props<{ error: string }>(),
  },
});
