Execute the work queue in a fresh dated worktree, committing after each task, then verify and auto-merge to main. Usage: `/queue-run`

## What you are doing

You process every queued task in an isolated worktree named `handle-queue-<yymmdd>`. You read the execution plan first and fan out **parallel** tasks into their own sub-worktrees (merging each back as it finishes), while running **sequential** tasks directly in the main handle-queue worktree. You commit after every task. When all tasks are done you invoke `/queue-judge` to verify the changes landed; if the judge confirms them, you auto-merge `handle-queue-<yymmdd>` into `main` and clean up.

The run agents must **not** guess through genuine ambiguity — if a task can't be implemented correctly without a decision that isn't in the task file or the codebase, that task stops and the question is surfaced to the user. `/queue-refine` exists to make this rare, not forbidden.

---

## Step 0 — Preconditions

Glob `.claude/queue/tasks/*.md`.
- Empty → stop: "Queue is empty. Add tasks with `/queue-add`."

Read `.claude/queue/plan.md` **first** — this is the primary input.
- Missing → warn: "No plan found. Running fully sequential in task-id order. Run `/queue-plan` first for parallel execution." Then treat every task as its own wave, in ascending id order.
- Present → use its waves and sequential-within-wave notes.

Confirm the working tree of the current (main) checkout is clean enough to branch from. If `git status` shows unrelated uncommitted changes, note them but proceed (the worktree branches from committed HEAD).

---

## Step 1 — Create the handle-queue worktree

```bash
ROOT=$(git rev-parse --show-toplevel)
STAMP=$(date +%y%m%d)
```

Let `<wt>` = `$ROOT/handle-queue-$STAMP` and `<branch>` = `handle-queue/$STAMP`.

If `<branch>` already exists (a run happened today), append `-2`, `-3`, … to both the dir and branch until free.

```bash
git worktree add "$ROOT/handle-queue-$STAMP" -b "handle-queue/$STAMP"
```

All task work happens inside `<wt>`. The `.claude/queue/` contents are present there because the branch was cut from `main`.

---

## Step 2 — Process waves in order

For each wave from the plan (or each single-task wave in the no-plan fallback):

### 2a — Sequential tasks (and single-task waves)

Run these yourself, directly in `<wt>`, one at a time:
1. Read the task file (`## Goal`, `## Context & decisions`, `## Acceptance criteria`).
2. Implement the change inside `<wt>`, following the acceptance criteria and codebase conventions. You may delegate to a specialised agent (e.g. `backend-developer`, `frontend-developer`) pointed at `<wt>`.
3. If you hit a blocking ambiguity not resolved by the task file or codebase: **stop this task**, do not guess. Record it (see Step 3) and move to the next task.
4. On success, commit in `<wt>`:
   ```bash
   git -C "$wt" add -A
   git -C "$wt" commit -m "feat(queue): <task-id> <title>"
   ```

### 2b — Parallel tasks

For a wave with ≥ 2 parallel-safe tasks, process them concurrently, each in its own sub-worktree:

For each parallel task `<id>` (slug `<s>`):
```bash
git -C "$wt" worktree add "$ROOT/handle-queue-$STAMP-<s>" -b "handle-queue/$STAMP/<s>"
```
Then spawn one implementation agent per task **in a single message** (multiple Agent calls) so they run at once. Give each agent:
- The absolute sub-worktree path `$ROOT/handle-queue-$STAMP-<s>` and the instruction to read/write **only** within it.
- The full task file contents (goal, context, acceptance criteria).
- This rule verbatim: *"If you cannot implement this correctly without a decision that is not in this task file or discoverable in the codebase, do NOT guess. Stop, leave a clear note of the exact question, and return it. A blocked task is better than a wrong one."*
- Instruction to commit in its own worktree on success: `git -C <sub-wt> add -A && git -C <sub-wt> commit -m "feat(queue): <id> <title>"`.

