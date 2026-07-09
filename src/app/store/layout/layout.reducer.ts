import { createFeature, createReducer, on } from '@ngrx/store';
import { Panel, VIEW_TYPE_LIST } from '../../models/panel.model';
import { LayoutActions } from './layout.actions';

export interface LayoutState {
  panels: Panel[];
}

const KNOWN = new Set<string>(VIEW_TYPE_LIST);

// Drop any persisted panels whose view type is no longer defined (e.g. an old
// view from a saved layout), so a stale localStorage entry can't resurrect a
// removed view. No feature view types exist yet, so this currently yields [].
function sanitize(panels: Panel[] | undefined): Panel[] {
  if (!Array.isArray(panels)) return [];
  return panels.filter(p => KNOWN.has(p.viewType));
}

function loadFromStorage(): Partial<LayoutState> {
  try {
    const raw = localStorage.getItem('uc-layout');
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

const stored = loadFromStorage();

const initialState: LayoutState = {
  panels: sanitize(stored.panels),
};

export const layoutFeature = createFeature({
  name: 'layout',
  reducer: createReducer(
    initialState,
    on(LayoutActions.addPanel, (state, { panel }) => ({ ...state, panels: [...state.panels, panel] })),
    on(LayoutActions.removePanel, (state, { panelId }) => ({ ...state, panels: state.panels.filter(p => p.id !== panelId) })),
    on(LayoutActions.updatePanel, (state, { panel }) => ({ ...state, panels: state.panels.map(p => p.id === panel.id ? { ...p, ...panel } : p) })),
    on(LayoutActions.updatePanels, (state, { panels }) => ({ ...state, panels })),
  ),
});
