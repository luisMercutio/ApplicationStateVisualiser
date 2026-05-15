import { createFeature, createReducer, on } from '@ngrx/store';
import { Panel, ViewType } from '../../models/panel.model';
import { LayoutActions } from './layout.actions';

export interface LayoutState {
  panels: Panel[];
  globalUcId: string | null;
  rootPath: string | null;
}

function makePanel(id: string, viewType: ViewType, x: number, y: number): Panel {
  return { id, viewType, ucId: null, pinned: false, x, y, rows: 2, cols: 3 };
}

function loadFromStorage(): Partial<LayoutState> {
  try {
    const raw = localStorage.getItem('uc-layout');
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

const stored = loadFromStorage();

const DEFAULT_PANELS: Panel[] = [
  makePanel('default-1', 'uc-tracker', 0, 0),
  makePanel('default-2', 'suggestion', 3, 0),
  makePanel('default-3', 'class-diagram', 0, 2),
  makePanel('default-4', 'openapi', 3, 2),
];

const initialState: LayoutState = {
  panels: stored.panels ?? DEFAULT_PANELS,
  globalUcId: stored.globalUcId ?? null,
  rootPath: stored.rootPath ?? null,
};

export const layoutFeature = createFeature({
  name: 'layout',
  reducer: createReducer(
    initialState,
    on(LayoutActions.setRootPath, (state, { rootPath }) => ({ ...state, rootPath })),
    on(LayoutActions.setGlobalUc, (state, { ucId }) => ({ ...state, globalUcId: ucId })),
    on(LayoutActions.addPanel, (state, { panel }) => ({ ...state, panels: [...state.panels, panel] })),
    on(LayoutActions.removePanel, (state, { panelId }) => ({ ...state, panels: state.panels.filter(p => p.id !== panelId) })),
    on(LayoutActions.updatePanel, (state, { panel }) => ({ ...state, panels: state.panels.map(p => p.id === panel.id ? { ...p, ...panel } : p) })),
    on(LayoutActions.updatePanels, (state, { panels }) => ({ ...state, panels })),
    on(LayoutActions.togglePin, (state, { panelId }) => ({
      ...state,
      panels: state.panels.map(p => p.id === panelId ? { ...p, pinned: !p.pinned } : p),
    })),
    on(LayoutActions.pinUc, (state, { panelId, ucId }) => ({
      ...state,
      panels: state.panels.map(p => p.id === panelId ? { ...p, ucId, pinned: true } : p),
    })),
  ),
});
