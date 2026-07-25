// Shapes returned by the read-only git endpoints (server.js `/api/git/*`).

// One entry from `git log`, already parsed server-side.
export interface GitCommit {
  hash: string;       // full sha
  short: string;      // abbreviated sha
  author: string;     // author name
  email: string;      // author email
  date: number;       // author date, epoch milliseconds
  refs: string[];     // decoration entries, e.g. 'HEAD -> main', 'origin/main', 'tag: v1'
  subject: string;    // first line of the commit message
}

// One checkout listed by `git worktree list --porcelain`. Each worktree is an
// isolated working directory pinned to a branch (or a detached HEAD), letting
// several branches be checked out at once — this is what the page differentiates.
export interface GitWorktree {
  path: string;             // absolute path (as git reports it)
  head: string | null;      // HEAD sha
  branch: string | null;    // branch name, or null when detached/bare
  detached: boolean;
  bare: boolean;
  locked: boolean;
  main?: boolean;           // the primary working tree (first entry git lists)
  // Lifecycle state used to colour-code the card. Absent on the main tree and on
  // the main/test branches themselves (they are merge destinations, not candidates).
  mergedToMain?: boolean;   // this worktree's HEAD is already contained in `main`
  mergedToTest?: boolean;   // …contained in `test`
  lastCommitMs?: number;    // committer date of its HEAD, epoch ms (for a "stale" check)
}
