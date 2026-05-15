export type UcStatus = 'Draft' | 'Approved' | 'Implemented';

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
