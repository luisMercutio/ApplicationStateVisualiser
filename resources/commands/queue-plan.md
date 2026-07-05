Analyze the queue and decide what runs sequentially vs. in parallel. Writes `.claude/queue/plan.md` — the first thing `/queue-run` reads. Usage: `/queue-plan`

## What you are doing

You are producing the execution plan for the queue. You inspect every task, work out the dependencies between them (shared files, logical ordering, data flow), and group them into **waves**. Tasks in the same wave are independent and may run concurrently in separate sub-worktrees; waves run strictly in order. `/queue-run` reads this file first and uses it to fan out parallel agents where it is safe.

This command reads code and task files but writes only `.claude/queue/plan.md`.

---

## Step 1 — Load the queue

Glob `.claude/queue/tasks/*.md` and read all of them.

If none exist: stop — "Queue is empty."

If any task has `status: queued` (not yet refined): warn — "Some tasks are not refined; the plan may be coarse. Consider `/queue-refine` first." Then continue anyway.

---

## Step 2 — Determine the file/area footprint of each task

For each task, decide which files, directories, or domains it will most likely change. Use the `files` frontmatter and `## Context & decisions` if present; otherwise infer from the goal by searching the codebase (Grep/Glob/Explore).

Record a concrete footprint per task (e.g. `frontend/src/app/header/**`, `backend/.../BookingService.java`, a shared migration file).

---

## Step 3 — Derive dependencies

Two tasks **conflict** (must be sequential relative to each other) if any of:
- Their footprints overlap on the same file(s).
- One logically depends on the other's output (task B uses an API/field/component that task A creates).
- A task file already declares a `depends-on`.

Two tasks are **parallel-safe** with each other if their footprints are disjoint and neither depends on the other.

Be conservative: when unsure whether footprints overlap, treat them as conflicting (sequential). A wrong "parallel" guess causes merge conflicts; a wrong "sequential" guess only costs time.

---

## Step 4 — Build waves

- Wave 1 = all tasks with no unmet dependencies.
- Wave 2 = tasks whose dependencies are all satisfied by Wave 1.
- …continue until every task is placed.
- Within a wave, list tasks that share a footprint as a note — even inside a wave, tasks that overlap must be marked sequential-within-wave (run one after another), not concurrent.

Update each task file's frontmatter (`depends-on`, `parallel-safe`, `files`) to match your conclusions, and commit those alongside the plan.

---

## Step 5 — Write `.claude/queue/plan.md`

```markdown
---
generated: <today YYYY-MM-DD>
tasks: [<id>, <id>, ...]
waves: <n>
---

# Queue Execution Plan

> Read by `/queue-run` before anything else. Waves run in order; tasks within a
> wave marked parallel run concurrently in separate sub-worktrees and are merged
> back after each completes.

## Wave 1 — parallel
- **<id>** — <one-line what> · footprint: `<paths>` · deps: none
- **<id>** — <one-line what> · footprint: `<paths>` · deps: none

## Wave 2 — after Wave 1
- **<id>** — <one-line what> · footprint: `<paths>` · deps: <ids>

<!-- repeat per wave; a single-task wave is just sequential -->

## Sequential-within-wave notes
- <id> and <id> share `<path>` → run <id> then <id>, not concurrently.
  (or "none")

## Dependency rationale
- <id> depends on <id>: <one-line reason>
- ...

## Risk notes
- <anything the run should watch for: shared migrations, large-blast-radius files, uncertain footprints>
```

If the queue is fully sequential (everything conflicts), say so plainly: one task per wave. If fully independent, one wave with all tasks.

---

## Step 6 — Commit

```bash
git add .claude/queue/plan.md .claude/queue/tasks/
git commit -m "chore(queue): execution plan [queue-plan]"
```

---

## Step 7 — Report

```
## Queue Plan Ready

Waves: <n>   Tasks: <n>
Wave 1 (parallel): <ids>
Wave 2: <ids>
...
Max concurrency: <largest parallel group size>

Plan: .claude/queue/plan.md

Next:
  /queue-run   execute the queue using this plan
```

---

## Hard rules

- Write only `.claude/queue/plan.md` and task frontmatter. No source-code changes.
- Bias toward sequential when footprint overlap is uncertain — correctness over speed.
- Every task in the queue must appear in exactly one wave.
- Do not implement or design the tasks.
