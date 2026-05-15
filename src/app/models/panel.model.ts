export type ViewType =
  | 'uc-tracker'
  | 'suggestion'
  | 'class-diagram'
  | 'class-diagram-diff'
  | 'openapi'
  | 'openapi-diff'
  | 'frontend-state'
  | 'frontend-state-diff'
  | 'selectors'
  | 'selectors-diff'
  | 'test-state'
  | 'test-state-diff'
  | 'contract-validation'
  | 'mockup'
  | 'mockups-diff';

export const VIEW_TYPE_LABELS: Record<ViewType, string> = {
  'uc-tracker': 'UC Tracker',
  'suggestion': 'Suggestion',
  'class-diagram': 'Class Diagram',
  'class-diagram-diff': 'DB Diff',
  'openapi': 'API Contract',
  'openapi-diff': 'API Diff',
  'frontend-state': 'Frontend State',
  'frontend-state-diff': 'Store Diff',
  'selectors': 'Selectors',
  'selectors-diff': 'Selectors Diff',
  'test-state': 'Tests',
  'test-state-diff': 'Tests Diff',
  'contract-validation': 'Contract',
  'mockup': 'Mockup',
  'mockups-diff': 'Mockups Diff',
};

export const VIEW_TYPE_LIST: ViewType[] = Object.keys(VIEW_TYPE_LABELS) as ViewType[];

export interface Panel {
  id: string;
  viewType: ViewType;
  ucId: string | null;
  pinned: boolean;
  x: number;
  y: number;
  rows: number;
  cols: number;
}
