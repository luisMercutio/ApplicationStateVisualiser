Start a change request: create branch, worktree, and stub tracking file. Usage: `/cr-start fix-calendar-crash`

## What you are doing

You are setting up an isolated workspace for a scoped fix. The branch and worktree keep the change self-contained; the stub `cr.md` registers the CR so `/cr-capture` can fill it in once the fix is complete.

---

## Step 1 — Normalize the name

From $ARGUMENTS:
- Lowercase, replace spaces and underscores with hyphens, strip characters that are not alphanumeric or hyphens.
- Result: `<cr-name>` (e.g. `fix-calendar-crash`, `booking-overlap-guard`).

If $ARGUMENTS is empty: abort — "Provide a short name for this change request, e.g. `/cr-start fix-calendar-crash`."

---

## Step 2 — Check for conflicts

1. Run `git branch --list "cr/<cr-name>"`. If output is non-empty: abort — "Branch `cr/<cr-name>` already exists. Choose a different name or continue work on that branch."
2. Check whether `.claude/architecture/CR-<cr-name>/` already exists. If it does: abort with the same message.

---

## Step 3 — Create branch and worktree

Find the git repository root:
```bash
git rev-parse --show-toplevel
```
Call this `<git-root>`.

Create the worktree:
```bash
git worktree add "<git-root>/cr-<cr-name>" -b "cr/<cr-name>"
```

This creates:
- A new branch `cr/<cr-name>` tracking the current HEAD
- A worktree at `<git-root>/cr-<cr-name>` checked out to that branch

If the command fails (e.g. path already exists), surface the exact error and stop.

---

## Step 4 — Write the stub cr.md

Create `.claude/architecture/CR-<cr-name>/cr.md` **in the main working directory** (not the worktree — this registers the CR in the main repo so it is visible across sessions):

```markdown
---
cr-id: CR-<cr-name>
branch: cr/<cr-name>
worktree: <git-root>/cr-<cr-name>
related-ucs: []
stage-attributed-to: unknown
status: stub
created: <today YYYY-MM-DD>
---

# CR: <cr-name>

> Status: stub — fix not yet complete.
> Once the fix is done, run `/cr-capture <cr-name>` to auto-analyze the diff and complete this file.

## Problem description

<!-- Fill in manually or let cr-capture derive it from the diff -->

## What changed

<!-- Auto-filled by cr-capture -->

## Root cause

<!-- Auto-filled by cr-capture -->

## Stage attribution

<!-- Auto-filled by cr-capture -->

## Recommendations

<!-- Auto-filled by cr-capture -->
```

---

## Step 5 — Commit the stub

Stage and commit the stub in the main working directory (main branch):
```bash
git add .claude/architecture/CR-<cr-name>/
git commit -m "chore(cr): start CR-<cr-name> [stub]"
```

The worktree branch already has this commit via its shared HEAD at creation time.

---

## Step 6 — Report to the user

```
## CR Started — CR-<cr-name>

Branch  : cr/<cr-name>
Worktree: <git-root>/cr-<cr-name>
Stub    : .claude/architecture/CR-<cr-name>/cr.md

Open the worktree to start working:
  cd <git-root>/cr-<cr-name>

Or open it in a new IDE window pointing to that directory.

When the fix is complete, run:
  /cr-capture <cr-name>

This will read the diff of cr/<cr-name> vs main and fill in the full analysis.
```
