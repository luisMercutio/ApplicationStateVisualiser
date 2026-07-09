// Panels live on the "Features" page (the gridster workspace). No feature view
// types are defined yet — the grid is placeholder scaffolding, so VIEW_TYPE_LIST
// is intentionally empty. BR List, Methodology and Terminal are full pages now,
// not panels, so they are deliberately NOT here.
export type ViewType = string;

export const VIEW_TYPE_LABELS: Record<string, string> = {};

export const VIEW_TYPE_LIST: ViewType[] = [];

export interface Panel {
  id: string;
  viewType: ViewType;
  x: number;
  y: number;
  rows: number;
  cols: number;
}
