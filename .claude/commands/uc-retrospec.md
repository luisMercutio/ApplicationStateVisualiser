Insert a retroactive use case into the spec chain for regeneration correctness, and create a paired Bridge UC that applies the delta to the current codebase. Usage: `/uc-retrospec UC-003b`

## What you are doing

You are solving a split concern: a change conceptually belongs at position `UC-003b` in the spec chain, but the codebase is already at `UC-005` (or later) and cannot be rewound. This command creates two linked artifacts:

1. **The Retroactive UC (`UC-003b`)** — a full spec artifact anchored at `UC-003`. It is inserted into the spec chain so that fresh regenerations produce the correct logical ordering. It is **never developed in the current environment**.
2. **The Bridge UC** (next available number, e.g. `UC-006`) — a standard UC generated against the current last Done UC. It applies only the delta needed to bring the running codebase in line with the retrospec's intent. When developed in a fresh-regeneration context where `UC-003b` was already applied earlier in the chain, the Bridge UC is a no-op.

**Naming convention:** the retrospec ID must follow the pattern `UC-<N><letter>` (e.g. `UC-003b`). The numeric part identifies the anchor — the last Done UC before the insertion point. The letter orders multiple retrospecs at the same position.

---

## Step 1 — Parse arguments and derive position

From `$ARGUMENTS` (e.g. `UC-003b`):
- Strip the trailing letter(s) to get the **anchor ID** (e.g. `UC-003`).

If `$ARGUMENTS` contains no letter suffix abort:
> Plain numeric IDs are reserved for normal UC sequencing. For a retroactive insertion use a letter suffix, e.g. `UC-003b`.

---

## Step 2 — Validate the chain state

1. Read `.claude/architecture/usecases.md`.
2. Confirm the anchor row exists. If not, abort: "Anchor `<anchor>` not found in usecases.md."
3. Confirm the anchor's Status is `Done`. If not, abort:
   > Anchor `<anchor>` has status `<STATUS>`. Retroactive specs may only follow a fully implemented (`Done`) UC.
4. Identify the **current tail**: the last row in usecases.md with Status `Done`. This is the baseline for the Bridge UC generation.
5. Identify the **downstream Done UCs**: all rows between the anchor and the current tail (exclusive) with Status `Done`. These are candidates for optional spec-only diff regeneration.
6. Derive the **Bridge UC ID**: take the numeric part of the current tail UC, add 1. (e.g. tail is `UC-005` → Bridge is `UC-006`.) If that number is already taken, increment until a free slot is found.

---

## Step 3 — Re-entry detection

Look for `.claude/architecture/$ARGUMENTS/suggestion.md`.

- **Does not exist** → first run. Continue to Step 4.
- **Exists, `status: Draft`** → remind the user:
  > `$ARGUMENTS/suggestion.md` is still `Draft`. Approve it (set frontmatter `status: Approved`) then re-run `/uc-retrospec $ARGUMENTS`.
  Stop.
- **Exists, `status: Approved`** → re-entry after approval. Skip to Step 8.

---

## Step 4 — Summarise the baseline for the user

Read:
- `.claude/architecture/<anchor>/ClassDiagram.md`
- `.claude/architecture/<anchor>/FrontendState.md`
- `.claude/architecture/<anchor>/suggestion.md`
- `.claude/architecture/<current-tail>/ClassDiagram.md` — the current codebase state
- `.claude/architecture/<current-tail>/FrontendState.md`

Present two summaries:
- **Anchor state (insertion point):** what existed at `<anchor>` — entities, endpoints, slices
- **Current codebase state:** what exists now at `<current-tail>` — entities, endpoints, slices

Also show the downstream Done UCs so the user understands what sits between the insertion point and today.

---

## Step 5 — Guided suggestion session

Ask ALL of the following in a single message. Wait for complete answers.

