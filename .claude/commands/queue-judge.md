Judge whether each queued task's change actually landed in the project, and delete the file for every task that passes. Usage: `/queue-judge` (also invoked automatically at the end of `/queue-run`)

## What you are doing

You step back and look at the project **as a whole** and decide, per task, whether its intended change was successfully applied. This is a verification pass, not an implementation pass — you write no source code. For every task you judge as genuinely done, you delete its task file (that is how the queue drains). For tasks that were not applied (or only partially), you keep the file and record what is missing.

You may be run standalone against the current checkout, or invoked by `/queue-run` against its `handle-queue-<yymmdd>` worktree. Operate on whichever working tree you are pointed at (default: the current directory's repo).

---

## Step 1 — Load the queue

Glob `.claude/queue/tasks/*.md` and read each.

If none exist: stop — "No tasks to judge; queue is empty."

Also read `.claude/queue/plan.md` if present, for footprint hints.

---

## Step 2 — Verify each task against reality

For each task, take its `## Acceptance criteria` (fall back to `## Goal` if a task was never refined) and check them against the actual project state — read the relevant source files, search for the expected symbols/endpoints/components, and where cheap and safe, confirm they exist and are wired in. Prefer evidence over assumption: cite the file/line that satisfies each criterion.

Assign one verdict per task:
- **done** — every acceptance criterion is demonstrably satisfied in the codebase.
- **partial** — some criteria met, others clearly not. Note exactly which.
- **not-applied** — no meaningful evidence the change was made.

Judge honestly. If the diff contradicts what a task claimed to do, say so rather than rubber-stamping. Do not mark a task done on the strength of a commit message alone — verify the code.

---

## Step 3 — Delete files for done tasks

For each task with verdict **done**:
- Delete its file `.claude/queue/tasks/<id>.md`.

Leave `partial` and `not-applied` task files in place, untouched (except you may append a short `## Judge note` recording what is missing, to help the next run).

---

## Step 4 — Write the verdict report

Write `.claude/queue/judge-report.md` (overwrite each run):

```markdown
---
judged: <today YYYY-MM-DD>
done: [<ids>]
partial: [<ids>]
not-applied: [<ids>]
---

# Queue Judge Report

## <id> — DONE
- <criterion> ✓ — <file:line evidence>
- ...

## <id> — PARTIAL
- <criterion> ✓ — <evidence>
- <criterion> ✗ — <what is missing>

## <id> — NOT-APPLIED
- No evidence found for: <criteria>
```

`/queue-run` reads this frontmatter to decide whether to auto-merge.

---

## Step 5 — Commit

```bash
git add -A .claude/queue/
git commit -m "chore(queue): judge results — <n> done, <n> partial, <n> not-applied [queue-judge]"
```

(When invoked by `/queue-run`, commit in that worktree with `git -C "$wt" ...`.)

---

## Step 6 — Report

```
## Queue Judged

Done (files deleted): <ids or none>
Partial (kept)      : <ids or none>
Not applied (kept)  : <ids or none>

Report: .claude/queue/judge-report.md
Remaining queue depth: <count of tasks/*.md>
```

---

## Hard rules

- Write no application/source code. This command only verifies and prunes the queue.
- Delete a task file **only** when its acceptance criteria are demonstrably met — never on a commit message or optimistic assumption.
- Never delete `partial` or `not-applied` task files; they remain queued.
- Base every verdict on cited evidence from the actual project state.
- Only ever delete files under `.claude/queue/tasks/`.
