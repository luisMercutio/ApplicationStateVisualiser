// A running (or once-running) app instance, as recorded by the ~/dev-remote helper
// under ~/.dev-remote/<worktree>.json. One worktree can be booted as its own Express
// API + Angular dev server on its own port pair (web = api + 1200). Shapes match the
// server's /api/instances endpoints.
export interface AppInstance {
  worktree: string;          // worktree token dev-remote was started with ('main', 'test', …)
  pid: number | null;        // launcher pid recorded at start
  apiPort: number | null;    // Express API port for this instance
  webPort: number | null;    // Angular dev-server port (what you open in a browser)
  dir: string | null;        // absolute checkout directory
  startedAt: string | null;  // ISO timestamp of the start
  running: boolean;          // pid still alive (false → stale record, treat as stopped)
}
