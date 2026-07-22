import { createFeature, createReducer, on } from '@ngrx/store';
import { AppBusinessRule, BrAgentInfo, Epic } from '../../models/app-data.model';
import { Note } from '../../models/note.model';
import { AppDataActions } from './app-data.actions';

export interface AppDataState {
  applicationId: string | null; // which connection the data belongs to
  epics: Epic[];
  rules: AppBusinessRule[];
  agentInfo: BrAgentInfo[];
  notes: Note[];
  loading: boolean;
  error: string | null;
}

const initialState: AppDataState = {
  applicationId: null,
  epics: [],
  rules: [],
  agentInfo: [],
  notes: [],
  loading: false,
  error: null,
};

function upsertEpic(epics: Epic[], epic: Epic): Epic[] {
  const idx = epics.findIndex(e => e.id === epic.id);
  return idx >= 0 ? epics.map(e => (e.id === epic.id ? epic : e)) : [...epics, epic];
}

function upsertRule(rules: AppBusinessRule[], rule: AppBusinessRule): AppBusinessRule[] {
  const idx = rules.findIndex(r => r.creationIndex === rule.creationIndex);
  return idx >= 0 ? rules.map(r => (r.creationIndex === rule.creationIndex ? rule : r)) : [...rules, rule];
}

function upsertInfo(info: BrAgentInfo[], entry: BrAgentInfo): BrAgentInfo[] {
  const idx = info.findIndex(i => i.id === entry.id);
  return idx >= 0 ? info.map(i => (i.id === entry.id ? entry : i)) : [...info, entry];
}

function upsertNote(notes: Note[], note: Note): Note[] {
  const idx = notes.findIndex(n => n.id === note.id);
  return idx >= 0 ? notes.map(n => (n.id === note.id ? note : n)) : [...notes, note];
}

export const appDataFeature = createFeature({
  name: 'appData',
  reducer: createReducer(
    initialState,
    on(AppDataActions.load, (state, { applicationId }) => ({ ...state, loading: true, error: null, applicationId })),
    on(AppDataActions.loadSuccess, (state, { applicationId, epics, rules, agentInfo, notes }) => ({
      ...state, applicationId, epics, rules, agentInfo, notes, loading: false, error: null,
    })),
    on(AppDataActions.loadFailure, (state, { error }) => ({ ...state, loading: false, error })),
    on(AppDataActions.clear, () => ({ ...initialState })),

    on(AppDataActions.createEpicSuccess, AppDataActions.updateEpicSuccess, (state, { epic }) => ({
      ...state, epics: upsertEpic(state.epics, epic), error: null,
    })),
    on(AppDataActions.deleteEpicSuccess, (state, { epicId }) => ({
      ...state,
      epics: state.epics.filter(e => e.id !== epicId),
      // FK is ON DELETE SET NULL server-side; mirror that locally so BRs un-group.
      rules: state.rules.map(r => (r.epicId === epicId ? { ...r, epicId: null } : r)),
    })),

    on(AppDataActions.createRuleSuccess, AppDataActions.updateRuleSuccess, (state, { rule }) => ({
      ...state, rules: upsertRule(state.rules, rule), error: null,
    })),
    on(AppDataActions.moveRuleToNewEpicSuccess, (state, { epic, rule }) => ({
      ...state, epics: upsertEpic(state.epics, epic), rules: upsertRule(state.rules, rule), error: null,
    })),
    on(AppDataActions.deleteRuleSuccess, (state, { ruleId }) => ({
      ...state,
      rules: state.rules.filter(r => r.creationIndex !== ruleId),
      // The DB cascades agent-info on BR delete; mirror that locally.
      agentInfo: state.agentInfo.filter(i => i.businessRuleId !== ruleId),
    })),

    on(AppDataActions.createNoteSuccess, AppDataActions.updateNoteSuccess, (state, { note }) => ({
      ...state, notes: upsertNote(state.notes, note), error: null,
    })),
    on(AppDataActions.deleteNoteSuccess, (state, { noteId }) => ({
      ...state, notes: state.notes.filter(n => n.id !== noteId),
    })),

    on(AppDataActions.createAgentInfoSuccess, AppDataActions.updateAgentInfoSuccess, (state, { info }) => ({
      ...state, agentInfo: upsertInfo(state.agentInfo, info), error: null,
    })),
    on(AppDataActions.deleteAgentInfoSuccess, (state, { infoId }) => ({
      ...state, agentInfo: state.agentInfo.filter(i => i.id !== infoId),
    })),

    on(AppDataActions.mutationFailure, (state, { error }) => ({ ...state, error })),
  ),
});