As each agent returns:
- **Succeeded** → merge its branch into the handle-queue branch, from `<wt>`:
  ```bash
  git -C "$wt" merge --no-ff "handle-queue/$STAMP/<s>" -m "merge(queue): <id> <title>"
  ```
  Then remove the sub-worktree and delete its branch:
  ```bash
  git -C "$wt" worktree remove "$ROOT/handle-queue-$STAMP-<s>"
  git -C "$wt" branch -d "handle-queue/$STAMP/<s>"
  ```
  > **FIXED RULE — never delete the `main` or `test` worktree.** Only ever remove the
  > dated `handle-queue-*` worktrees this command created. Never `git worktree remove`,
  > prune, or `rm -rf` the `main` or `test` worktree, under any circumstances.
  If the merge conflicts (footprints overlapped despite the plan), resolve conservatively or, if non-trivial, mark the task **blocked** and abort the merge (`git -C "$wt" merge --abort`), leaving the sub-worktree for inspection.
- **Blocked / returned a question** → do not merge. Keep the sub-worktree, record the question (Step 3), leave the task file in place.

Respect **sequential-within-wave notes**: tasks that share a footprint inside the same wave run one-after-another, never concurrently.

Do not start a later wave until the current wave's successful tasks are all merged into `<wt>`.

---

## Step 3 — Track blocked tasks

Maintain a list of tasks that stopped on an unanswered question. For each, keep its task file untouched (do not mark done) and collect the exact question.

You will surface these to the user at the end. Blocked tasks do **not** prevent judging/merging the tasks that succeeded — they simply stay in the queue for a later run once answered.

---

## Step 4 — Judge

When every wave is processed, invoke the judge on the handle-queue worktree state. Follow `.claude/commands/queue-judge.md` against `<wt>`:
- It verifies each task's acceptance criteria against the actual project state.
- It deletes the task file for every task confirmed **done** and commits those deletions in `<wt>`.
- It writes `.claude/queue/judge-report.md` with a per-task verdict.

---

## Step 5 — Auto-merge to main (gated on the judge)

Read the judge verdict.

- **All processed (non-blocked) tasks confirmed done** → merge to main and clean up:
  ```bash
  git -C "$ROOT" checkout main
  git -C "$ROOT" merge --no-ff "handle-queue/$STAMP" -m "merge(queue): handle-queue $STAMP"
  git worktree remove "$ROOT/handle-queue-$STAMP"
  git -C "$ROOT" branch -d "handle-queue/$STAMP"
  ```
  (If the main checkout had unrelated uncommitted changes from Step 0, do not switch its branch out from under them — instead report that the branch `handle-queue/$STAMP` is ready to merge and skip the auto-checkout. Prefer safety over force.)

- **Any task failed the judge** (implemented but criteria not met) → do **not** merge. Leave `handle-queue/$STAMP` and its worktree in place for inspection; report which tasks failed and why.

- **Blocked tasks exist but everything else passed** → merge the passing work as above; the blocked task files remain in the queue on main for a future run.

---

## Step 6 — Report

```
## Queue Run — handle-queue-<stamp>

Waves executed : <n>
Completed      : <ids>            (verified + merged)
Failed judge   : <ids or none>    (implemented, criteria not met — worktree kept)
Blocked        : <ids or none>    (stopped on a question — still queued)

Merged to main : <yes / no — reason>
Worktree       : <removed / kept at $ROOT/handle-queue-<stamp>>

### Open questions from blocked tasks
- <id>: <the exact question>
  → answer, then `/queue-refine` (or edit the task file) and re-run `/queue-run`.

Remaining queue depth: <count of .claude/queue/tasks/*.md on main>
```

---

## Hard rules

- Always read `.claude/queue/plan.md` before doing any work; it dictates concurrency.
- Never implement a task outside its worktree. Sequential tasks → `<wt>`; parallel tasks → their sub-worktree.
- Commit after **every** task. One task = one commit (parallel tasks arrive via `merge --no-ff`).
- Never guess through a genuine blocking ambiguity — stop the task and surface the question.
- Only auto-merge to main when the judge confirms the processed tasks; never merge failed tasks.
- Never delete a task file here — deletion is `/queue-judge`'s job, and only for verified tasks.
- Clean up every sub-worktree and temporary branch you create (on success). Leave worktrees only for blocked/failed tasks that need inspection.
