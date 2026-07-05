export interface BrTouches {
  entities?: string[];
  endpoints?: string[];
  slices?: string[];
  selectors?: string[];
  components?: string[];
  mockups?: string[];
  tests?: string[];
}

export type BrCategory =
  | 'auth' | 'validation' | 'workflow' | 'data' | 'ui' | 'routing' | 'integration' | 'other';

export interface BusinessRule {
  id: string;
  uc: string;
  seq: number;
  rule: string;
  rationale?: string;
  category?: BrCategory;
  dependsOn: string[];
  relatedUc?: string[];
  touches: BrTouches;
}

/** Shape of one <UC>/business-rules.json file. */
export interface BrDocument {
  uc: string;
  title?: string;
  generated?: string;
  rules: BusinessRule[];
}

export interface BrPosition {
  x: number;
  y: number;
}

/** The overlay a selected BR broadcasts to the other views (populated in P5). */
export interface BrHighlight {
  brId: string;
  kind: 'connections' | 'backend' | 'frontend' | 'mockups' | 'components' | 'tests';
  touches: BrTouches;
}

export const BR_CATEGORY_COLORS: Record<string, string> = {
  auth: '#e53935',
  validation: '#fb8c00',
  workflow: '#8e24aa',
  data: '#1e88e5',
  ui: '#00acc1',
  routing: '#3949ab',
  integration: '#43a047',
  other: '#757575',
};

export function categoryColor(cat?: string): string {
  return BR_CATEGORY_COLORS[cat ?? 'other'] ?? BR_CATEGORY_COLORS['other'];
}
