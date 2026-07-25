// The single application whose "state" — Epics and Business Rules — this app
// visualises. The backend owns exactly one application database; these rows
// describe the registered application and where its source lives on disk.
export interface Application {
  id: string;
  name: string;
  description: string | null;
  rootDir: string | null;
  createdAt: string;
  updatedAt: string;
}

// The write shape sent when creating or editing an application.
export interface ApplicationInput {
  name: string;
  description?: string | null;
  rootDir?: string | null;
}

export interface DbStoreStatus {
  ready: boolean;
  error: string | null;
  store: { host: string; port: number; database: string };
}
