// A registered target application database (one of B…Z). Never carries the
// password — the backend keeps that encrypted and only tells us whether one is
// on file so the edit form can leave the field blank to mean "keep existing".
export interface DbConnection {
  id: string;
  name: string;
  engine: string;
  host: string;
  port: number;
  database: string;
  username: string;
  useSsl: boolean;
  hasPassword: boolean;
  createdAt: string;
  updatedAt: string;
}

// The write shape sent when creating or editing a connection. `password` is
// optional on edit: omit or blank it to keep the stored one.
export interface DbConnectionInput {
  name: string;
  host: string;
  port: number;
  database: string;
  username: string;
  password?: string;
  useSsl?: boolean;
}

export interface DbTestResult {
  ok: boolean;
  version?: string;
  error?: string;
}

export interface DbTableInfo {
  name: string;
  approxRows: number;
}

export interface DbPreview {
  table: string;
  columns: string[];
  rows: Record<string, unknown>[];
  limit: number;
}

export interface DbStoreStatus {
  ready: boolean;
  error: string | null;
  store: { host: string; port: number; database: string };
}
