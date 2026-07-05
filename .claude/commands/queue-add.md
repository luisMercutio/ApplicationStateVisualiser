Add a task to the work queue. Usage: `/queue-add <task description or bulletpoints>`

## What you are doing

You are appending one task to the persistent work queue at `.claude/queue/tasks/`. Each task is a single markdown file. The queue is processed later by `/queue-run`, and individual files are deleted by `/queue-judge` once their change is verified as applied. This command only captures intent — it does **not** design, plan, or implement anything.

Keep it lightweight: the user may paste only a few bulletpoints. Capture them verbatim; `/queue-refine` will sharpen them later.

---

## Step 1 — Validate input

From $ARGUMENTS take the raw task text (may be multi-line bulletpoints).

If $ARGUMENTS is empty: abort — "Provide a task description, e.g. `/queue-add add a logout button to the header`."

Derive:
- `<title>` — a one-line summary of the task (imperative, ≤ 80 chars).
- `<slug>` — lowercased title: replace spaces/underscores with hyphens, strip anything not alphanumeric or hyphen, collapse repeats, trim to ~50 chars.

---

## Step 2 — Ensure the queue folder exists

Work in the **main working directory** (the queue lives on `main` so it is durable across sessions and visible to every worktree).

```bash
mkdir -p .claude/queue/tasks
```

---

## Step 3 — Determine the sequence number

Glob `.claude/queue/tasks/*.md`.
- Read the leading two-digit prefix (`NN`) of each filename.
- `<NN>` = highest existing number + 1, zero-padded to two digits. If none exist, `<NN>` = `01`.

The filename is `<NN>-<slug>.md`. If that exact path already exists, append `-2`, `-3`, … to the slug until unique.

---

## Step 4 — Write the task file

Create `.claude/queue/tasks/<NN>-<slug>.md`:

```markdown
---
id: <NN>-<slug>
status: queued
created: <today YYYY-MM-DD>
depends-on: []
parallel-safe: unknown
files: []
---

# Task: <title>

## Goal

<the raw $ARGUMENTS text, preserved verbatim — bulletpoints kept as-is>

## Context & decisions

<!-- Filled by /queue-refine after questions are answered. Empty for now. -->

## Acceptance criteria

<!-- Filled by /queue-refine. Used by /queue-judge to verify the change landed. -->
```

Field meanings (do not change here — later commands own them):
- `status`: `queued` → `refined` (by /queue-refine) → `done` (by /queue-judge).
- `depends-on`: task ids this one must run after. Filled by /queue-plan.
- `parallel-safe`: whether it can run concurrently with its wave. Filled by /queue-plan.
- `files`: anticipated file/area list. Filled by /queue-plan.

---

## Step 5 — Commit on main

```bash
git add .claude/queue/tasks/<NN>-<slug>.md
git commit -m "chore(queue): add task <NN>-<slug>"
```

---

## Step 6 — Report

```
## Queued — <NN>-<slug>

Title: <title>
File : .claude/queue/tasks/<NN>-<slug>.md
Queue depth: <count of *.md in tasks/>

Next:
  /queue-add  <more tasks>   add more
  /queue-refine              sharpen the queue and answer open questions
  /queue-plan                decide sequential vs parallel execution
  /queue-run                 execute the queue in a fresh worktree
```

---

## Hard rules

- Never write outside `.claude/queue/tasks/`. This command creates exactly one file.
- Preserve the user's wording in `## Goal`. Do not rephrase or "improve" the task here — refinement is `/queue-refine`'s job.
- Do not touch `plan.md`, other task files, or any source code.
