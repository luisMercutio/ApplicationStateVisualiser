import { createSelector } from '@ngrx/store';
import { layoutFeature } from './layout.reducer';

export const {
  selectLayoutState,
  selectPanels,
  selectGlobalUcId,
  selectRootPath,
} = layoutFeature;

export const selectEffectiveUcId = (panelId: string) =>
  createSelector(selectPanels, selectGlobalUcId, (panels, globalId) => {
    const panel = panels.find(p => p.id === panelId);
    if (!panel) return globalId;
    return panel.pinned && panel.ucId ? panel.ucId : globalId;
  });
