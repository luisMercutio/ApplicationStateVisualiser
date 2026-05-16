import { layoutsFeature } from './layouts.reducer';

export const {
  selectLayoutsState,
  selectNames: selectLayoutNames,
  selectActiveLayout,
  selectSaving: selectLayoutSaving,
} = layoutsFeature;