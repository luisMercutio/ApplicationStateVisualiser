# UC Develop

Batch-implement all use cases with approved architecture. For each UC where `Status = Approved` in `usecases.md`, this skill runs the full implementation pipeline: backend + frontend development in parallel, followed by backend + frontend testing in parallel, with one automatic deprecation-fix round if testers find issues.

---

## Step 1 — Find Approved UCs

Read `.claude/architecture/usecases.md`. Collect all rows where **Status = `Approved`**.

Exclude any row where Status is `Retroactive` — retroactive specs are never developed in the current environment. If the only Approved rows are Retroactive, treat the list as empty.

For each remaining Approved UC, resolve its folder:
1. Extract the 3-digit UC number (strip `UC-` prefix, zero-pad → e.g. `001`).
2. Glob `.claude/architecture/${NNN}-*/` — if exactly one match, use it as `<uc-folder>`.
3. Fallback: `.claude/architecture/<UC-ID>/` (legacy naming).

Then read `<uc-folder>/suggestion.md` frontmatter. If the frontmatter contains a `bridge-for` field, mark that UC as a **Bridge UC** and record the retrospec origin ID. Normal UCs have no `bridge-for` field.

If the list is empty:
> No use cases with status `Approved` found. Architecture must be generated (`/uc-generate`) and approved before development can begin.

Stop.

---

## Step 2 — Process Each UC Sequentially

For each UC ID in the Approved list — normal UCs first, then Bridge UCs — execute Steps 3–10 in full before moving to the next UC.

**Bridge UC pre-check (Bridge UCs only — run before Step 3):**

Read the retrospec origin ID from `bridge-for` in the Bridge UC's `<uc-folder>/suggestion.md`. Resolve the retrospec folder: glob `.claude/architecture/<retrospec-NNN>-*/`, call it `<retrospec-folder>`. Then spawn the **backend-developer** agent with this single probe task:

```
Bridge idempotency check for <bridge-UC-ID> (origin: <retrospec-ID>).

Read <retrospec-folder>/ClassDiagramDiff.md and openapiDiff.md.
Extract the key artifacts introduced by the retrospec: table names, column names, class names,
Liquibase changeset IDs, Angular component selectors, and NgRx feature keys.

Check the current codebase (backend/ and frontend/) to determine whether these artifacts
already exist. Report: ALREADY_APPLIED (all key artifacts present) or NOT_APPLIED (at least
one key artifact is absent).
```

- If the probe reports `ALREADY_APPLIED`: skip Steps 3–9. Jump directly to Step 9 with outcome `Done (No-op — retrospec already applied)`. Log this clearly in the final report.
- If the probe reports `NOT_APPLIED`: continue from Step 3 with the full development pipeline. Ensure both developer agents receive the idempotency note from the Bridge UC suggestion.md — they must use Liquibase `preConditions onFail="MARK_RAN"` on all changesets and check for existing files before creating them.

---

## Step 3 — Mark In Development

Edit `.claude/architecture/usecases.md`: set the UC's Status to `In Development` and update the date to today.

---

## Step 4 — Round 1: Develop (parallel)

Spawn the **backend-developer** and **frontend-developer** agents in a single parallel call.

**backend-developer prompt:**
```
Implement the backend for <UC-ID>. Read all inputs from <uc-folder>/. Use the diff files to scope your work to only what changed in this UC. Follow your full implementation workflow (migrations → entities → DTOs → services → controllers → tests). Report: files created, migrations added, tests written, build status, test status.
```

**frontend-developer prompt:**
```
Implement the frontend for <UC-ID>. Read all inputs from <uc-folder>/. Use the diff files to scope your work to only what changed in this UC. Follow your full implementation workflow (models → actions → reducer → selectors → service → effects → guards → components → tests). Report: files created, tests written, build status, test status.
```

Wait for both. If either agent reports a build failure or an unresolvable architectural ambiguity, stop and surface the error to the user. Do not proceed to testing until both sides build cleanly.

---

## Step 5 — Mark Testing

Edit `.claude/architecture/usecases.md`: set Status to `Testing`.

---

## Step 6 — Round 1: Test (parallel)

Spawn the **backend-tester** and **frontend-tester** agents in a single parallel call.

**backend-tester prompt:**
```
Run the backend test suite and deprecation audit for <UC-ID>. Read testState.md from <uc-folder>/. Write your report to <uc-folder>/test-report-backend.md.
```

**frontend-tester prompt:**
```
Run the Angular test suite and deprecation audit for <UC-ID>. Read testState.md from <uc-folder>/. Write your report to <uc-folder>/test-report-frontend.md.
```

Wait for both.

---

## Step 7 — Evaluate Reports

