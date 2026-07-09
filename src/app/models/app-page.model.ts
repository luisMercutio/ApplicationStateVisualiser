// The top-level pages the header navigates between. The active database
// connection (the "project") is chosen separately in the toolbar and is
// orthogonal to which page is showing.
export type AppPage = 'br-list' | 'technical-specs' | 'features' | 'terminal' | 'settings';

// Pages reachable from the main nav buttons (Settings is a separate gear icon).
export const NAV_PAGES: { page: AppPage; label: string; icon: string }[] = [
  { page: 'br-list', label: 'Business Rules', icon: 'rule' },
  { page: 'technical-specs', label: 'Tech Specs', icon: 'architecture' },
  { page: 'features', label: 'Features', icon: 'dashboard' },
  { page: 'terminal', label: 'Terminal', icon: 'terminal' },
];
