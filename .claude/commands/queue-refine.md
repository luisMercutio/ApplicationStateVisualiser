Refine the work queue: surface the questions that would otherwise block development, get answers, and rewrite the task files so `/queue-run` needs to ask as little as possible. Usage: `/queue-refine`

## What you are doing

The queue often contains half-formed tasks — a few bulletpoints each. Before execution, you read the **whole** queue against the actual codebase, find the ambiguities and decisions that a developer would hit, ask the user those questions now (batched, once), and fold the answers back into each task file as concrete context and acceptance criteria.

The goal is to **front-load** the questions here so the `/queue-run` agents rarely have to stop. This does not muzzle the run agents — they must still ask about anything genuinely unresolved — but a well-refined queue means that should be rare.

This command reads code but writes only inside `.claude/queue/`.

---

## Step 1 — Load the queue

Glob `.claude/queue/tasks/*.md`. Read every task file in full.

If none exist: stop — "Queue is empty. Add tasks with `/queue-add` first."

---

## Step 2 — Investigate against the codebase

For each task, and for the queue as a whole, build enough understanding to spot real ambiguities. Use Read / Grep / Glob / the Explore agent to check:
- Which existing files, components, endpoints, or UC domains the task touches.
- Whether the task conflicts with or overlaps another queued task.
- Naming, patterns, and conventions the change must follow (see `.claude/CHEATSHEET.md` and existing code).
- Anything under-specified: scope boundaries, edge cases, data shape, UX copy, which layer (backend/frontend), enum vs string choices, migration needs.

Do **not** design the solution. You are only finding the *decisions that must be made before* someone can implement confidently.

---

## Step 3 — Compose questions

Produce a focused list of questions, grouped by task id. Only ask what materially changes the implementation — skip anything you can safely infer from conventions (state the inference in the file instead).

Ask the user with the `AskUserQuestion` tool where the choices are discrete (recommend an option when you have a lean). For open-ended items, ask in prose. Batch everything into as few rounds as possible — ideally one.

If, after investigation, a task has **no** real open questions, say so and move on; you will still add the inferred context and acceptance criteria to its file.

---

## Step 4 — Rewrite each task file

For every task, rewrite the file incorporating the answers:

- Keep the frontmatter; set `status: refined`.
- Keep `## Goal` (the original intent) — you may tighten wording but must not lose scope.
- Fill `## Context & decisions` with:
  - The resolved answers (decision → chosen value + one-line rationale).
  - Inferred conventions you applied without asking.
  - Known files / components / endpoints involved.
  - Any cross-task dependency or overlap you noticed (note it here; `/queue-plan` formalizes it).
- Fill `## Acceptance criteria` with concrete, checkable statements — this is the contract `/queue-judge` verifies against. Prefer observable outcomes ("header shows a Logout button that clears the session and routes to /login") over implementation notes.

If a question was left unanswered by the user, record it explicitly under `## Context & decisions` as an **Open question** so the run agent knows to raise it rather than guess.

---

## Step 5 — Commit

```bash
git add .claude/queue/tasks/
git commit -m "chore(queue): refine tasks [queue-refine]"
```

---

## Step 6 — Report

```
## Queue Refined

Tasks refined: <n>
Questions asked: <n answered> / <n total>
Still open (run agents will raise these):
  - <task-id>: <short open question>   (or "none")

Next:
  /queue-plan   decide sequential vs parallel execution
  /queue-run    execute the queue
```

---

## Hard rules

- Write only inside `.claude/queue/`. Never modify source code here.
- Do not implement or design the tasks — only clarify and record decisions.
- Never drop or narrow a task's original scope without the user confirming it.
- Batch questions; do not interrogate the user one item at a time.
- Every refined task must end with at least one acceptance criterion.