Read `<uc-folder>/test-report-backend.md` and `<uc-folder>/test-report-frontend.md`. Find the `## Status` line in each.

- Both `CLEAN` → skip Step 8, go to Step 9.
- Either `NEEDS_FIX` → continue to Step 8.

---

## Step 8 — Round 2: Fix and Retest

This round executes only once. Do not loop again after Round 2.

### 8a — Mark Fixing Deprecations

Edit usecases.md: Status = `Fixing Deprecations`.

### 8b — Spawn fix agents (parallel for both sides that need fixes)

**backend-developer fix prompt (only if backend Status = NEEDS_FIX):**
```
Deprecation fix round for <UC-ID>. Read <uc-folder>/test-report-backend.md. Under "Action Items for Backend Developer", apply every listed fix. Replace deprecated patterns with their modern equivalents exactly as specified. Do not change any architectural decisions or add new functionality. After applying all fixes, re-run: ./mvnw test -q. Report: action items resolved (with file + line), items skipped (with reason), final test status.
```

**frontend-developer fix prompt (only if frontend Status = NEEDS_FIX):**
```
Deprecation fix round for <UC-ID>. Read <uc-folder>/test-report-frontend.md. Under "Action Items for Frontend Developer", apply every listed fix. Replace deprecated patterns with their modern equivalents exactly as specified. Do not change any architectural decisions or add new functionality. After applying all fixes, re-run: ng test --watch=false. Report: action items resolved (with file + line), items skipped (with reason), final test status.
```

Spawn only the agents needed. If both sides need fixes, spawn them in parallel. Wait for all.

### 8c — Mark Re-Testing

Edit usecases.md: Status = `Re-Testing`.

### 8d — Round 2: Test (parallel)

Spawn backend-tester and/or frontend-tester again with the same prompts as Step 6 (they overwrite the previous report files).

Wait for both.

### 8e — Evaluate Round 2 Reports

Read both report files again.

- Both `CLEAN` → go to Step 9 with outcome `Done`.
- Either still `NEEDS_FIX` → go to Step 9 with outcome `Needs Human Review`. Collect all unresolved Action Items for the final summary.

---

## Step 9 — Final Status Update

Edit `.claude/architecture/usecases.md`:
- Outcome `Done` → Status = `Done`
- Outcome `Needs Human Review` → Status = `Needs Human Review`

Update the date to today.

---

## Step 10 — Commit

Read the UC title from `.claude/architecture/usecases.md` (the Title column for this UC ID).

Stage all files changed or created during this UC's pipeline:

```bash
git add backend/ frontend/ .claude/architecture/ 2>&1
```

Commit using the UC ID and title as the message. Format the message based on outcome:

- Outcome `Done`:
```bash
git commit -m "feat(<UC-ID>): <UC-Title>"
```

- Outcome `Done (No-op — retrospec already applied)` (Bridge UCs only):
```bash
git commit -m "feat(<UC-ID>): <UC-Title> [bridge no-op — retrospec already applied]"
```

- Outcome `Needs Human Review`:
```bash
git commit -m "feat(<UC-ID>): <UC-Title> [needs human review]"
```

If `git add` or `git commit` fails (e.g. nothing to commit, or a pre-commit hook error), record the failure and include it in the final report — do not stop processing remaining UCs.

---

## Step 11 — Report to User

After all Approved UCs are processed, output:

```
## UC Development Batch Complete

| UC ID | Title | Outcome | Rounds | Commit |
|---|---|---|---|---|
| UC-001 | ... | Done | 1 | feat(UC-001): ... |
| UC-002 | ... | Needs Human Review | 2 | feat(UC-002): ... [needs human review] |
| UC-003 | ... | Done | 1 | failed: <reason> |

### Unresolved Action Items (Needs Human Review only)
[Copy the Action Items sections from reports for any UC with Needs Human Review outcome]
```

---

## Status Lifecycle

```
Approved → In Development → Testing → Done
                                   ↘ Fixing Deprecations → Re-Testing → Done
                                                                       ↘ Needs Human Review

Approved [Bridge] → (idempotency probe) → ALREADY_APPLIED → Done (No-op)
                                        ↘ NOT_APPLIED     → In Development → Testing → Done
```

| Status | Meaning |
|---|---|
| `Approved` | Architecture approved, awaiting development |
| `In Development` | Developer agents running |
| `Testing` | Tester agents running (Round 1) |
| `Fixing Deprecations` | Developer agents applying tester action items |
| `Re-Testing` | Tester agents running (Round 2) |
| `Done` | All tests pass, no HIGH/MEDIUM deprecations |
| `Needs Human Review` | Round 2 still has issues — human intervention required |
| `Retroactive` | Spec-only UC inserted for chain correctness; never developed in current environment |