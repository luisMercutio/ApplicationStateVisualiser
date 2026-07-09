import { createFeature, createReducer, on } from '@ngrx/store';
import { AppBusinessRule, BrAgentInfo, Epic } from '../../models/app-data.model';
import { AppDataActions } from './app-data.actions';

export interface AppDataState {
  connectionId: string | null; // which connection the data belongs to
  epics: Epic[];
  rules: AppBusinessRule[];
  agentInfo: BrAgentInfo[];
  loading: boolean;
  error: string | null;
}

const initialState: AppDataState = {
  connectionId: null,
  epics: [],
  rules: [],
  agentInfo: [],
  loading: false,
  error: null,
};

function upsertEpic(epics: Epic[], epic: Epic): Epic[] {
  const idx = epics.findIndex(e => e.id === epic.id);
  return idx >= 0 ? epics.map(e => (e.id === epic.id ? epic : e)) : [...epics, epic];
}

function upsertRule(rules: AppBusinessRule[], rule: AppBusinessRule): AppBusinessRule[] {
  const idx = rules.findIndex(r => r.id === rule.id);
  return idx >= 0 ? rules.map(r => (r.id === rule.id ? rule : r)) : [...rules, rule];
}

function upsertInfo(info: BrAgentInfo[], entry: BrAgentInfo): BrAgentInfo[] {
  const idx = info.findIndex(i => i.id === entry.id);
  return idx >= 0 ? info.map(i => (i.id === entry.id ? entry : i)) : [...info, entry];
}

export const appDataFeature = createFeature({
  name: 'appData',
  reducer: createReducer(
    initialState,
    on(AppDataActions.load, (state, { connectionId }) => ({ ...state, loading: true, error: null, connectionId })),
    on(AppDataActions.loadSuccess, (state, { connectionId, epics, rules, agentInfo }) => ({
      ...state, connectionId, epics, rules, agentInfo, loading: false, error: null,
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
    on(AppDataActions.deleteRuleSuccess, (state, { ruleId }) => ({
      ...state,
      rules: state.rules.filter(r => r.id !== ruleId),
      // The DB cascades agent-info on BR delete; mirror that locally.
      agentInfo: state.agentInfo.filter(i => i.businessRuleId !== ruleId),
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
