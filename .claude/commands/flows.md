Explain the command workflows — when each is used and what it changes. Usage: `/flows` for a short overview then pick a workflow, or `/flows <topic>` (e.g. `/flows queue`, `/flows uc-generate`) to go straight to the deep dive.

## What you are doing

You are the **workflow guide** for this project's Claude Code methodology. You help the user understand which command workflow to use when, and exactly what each one changes on disk. You write **no files** and change **no code** — this command only explains. Everything is printed to the user.

Base every answer on the **Reference** section below (it is the source of truth). If the user asks about a specific command, you may also read the matching `.claude/commands/<name>.md` for finer detail, but do not dump the whole file — summarise.

---

## Step 0 — Parse `$ARGUMENTS`

- **Empty** → run **Mode A** (overview + prompt).
- **Non-empty** → run **Mode B** (deep dive). Match the argument case-insensitively:
  - contains `queue` → the **Work Queue** family. If it names a specific `queue-*` command, focus there.
  - contains `cr` or `change` → the **Change Request** family.
  - contains `uc-<something>` or a bare command name → that specific command's entry.
  - contains `spec`, `pipeline`, `uc`, `design`, or `build` → the **UC Spec Pipeline** family.
  - no match → say so, then fall back to Mode A.

---

## Mode A — overview, then prompt

Print this overview verbatim (tighten only if needed):

> **Three workflow families drive this project:**
>
> | Family | Use it when… | Produces / changes |
> |---|---|---|
> | **1. UC Spec Pipeline** | You are designing & building a *feature* (a Use Case) from scratch, in order | `.claude/architecture/<UC>/` artifacts, then real backend + frontend code |
> | **2. Change Request loop** | Testing/using the app revealed a *bug or gap* needing a scoped fix | a `cr/<name>` branch + worktree, then distilled lessons folded back into the agents |
> | **3. Work Queue** | You have a *bag of loose tasks* to batch through, some in parallel | `.claude/queue/` task files, then committed code merged to main |
>
> The UC pipeline is the backbone (spec → architecture → implementation). The CR loop keeps the spec and the agent instructions honest after bugs. The queue is for ad-hoc work that isn't a full UC.

Then **prompt the user to choose** (use the AskUserQuestion tool if available, otherwise ask in text):

- `1` / `uc` — the UC Spec Pipeline (uc-suggest, uc-generate, uc-develop, and the positioning/maintenance commands)
- `2` / `cr` — the Change Request loop (cr-start → cr-capture → cr-propagate → cr-clean)
- `3` / `queue` — the Work Queue (queue-add → refine → plan → run → judge)
- a specific command name (e.g. `uc-shift`, `uc-reconcile`) to jump straight in

When they answer, continue as **Mode B** for that choice.

---

## Mode B — deep dive

For the chosen family or command, present, in this order:
1. **When to use it** (and when *not* to).
2. **The command sequence** (the happy path, arrows between commands).
3. **What each step changes** — the concrete files/branches it writes.
4. **Gotchas** — two-pass approval gates, ordering rules, cleanup.

Pull the content from the Reference below. End by offering the sibling families (`/flows` to see all again).

---

# Reference

## Cross-cutting concepts

- **Two-pass commands** produce a *draft report* and stop. You review it, set `status: approved` in its frontmatter, then re-run the same command to apply. Nothing destructive happens before approval. Two-pass: `uc-enrich`, `uc-shift`, `uc-insert`, `uc-retrospec`, `uc-patch`, `uc-reconcile`, `cr-propagate`.
- **Cumulative vs diff artifacts** — `ClassDiagram.md`, `openapi.yaml`, `FrontendState.md`, `selectors.yaml` always show the *full* state at the end of a UC. The `*Diff.md` files show only that UC's delta.
- **`business-rules.json`** — emitted per UC by `/uc-generate` (the `br-synthesizer` agent). Structured Business Rules with dependency edges + cross-artifact anchors; this is what the visualiser's **BR Net** panel renders. Node coordinates live separately in `br-positions.json` (owned by the viewer, never by the agents).
- **usecases.md** — the chain index (`UC-001 … UC-NNN`, each with a status).

## Family 1 — UC Spec Pipeline

**When:** building a feature as a numbered Use Case, spec-first. This is the backbone.

**Happy path:**
```
/uc-suggest UC-011      → write suggestion.md (Draft) → you set status: Approved
/uc-generate UC-011     → architects + contract-validator + br-synthesizer produce all artifacts
/uc-develop             → implement every Approved UC (backend + frontend + tests)
```

**What each changes:**
- **`/uc-suggest <UC> [baseline-UC]`** — creates/updates `.claude/architecture/<NNN-slug>/suggestion.md` (the human design brief: module, entities, endpoints, DTOs, **Business Rules table**, components, routes). Not two-pass. A second arg anchors the suggestion to a non-adjacent baseline (for later `/uc-shift`).
- **`/uc-enrich <UC>`** *(two-pass)* — scans UC-002…N for mentions of this UC's concepts, classifies findings (awareness-BR / touch-md / cr-patch / conflict), and appends a **Chain Awareness** section to `suggestion.md`. Writes `enrich-report.md` first.
- **`/uc-generate <UC>`** — the big one. Runs `backend-architect`, `frontend-architect`, `contract-validator`, `br-synthesizer`, `postman-builder`. Writes `ClassDiagram.md`(+Diff), `openapi.yaml`(+Diff), `FrontendState.md`(+Diff), `selectors.yaml`(+Diff), `mockups/*.html`(+Diff), `ComponentInventory.md`, `contract-validation.json`, `testState.md`(+Diff), **`business-rules.json`**, any `touch.md` files, updates `usecases.md` + the Postman collection. Fails closed if the contract validator returns FAIL.
- **`/uc-develop`** — implements all `Approved` UCs in order via developer + tester agents; writes real source code and tests; ends a UC as `Done` or `Needs Human Review`.