1. **Title** — Short title for the retrospec UC.
2. **What it adds** — What feature, entity, endpoint, or rule should this UC introduce? (1–3 sentences)
3. **Why here?** — Why does this change conceptually belong at the `<anchor>` position rather than at the end of the chain?
4. **Forward delta** — What is NOT yet present in the current codebase (`<current-tail>`) that this change introduces? This becomes the Bridge UC's scope. If the current codebase already fully covers this change, say so — the Bridge UC will be a documented no-op.
5. **Business rules** — List each BR. Number them continuing from wherever the anchor's BRs ended.
6. **DB entities** — New or modified entities?
7. **Endpoints** — New or modified endpoints?
8. **Components** — Frontend components involved?

---

## Step 6 — Write the retrospec suggestion.md

Create `.claude/architecture/$ARGUMENTS/` and write `suggestion.md`:

```
---
type: uc-suggestion
uc: $ARGUMENTS
retrospec: true
anchor: <anchor-id>
bridge-uc: <bridge-UC-ID>
status: Draft
updated: <today YYYY-MM-DD>
---

# $ARGUMENTS: <Title> — Retroactive Spec

## Retrospec Context

| | |
|---|---|
| **Type** | Retroactive specification |
| **Anchor (follows)** | `<anchor-id>` (Done) |
| **Bridge UC** | `<bridge-UC-ID>` — forward application to current codebase |
| **Why retroactive** | <user's answer to Q3> |

> **Development note:** This UC is `Retroactive` — it is NEVER developed in the current environment. It exists so that fresh regenerations produce the correct spec chain ordering. The actual code change is applied via the Bridge UC `<bridge-UC-ID>`.

## Module Assignment

| | |
|---|---|
| **Application** | `staff` |
| **Domain** | `<domain-name>` |
| **Shared-lib** | `<shared components, or none>` |

## Database Entities

(mermaid erDiagram block — cumulative from anchor)

## Endpoints & DTOs

| Method | Path | Auth | Notes |
|---|---|---|---|

### Key DTOs

### Business Rules

| ID | Rule |
|---|---|
| BR-XXX | <rule text> |

## Frontend Components

| Component | Status | Notes |
|---|---|---|

### Services / Infrastructure

| Artifact | Type | Notes |
|---|---|---|

### Routes

| Path | Guard | Component |
|---|---|---|
```

---

## Step 7 — Tell the user what to do next

Inform the user:
- `$ARGUMENTS/suggestion.md` is written as `Draft`
- Review it — especially the **Retrospec Context** block and the business rules
- Set frontmatter to `status: Approved` to approve
- Re-run `/uc-retrospec $ARGUMENTS` — the command will detect the approved suggestion and proceed to generation

Stop here until the user re-runs.

---

## Step 8 — Generate retrospec architecture artifacts (re-entry point)

Read `$ARGUMENTS/suggestion.md`. Confirm `status: Approved`. If not, stop and remind the user.

Read `anchor` and `bridge-uc` from the frontmatter.

### 8a — Backend and frontend architects (parallel)

Spawn both in a single parallel call:

**backend-architect prompt:**
```
UC Design Mode for $ARGUMENTS (retroactive spec — anchored at <anchor>).

Suggestion:            .claude/architecture/$ARGUMENTS/suggestion.md
Previous ClassDiagram: .claude/architecture/<anchor>/ClassDiagram.md
Previous openapi:      .claude/architecture/<anchor>/openapi.yaml

Output directory: .claude/architecture/$ARGUMENTS/

Produce:
- ClassDiagram.md
- openapi.yaml
- ClassDiagramDiff.md
- openapiDiff.md
- testState-backend.md

Note: this UC is Retroactive — it will not be implemented in the current environment.
The architecture documents must be accurate for a fresh-regeneration developer reading them in sequence.
```

**frontend-architect prompt:**
```
UC Design Mode for $ARGUMENTS (retroactive spec — anchored at <anchor>).

Suggestion:               .claude/architecture/$ARGUMENTS/suggestion.md
Current openapi:          .claude/architecture/$ARGUMENTS/openapi.yaml
Previous FrontendState:   .claude/architecture/<anchor>/FrontendState.md
Previous selectors:       .claude/architecture/<anchor>/selectors.yaml

Output directory: .claude/architecture/$ARGUMENTS/

Produce:
- FrontendState.md
- selectors.yaml
- FrontendStateDiff.md
- selectorsDiff.md
- mockups/<ComponentName>.html
- mockupsDiff.md
- ComponentInventory.md
- testState-frontend.md

Note: this UC is Retroactive — it will not be implemented in the current environment.
```

