// The top-level pages the header navigates between. The active database
// connection (the "project") is chosen separately in the toolbar and is
// orthogonal to which page is showing.
export type AppPage = 'br-list' | 'notes' | 'activity' | 'features' | 'terminal' | 'claude-sessions' | 'git' | 'instances' | 'settings';

// Pages reachable from the main nav buttons (Settings is a separate gear icon).
export const NAV_PAGES: { page: AppPage; label: string; icon: string }[] = [
  { page: 'br-list', label: 'Business Rules', icon: 'rule' },
  { page: 'notes', label: 'Notes', icon: 'sticky_note_2' },
  { page: 'activity', label: 'Activity', icon: 'notifications' },
  { page: 'features', label: 'Features', icon: 'dashboard' },
  { page: 'terminal', label: 'Terminal', icon: 'terminal' },
  { page: 'claude-sessions', label: 'Claude Sessions', icon: 'smart_toy' },
  { page: 'git', label: 'Git', icon: 'history' },
  { page: 'instances', label: 'Instances', icon: 'dns' },
];
