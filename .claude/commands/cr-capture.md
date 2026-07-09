Analyze the diff of a completed change request and write the full cr.md. Usage: `/cr-capture fix-calendar-crash`

## What you are doing

You are reading the diff between the CR branch and main, determining what the change did, which Epic domain it touched, what caused the gap in the original design or implementation, and what concrete recommendations should be propagated back into the Epic pipeline. The output is a completed `cr.md` that `/cr-propagate` can act on.

Run this after the fix is complete and ready to merge — but before or after merging, either works.

---

## Step 1 — Resolve the CR name and folder

**If $ARGUMENTS is provided:** normalize it as `<cr-name>` (lowercase, spaces → hyphens).

**If $ARGUMENTS is empty:** auto-detect from the current branch:
```bash
git branch --show-current
```
If the branch name matches `cr/<something>`, use `<something>` as `<cr-name>`. Otherwise abort — "Not on a CR branch and no name provided. Usage: `/cr-capture <cr-name>`."

Verify `.claude/architecture/CR-<cr-name>/cr.md` exists. If not: abort — "No stub found for CR-<cr-name>. Run `/cr-start <cr-name>` first."

---

## Step 2 — Read the diff

Get the full diff of the CR branch against main:

```bash
git diff main...cr/<cr-name>
```

Also get a file-level summary:
```bash
git diff main...cr/<cr-name> --stat
```

If the diff is empty: abort — "No changes found on `cr/<cr-name>` vs main. Nothing to capture."

Read the full diff output. Note:
- Which files were modified, added, or deleted
- The nature of each change (new field, new method, new component, test added, config changed, etc.)
- Whether the change is backend-only, frontend-only, or both

---

## Step 3 — Map to Epic domains

From the changed file paths, determine which Epic(s) own the relevant domain:

- Backend entity/service files → check which Epic's `ClassDiagram.md` first introduced those entities. Use glob `.claude/architecture/*/ClassDiagram.md` and scan for the class name.
- Frontend component/state files → check which Epic's `ComponentInventory.md` or `FrontendState.md` first introduced those components/slices.
- API endpoints added or changed → check which Epic's `openapi.yaml` first declared them.

Read the matched Epic(s)' `suggestion.md`, `ClassDiagramDiff.md`, and `openapiDiff.md` to understand what was originally designed for that domain.

---

## Step 4 — Root cause analysis

Compare what the diff actually implements against what the original Epic designed. Determine which category the gap falls into:

**`suggestion`** — the relevant BR was absent, ambiguous, or wrong in the Epic's `suggestion.md`. The architect agents had no signal to design for this. Examples:
- A validation rule was never stated as a BR
- An edge case (overlap, null, concurrent edit) was not mentioned in scope
- A business invariant was assumed implicit and never written down

**`architecture`** — the suggestion had the right intent but the architect agents produced a schema, API, or store design that could not support it cleanly. Examples:
- A missing index caused a correctness/performance issue
- An API response was missing a field the UI needed
- A DB relationship was modelled wrong (1:N vs N:M)
- The NgRx store shape made a required computation awkward

**`implementation`** — the architecture was correct but the developer agents deviated, skimped, or missed an edge case in code. Examples:
- A DB constraint was in the ClassDiagram but not applied in the migration
- A validation in the spec was not implemented in the service
- Error handling for a documented failure case was absent

**`testing`** — the implementation was correct but the test suite did not exercise the broken path, so the regression was undetectable. Examples:
- The testState.md did not include a test for the failing scenario
- A test existed but was too coarse (happy path only, no boundary cases)

Write a 1–3 sentence root cause explanation and pick the single most culpable stage.

---

## Step 5 — Write recommendations

For each recommendation target, write a specific, actionable item. "None" is a valid answer when a target is not implicated.

**Suggestion checklist item** — a question or check that `/epic-suggest` should ask for future Epics in the same domain. Make it general enough to apply beyond this specific fix:
- Good: "Ask: What happens if two bookings for the same entity overlap in time?"
- Bad: "Fix the calendar crash" (too specific, not reusable)

**Architect agent rule** — a guard or output requirement to add to the relevant architect agent's Hard Rules. Specify which agent (backend, frontend, or both):
- Good: "Backend architect: When designing any entity that represents a time range (start/end dates), always check for and add a DB-level constraint or index that prevents overlapping rows."
- Bad: "Add an overlap check" (too vague)

**Developer agent rule** — a pattern or check to add to the relevant developer agent's Hard Rules. Specify which agent:
- Good: "Backend developer: When implementing a service method that persists a time-ranged entity, always query for conflicts before saving and throw a domain exception if found."
- Bad: "Check for conflicts" (too vague)