**Positioning (change where a UC sits in the chain):**
- **`/uc-shift <UC> <position>`** *(two-pass)* — renumbers folders, updates frontmatter/diff headers/`usecases.md`/`touch.md`. Writes `shift-plan.md` first.
- **`/uc-insert <UC-NNNx>`** *(two-pass)* — inserts a UC mid-chain using a letter suffix (e.g. `UC-003b`) without renumbering everything.
- **`/uc-retrospec <UC-NNNx>`** *(two-pass)* — writes a *retroactive* spec for code that already exists, plus a **bridge UC** to apply the delta to the running codebase.

**Maintenance:**
- **`/uc-patch <UC>`** *(two-pass)* — small change to a `Done` UC (BR tweak, validation, UI copy). Escalates to `/uc-suggest` if schema/API changes. Commits `fix(UC-xxx): … [P1]`.
- **`/uc-reconcile <UC>`** *(two-pass)* — after `Needs Human Review`, diffs spec vs implementation, classifies each divergence FIX_SPEC / FIX_CODE / NEEDS_PATCH / ACCEPTED, and applies the spec fixes.
- **`/uc-prep [UC]`** — reads `touch.md` files to report what an earlier UC could have designed differently. Read-mostly.
- **`/uc-status [UC]`** — read-only status report of the chain / one UC. Writes nothing.
- **`/uc-cleanup <UC>`** — merges the UC's suggestion branch to main, removes its worktree + branch.

## Family 2 — Change Request loop

**When:** using or testing the app surfaced a bug or gap that needs a scoped fix *outside* the UC pipeline — and whose lesson should harden the agents so it doesn't recur.

**Happy path:**
```
/cr-start fix-calendar-crash   → branch cr/… + worktree + stub cr.md
   (fix the bug in the worktree)
/cr-capture fix-calendar-crash → analyse the diff, root-cause, write full cr.md
   (merge the branch to main)
/cr-propagate                  → fold the lessons into agent Hard Rules + uc-suggest
/cr-clean                      → archive to past-crs.md, delete CR staging folders
```

**What each changes:**
- **`/cr-start <name>`** — creates branch `cr/<name>`, a worktree, and `.claude/architecture/CR-<name>/cr.md` (stub).
- **`/cr-capture [name]`** — reads `git diff main...cr/<name>`, maps changed files to owning UC domains, does root-cause + stage attribution, writes the completed `cr.md` (`status: pending-propagation`). No source changes.
- **`/cr-propagate`** *(two-pass)* — collects all `pending-propagation` CRs, groups recommendations by target file, writes `propagate-report.md`; on approval appends rules to agent **Hard Rules** sections and `uc-suggest` **Past CR Lessons**.
- **`/cr-clean`** — appends each propagated CR's full record to `past-crs.md` (append-only) and deletes the `CR-*` staging folders + `propagate-report.md`.

> Run `/cr-propagate` every ~3–5 CRs, then `/cr-clean`. This is the loop that keeps the agents learning from real bugs.

## Family 3 — Work Queue

**When:** you have a set of loose, independent-ish tasks (not full UCs) to batch through — some safely in parallel.

**Happy path:**
```
/queue-add   <task text>   → one task file per call (repeat freely)
/queue-refine              → front-load the questions; sharpen every task
/queue-plan                → group tasks into waves (sequential vs parallel)
/queue-run                 → execute in a dated worktree, commit per task, judge, auto-merge to main
```

**What each changes:**
- **`/queue-add <desc>`** — writes exactly one `.claude/queue/tasks/<NN>-<slug>.md` (`status: queued`), your wording preserved verbatim. Commits on main.
- **`/queue-refine`** — reads the whole queue against the codebase, asks you the blocking questions once (batched), and folds answers into each task's **Context & decisions** + **Acceptance criteria** (`status: refined`). Writes only inside `.claude/queue/`.
- **`/queue-plan`** — computes each task's file footprint and dependencies, groups into **waves** (parallel-safe within a wave, waves run in order), writes `.claude/queue/plan.md` and updates task frontmatter. No source changes.
- **`/queue-run`** — creates `handle-queue-<yymmdd>` worktree, runs waves (parallel tasks in sub-worktrees, merged back), **commits after every task**, invokes `/queue-judge`, and auto-merges to main only if the judge passes. Blocked/ambiguous tasks stop and are surfaced, not guessed.
- **`/queue-judge`** — verifies each task's acceptance criteria against the real project, **deletes the file** for every task confirmed done (that is how the queue drains), keeps + annotates the rest. Writes `judge-report.md`.

---

## The agents behind the commands (for reference when asked)

- **backend-architect / frontend-architect** — design the artifacts in `/uc-generate` (schema, API, store, selectors, mockups). No source code.
- **contract-validator** — checks `openapi.yaml` against `FrontendState.md` + `selectors.yaml`; gates `/uc-generate`.
- **br-synthesizer** — emits `business-rules.json` (BR graph data) in `/uc-generate`.
- **postman-builder** — maintains the Postman collection/environment.
- **backend-developer / frontend-developer** — write real code in `/uc-develop`, `/uc-patch`, `/queue-run`.
- **backend-tester / frontend-tester** — write/verify tests.
- **obsidian-scribe** — documentation/notes.

## Hard rules

- Explain only. Never create, edit, or delete files, and never run any of these workflows from here.
- Always ground the deep dive in this Reference (and optionally the specific command file), not from memory of another project.
- If unsure which family fits the user's situation, ask one clarifying question, then recommend one.