Wait for both. Then run the contract validator:

**contract-validator prompt:**
```
Validate the API contract for $ARGUMENTS.

openapi:       .claude/architecture/$ARGUMENTS/openapi.yaml
FrontendState: .claude/architecture/$ARGUMENTS/FrontendState.md
selectors:     .claude/architecture/$ARGUMENTS/selectors.yaml

Write the validation report to: .claude/architecture/$ARGUMENTS/contract-validation.json
```

If validation fails, report errors and stop.

### 8b — Compile testState.md

Merge `testState-backend.md` and `testState-frontend.md` into `testState.md` (same format as `/uc-generate`). Write `testStateDiff.md` comparing against `<anchor>/testState.md`. Delete the two partial files.

---

## Step 9 — Optional: spec-only diff regeneration of downstream Done UCs

Inform the user:

> `$ARGUMENTS` has been inserted between `<anchor>` and `<first-downstream-done>`. The diff files for downstream Done UCs (`<list>`) were generated against a baseline that did not include `$ARGUMENTS`. Their cumulative state documents are still correct (the code is unchanged), but their diff files may attribute some changes to the wrong UC.
>
> Regenerating their diffs improves spec accuracy for future readers but does not affect the running codebase. Regenerate downstream diffs? (Recommended if this spec chain will be used for fresh deployments.)

If the user confirms, for each downstream Done UC in chain order, spawn both architects with this instruction:

**backend-architect prompt:**
```
Spec-diff-only regeneration for <downstream-UC-ID>.
The cumulative state (ClassDiagram.md, openapi.yaml) is CORRECT and must NOT be changed.
Only update the diff files to reflect the new baseline introduced by $ARGUMENTS.

Suggestion:            .claude/architecture/<downstream-UC-ID>/suggestion.md
Previous ClassDiagram: .claude/architecture/<new-prev-UC>/ClassDiagram.md
Previous openapi:      .claude/architecture/<new-prev-UC>/openapi.yaml
Current ClassDiagram:  .claude/architecture/<downstream-UC-ID>/ClassDiagram.md  [DO NOT CHANGE]
Current openapi:       .claude/architecture/<downstream-UC-ID>/openapi.yaml     [DO NOT CHANGE]

Output directory: .claude/architecture/<downstream-UC-ID>/

Produce ONLY:
- ClassDiagramDiff.md  (overwrite)
- openapiDiff.md       (overwrite)
Do NOT touch ClassDiagram.md, openapi.yaml, or testState-backend.md.
```

**frontend-architect prompt:**
```
Spec-diff-only regeneration for <downstream-UC-ID>.
The cumulative state (FrontendState.md, selectors.yaml) is CORRECT and must NOT be changed.
Only update the diff files to reflect the new baseline introduced by $ARGUMENTS.

Suggestion:             .claude/architecture/<downstream-UC-ID>/suggestion.md
Previous FrontendState: .claude/architecture/<new-prev-UC>/FrontendState.md
Previous selectors:     .claude/architecture/<new-prev-UC>/selectors.yaml
Current FrontendState:  .claude/architecture/<downstream-UC-ID>/FrontendState.md  [DO NOT CHANGE]
Current selectors:      .claude/architecture/<downstream-UC-ID>/selectors.yaml    [DO NOT CHANGE]

Output directory: .claude/architecture/<downstream-UC-ID>/

Produce ONLY:
- FrontendStateDiff.md  (overwrite)
- selectorsDiff.md      (overwrite)
- mockupsDiff.md        (overwrite)
Do NOT touch FrontendState.md, selectors.yaml, or testState-frontend.md.
```

Wait for each UC before proceeding to the next. The `<new-prev-UC>` is `$ARGUMENTS` for the first downstream UC, then the last regenerated downstream UC for each subsequent one.

