Merge an Epic suggestion branch onto main, remove its worktree, delete the branch, and delete the worktree folder. Usage: `/epic-cleanup EPIC-015` (Epic ID) or `/epic-cleanup 015-manage-objects` (explicit branch name).

## What you are doing

After an Epic has been implemented and pushed, this command tears down the isolated workspace: it ensures the branch is merged into local main, removes the git worktree registration, deletes the branch, and removes the directory from disk.

---

## Step 1 — Parse arguments

$ARGUMENTS may be **either** an Epic ID (e.g. `EPIC-015`) **or** a literal branch name (e.g. `015-manage-objects-suggestion`, `epic-restructure`). Detect which:

- If $ARGUMENTS matches `EPIC-<number>` (optionally with more after it) → treat it as an **Epic ID**.
- Otherwise → treat it verbatim as an explicit **branch name** and skip the candidate derivation below (set `<branch-candidates>` to just that one name).

If $ARGUMENTS is empty: abort — "Provide an Epic ID (e.g. `/epic-cleanup EPIC-015`) or a branch name (e.g. `/epic-cleanup 015-manage-objects`)."

### When $ARGUMENTS is an Epic ID

Extract the Epic number, zero-pad to 3 digits → `<NNN>`. Derive:

- `<epic-id>` — e.g. `EPIC-015`
- `<slug>` — resolve from the folder: glob `.claude/architecture/<NNN>-*/`; if exactly one match, the folder's trailing slug (after `<NNN>-`) is `<slug>`. If no match, `<slug>` is unknown.
- `<branch-candidates>` — an ordered list of possible branch names, most specific first:
  1. `<NNN>-<slug>` (new naming — mirrors the folder name, e.g. `015-manage-objects`; only if `<slug>` was resolved)
  2. `EPIC-<NNN>-suggestion` (legacy naming, e.g. `EPIC-015-suggestion`)

---

## Step 2 — Locate git root and worktree path

```bash
git rev-parse --show-toplevel
```

Call the result `<git-root>`.

Run:

```bash
git worktree list --porcelain
```

Resolve the actual branch and worktree:

1. Find the worktree entry whose `branch` field ends with `refs/heads/<candidate>` for the **first** `<branch-candidate>` that matches. Set `<branch>` to that candidate and `<worktree-path>` to its `worktree` path.
2. If no candidate matches a worktree entry, fall back to checking which candidate branches exist at all:
   ```bash
   git branch --list <candidate>
   ```
   Use the first existing candidate as `<branch>` (its worktree is already gone — skip Steps 4–5).
3. If neither a worktree nor a branch matches any candidate: abort — "No worktree or branch found for `$ARGUMENTS`. Tried: `<branch-candidates>`."

If a worktree entry was found, `<worktree-path>` is set; otherwise note the worktree is already gone and skip Steps 4–5 (but still handle the branch in Steps 3 and 5).

---

## Step 3 — Verify / merge into main

From the main worktree (`<git-root>`), check for unmerged commits:

```bash
git log main..<branch> --oneline
```

- **Output is empty** → already fully merged into main. Skip the merge.
- **Output is non-empty** → merge now:

```bash
git checkout main
git merge --ff-only <branch>
```

If `--ff-only` fails (diverged history): abort and tell the user to resolve conflicts manually before running `/epic-cleanup` again.

---

## Step 4 — Remove the worktree

> **FIXED RULE — never delete the `main` or `test` worktree.** Before removing anything,
> confirm `<worktree-path>` is the Epic's own dated/feature worktree and is **not** the
> `main` worktree or the `test` worktree. If it resolves to either, **abort immediately** —
> do not remove, prune, or `rm -rf` it under any circumstances.

If `<worktree-path>` was found in Step 2:

```bash
git worktree remove "<worktree-path>" --force
```

`--force` is required because the session may currently be inside the worktree. This unregisters the worktree and deletes the directory.

If the command fails with `Permission denied` or `Device or resource busy` (the session's working directory is inside the worktree — the OS will not allow deleting the current directory), run:

```bash
git worktree prune
```

to unregister the worktree from git. Then skip the `rm -rf` in Step 6 and instead tell the user to run it manually in a terminal after closing this session or navigating away from that directory.

---

## Step 5 — Delete the branch

```bash
git branch -d <branch>
```

`-d` is a safe delete — it will only succeed if the branch is fully merged into the current HEAD. If it fails with "not fully merged", re-check Step 3 and resolve before retrying.

If the branch does not exist (already deleted), note it and continue.

---

## Step 6 — Verify folder is gone

Check whether `<worktree-path>` still exists on disk:

```bash
ls "<worktree-path>" 2>/dev/null
```

If it still exists (e.g. `git worktree remove` did not delete it): remove it:

```bash
rm -rf "<worktree-path>"
```

---

## Step 7 — Report to the user

```
## Epic Cleanup Complete — <epic-id or branch>

Branch  : <branch> — deleted
Worktree: <worktree-path> — removed
Folder  : <worktree-path> — deleted

main is at: <git log --oneline -1 main>
```

Use `<epic-id>` in the heading when $ARGUMENTS was an Epic ID; otherwise use the branch name.

If the branch was already merged before this command ran, note that explicitly so the user knows no merge was performed.