**Tester agent rule** — a test category or scenario type to add to the tester agent's checklist. Specify which agent:
- Good: "Backend tester: For any endpoint that writes a time-ranged entity, always include a test for the overlap conflict case (expect 409)."
- Bad: "Test edge cases" (too vague)

---

## Step 5b — Derive missing business rules for existing Epics

For each related Epic identified in Step 3, read its current `suggestion.md` and ask: **if this Epic's suggestion had been written correctly from the start, which BRs would have been present or differently worded to prevent this CR entirely?**

Write one BR entry per gap. Each entry must be:
- **Specific and self-contained** — written as a real BR that could be dropped verbatim into the suggestion's Business Rules table (with a new BR-NNN id)
- **Scoped to the owning Epic** — do not invent BRs that belong to a different Epic's domain
- **Preventive, not descriptive** — phrase it as a rule that constrains behavior, not as a description of what the fix does

Good: `"BR-008: After setup check passes, the app-initializer checks localStorage for a stored refresh token; if one exists it calls POST /auth/refresh — on success tokens are stored and NgRx currentUser is populated via a restoreSession action (no navigation); on failure tokens are cleared; if no token exists the initializer does nothing and AuthGuard redirects to /login."`

Bad: `"Add a business rule about refresh tokens"` (too vague), `"The bug was fixed by adding session restore"` (descriptive, not preventive)

If the stage attribution is `architecture`, `implementation`, or `testing` — the suggestion's BRs may have been fine, and this section should say "None — the suggestion BRs were sufficient; the gap was downstream."

---

## Step 6 — Write the completed cr.md

Overwrite `.claude/architecture/CR-<cr-name>/cr.md`:

```markdown
---
cr-id: CR-<cr-name>
branch: cr/<cr-name>
related-epics: [<EPIC-NNN>, ...]
stage-attributed-to: suggestion | architecture | implementation | testing
status: pending-propagation
created: <original created date from stub>
captured: <today YYYY-MM-DD>
---

# CR: <cr-name>

## What changed

<1–3 sentence functional summary of the fix — what the user experienced, what the code now does differently.>

## Related feature domain

**Epic(s):** <EPIC-NNN> — <Epic title>
**Domain:** <which feature area: auth, bookings, calendar, pricing, etc.>

## Root cause

<1–3 sentences: what in the original design or implementation caused this gap.>

## Stage attribution

**Stage:** `suggestion` | `architecture` | `implementation` | `testing`
**Reasoning:** <one sentence explaining why this stage is the root cause, not a downstream symptom.>

## Missing business rules for existing Epics

<For each related Epic, list the BR(s) that should have existed in its suggestion.md to prevent this CR. Use the exact BR text that could be added verbatim to that Epic's Business Rules table. Or "None — the suggestion BRs were sufficient; the gap was downstream.">

| Epic | BR id | Rule text |
|---|---|---|
| <EPIC-NNN> | BR-<NNN> | <full rule text> |

## Recommendations

### For epic-suggest (checklist question for future Epics in this domain)

<Specific question to add to the epic-suggest checklist, or "None.">

### For backend architect

<Specific rule or guard to add to backend-architect.md, or "None.">

### For frontend architect

<Specific rule or guard to add to frontend-architect.md, or "None.">

### For backend developer

<Specific implementation pattern to add to backend-developer.md, or "None.">

### For frontend developer

<Specific implementation pattern to add to frontend-developer.md, or "None.">

### For backend tester

<Specific test category or scenario type to add to backend-tester.md, or "None.">

### For frontend tester

<Specific test category or scenario type to add to frontend-tester.md, or "None.">
```

---

## Step 7 — Commit the completed cr.md

Stage and commit on the CR branch:
```bash
git add .claude/architecture/CR-<cr-name>/cr.md
git commit -m "docs(cr): capture analysis for CR-<cr-name>"
```

If already on main (post-merge), commit directly to main.

---

## Step 8 — Report to the user

```
## CR Captured — CR-<cr-name>

Related Epic(s) : <EPIC-NNN>: <title>
Stage         : <stage-attributed-to>
Root cause    : <one-sentence summary>

Missing BRs identified for:
  <list each Epic that has at least one BR entry, or "None">

Recommendations written for:
  <list each target that has a non-None recommendation>

Next steps:
1. Review .claude/architecture/CR-<cr-name>/cr.md
2. Merge cr/<cr-name> → main when the fix is ready
3. Run /cr-propagate when you have several CRs accumulated to apply learnings to the pipeline
```