---

## Step 10 — Create the Bridge UC suggestion

The Bridge UC applies the retrospec's delta to the current codebase. It is a standard UC that `/uc-develop` can process — but with special frontmatter that tells the developer agents to check for prior application.

Determine the Bridge UC ID (derived in Step 2).

Pre-populate its suggestion.md from the retrospec's content, adapted to the current-tail baseline:

```
---
type: uc-suggestion
uc: <bridge-UC-ID>
bridge-for: $ARGUMENTS
status: Draft
updated: <today YYYY-MM-DD>
---

# <bridge-UC-ID>: <Retrospec Title> — Bridge Application

## Bridge Context

| | |
|---|---|
| **Type** | Bridge UC (forward application) |
| **Retrospec origin** | `$ARGUMENTS` |
| **Baseline** | `<current-tail>` (current codebase state) |

> **Idempotency contract:** In a fresh-regeneration context where `$ARGUMENTS` was developed
> earlier in the chain, this UC's changes are already present in the codebase. Developer agents
> MUST check for prior application before writing any code:
> - **Backend:** use Liquibase `preConditions onFail="MARK_RAN"` on every changeset in this UC.
>   Check for the specific table columns, constraints, or classes introduced by `$ARGUMENTS`.
> - **Frontend:** check for the existence of files and components from `$ARGUMENTS` before
>   creating them. If already present, skip creation silently.
> A Bridge UC that finds everything already in place writes zero code and is committed as a no-op.

## Scope

<Populate from retrospec suggestion, but describe only the DELTA that is not yet in the current
 codebase at <current-tail>. If the current codebase already fully covers the retrospec's intent,
 write "No-op: all changes from $ARGUMENTS are already present at <current-tail>.">

## Module Assignment

(carry forward from retrospec)

## Database Entities

(describe only delta vs current-tail)

## Endpoints & DTOs

(describe only delta vs current-tail)

### Business Rules

(carry forward BR IDs from retrospec; mark each as DELTA or ALREADY-PRESENT)

## Frontend Components

(describe only delta vs current-tail)

### Services / Infrastructure

### Routes
```

Create the directory `.claude/architecture/<bridge-UC-ID>/` and write this as `suggestion.md`.

Tell the user:
- The Bridge UC suggestion is pre-populated at `.claude/architecture/<bridge-UC-ID>/suggestion.md`
- Review the **Scope** and **Business Rules** sections — delete any `ALREADY-PRESENT` items that are genuinely redundant
- Mark the Bridge suggestion as `Approved` when ready
- Run `/uc-generate <bridge-UC-ID>` then `/uc-develop <bridge-UC-ID>` to apply the delta to the running codebase

---

## Step 11 — Update usecases.md

1. Insert a row for `$ARGUMENTS` immediately after the anchor row. Status = `Retroactive`.
2. Add a row for `<bridge-UC-ID>` at the end of the table. Status = `Draft`.
3. Update the `Updated` date for the anchor row to today.

---

## Step 12 — Final report

```
## Retrospec Complete — $ARGUMENTS

Retrospec    : $ARGUMENTS — <title>  [Retroactive — spec only]
Anchor       : <anchor>
Bridge UC    : <bridge-UC-ID> — awaiting your review and approval

### Generated Artifacts ($ARGUMENTS)
<list files>

### Downstream Spec Regen
<list downstream UCs regenerated, or "Skipped by user">

### Bridge UC
.claude/architecture/<bridge-UC-ID>/suggestion.md — status: Draft

### Next Steps
1. Review the retrospec artifacts in .claude/architecture/$ARGUMENTS/
2. Review and edit the Bridge UC suggestion at .claude/architecture/<bridge-UC-ID>/suggestion.md
   — confirm the Scope covers only the true delta vs current codebase
   — remove any ALREADY-PRESENT business rules that are redundant
3. Set bridge suggestion status to Approved
4. Run `/uc-generate <bridge-UC-ID>`
5. Run `/uc-develop <bridge-UC-ID>` to apply the delta to the running codebase
```
