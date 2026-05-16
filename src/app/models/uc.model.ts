export type UcStatus =
  | 'Draft'
  | 'Approved'
  | 'In Development'
  | 'Testing'
  | 'Fixing Deprecations'
  | 'Re-Testing'
  | 'Done'
  | 'Needs Human Review';

export interface UcSummary {
  id: string;
  title: string;
  status: UcStatus;
  updated: string;
}

export interface FileTreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileTreeNode[];
}
