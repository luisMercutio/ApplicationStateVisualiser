// A registered application whose state (Epics, Business Rules, Notes, agent-info)
// lives in the single store database, scoped by application_id.
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
