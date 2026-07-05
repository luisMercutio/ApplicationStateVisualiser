Insert a new use case into the middle of the existing UC chain. Usage: `/uc-insert UC-003b`

## What you are doing

You are adding a new UC between two already-registered UCs — for example inserting `UC-003b` between `UC-003` (Done) and `UC-004` (Approved). Because every UC's architecture is generated against its predecessor's cumulative outputs, inserting mid-chain can silently invalidate the architecture of subsequent Approved UCs. This command handles the full flow: suggestion → generation → impact analysis → selective regeneration of affected downstream UCs.

**Naming convention:** the inserted UC ID must follow the pattern `UC-<N><letter>` (e.g. `UC-003b`, `UC-004a`). The numeric part identifies the anchor — the last Done UC before this insert. The letter (`a`, `b`, `c`…) orders multiple inserts at the same position. Never use a plain numeric ID for an insert; that would collide with an existing UC.

---

## Folder resolution helper

Wherever this command needs to locate a UC's folder, use this pattern:
1. Glob `.claude/architecture/${NNN}-*/` (where NNN is the zero-padded 3-digit number, e.g. `003`).
2. If exactly one match: use that path.
3. Fallback: `.claude/architecture/UC-${original-id}/` (legacy naming).
4. If still no match: the folder does not exist.

---

## Step 1 — Parse arguments and derive position

From `$ARGUMENTS` (e.g. `UC-003b`):
- Strip the trailing letter(s) to get the **anchor ID** (e.g. `UC-003`).
- The letter suffix is the **insert slot** (e.g. `b`).

If `$ARGUMENTS` contains no letter suffix (plain `UC-004`) abort:
> Plain numeric IDs are reserved for normal UC sequencing. For an insertion use a letter suffix, e.g. `UC-003b`.

---

## Step 2 — Validate anchor and chain state

1. Read `.claude/architecture/usecases.md`.
2. Confirm the anchor UC row exists. If not, abort: "Anchor UC `<anchor>` not found in usecases.md."
3. Confirm the anchor's Status is `Done`. If it is `Approved` or `In Development` or anything other than `Done`, abort:
   > Anchor `<anchor>` has status `<STATUS>`. Insertions may only follow a fully implemented (`Done`) UC. Either wait for `<anchor>` to be completed, or choose an earlier anchor.
4. Collect all rows in usecases.md that appear **after** the anchor row and have Status `Approved`. These are the **downstream UCs** that may need regeneration. If any downstream UC has Status `In Development`, `Testing`, or `Done`, note it separately — those cannot be regenerated automatically and will be flagged in the impact report.

---

## Step 3 — Check for an existing suggestion (re-entry detection)

Look for `.claude/architecture/$ARGUMENTS/suggestion.md`.

- **Does not exist** → this is the **first run**. Continue to Step 4 (suggestion session).
- **Exists, `status: Draft`** → remind the user to approve it and re-run:
  > `$ARGUMENTS/suggestion.md` exists but is still `Draft`. Edit the frontmatter to `status: Approved` then re-run `/uc-insert $ARGUMENTS`.
  Stop.
- **Exists, `status: Approved`** → this is the **second run** (re-entry after approval). Skip to Step 8 (generation).

---

## Step 4 — Summarise the baseline for the user

Read the anchor UC's artifacts:
- `.claude/architecture/<anchor>/ClassDiagram.md`
- `.claude/architecture/<anchor>/FrontendState.md`
- `.claude/architecture/<anchor>/suggestion.md`

Summarise in 3–5 bullet points: what entities exist, what endpoints exist, what NgRx slices exist. This tells the user the exact starting point for the insert.

Also show the downstream UCs table collected in Step 2 so the user knows what may be affected:
```
Downstream Approved UCs (may require regeneration after this insert):
  - UC-004: <title>
  - UC-005: <title>
```

---

## Step 5 — Guided suggestion session

Ask ALL of the following in a single message. Wait for complete answers before writing anything.

1. **Title** — Short title for this inserted UC.
2. **Scope** — What does it add or change? (1–3 sentences)
3. **Why here?** — Why does this need to come before the downstream UCs? What would break or be wrong if it came after?
4. **Affected downstream UCs** — Which of the downstream UCs does this insert affect, and how? (The user may say "none" — that is valid.)
5. **Business rules** — List each BR explicitly.
6. **DB entities** — Any new or modified entities?
7. **Endpoints** — New or modified endpoints?
8. **Components** — Frontend components involved?

---

## Step 6 — Write suggestion.md

Create the directory `.claude/architecture/$ARGUMENTS/` if it does not exist, then write `suggestion.md`:

```
---
type: uc-suggestion
uc: $ARGUMENTS
anchor: <anchor-id>
inserts-before: <first downstream UC ID, or "none">
status: Draft
updated: <today YYYY-MM-DD>
---

# $ARGUMENTS: <Title> — Design Suggestions

## Insertion Context

| | |
|---|---|
| **Anchor (follows)** | `<anchor-id>` (Done) |
| **Inserts before** | `<next UC ID>` (Approved) |
| **Reason for insertion** | <one sentence from user's answer to Q3> |

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
- The file is written with `status: Draft`
- Review it, then set frontmatter to `status: Approved`
- Re-run `/uc-insert $ARGUMENTS` — the command will detect the approved suggestion and proceed to generation and impact analysis

Stop here until the user re-runs.

---

## Step 8 — Generate architecture artifacts (re-entry point)

Read `.claude/architecture/$ARGUMENTS/suggestion.md` to confirm `status: Approved`. If not, stop and remind the user.

Read the anchor field from the frontmatter (e.g. `anchor: UC-003`). This is the baseline for all architect prompts.

### 8a — Backend architect

Spawn the `backend-architect` agent:

```
UC Design Mode for $ARGUMENTS (inserted UC).

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
```

Wait for completion.

### 8b — Frontend architect

Spawn the `frontend-architect` agent:

```
UC Design Mode for $ARGUMENTS (inserted UC).

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
- mockups/<ComponentName>.html  (one per page-level component)
- mockupsDiff.md
- ComponentInventory.md
- testState-frontend.md
```

Wait for completion.

### 8c — Contract validator

Spawn the `contract-validator` agent:

```
Validate the API contract for $ARGUMENTS.

openapi:       .claude/architecture/$ARGUMENTS/openapi.yaml
FrontendState: .claude/architecture/$ARGUMENTS/FrontendState.md
selectors:     .claude/architecture/$ARGUMENTS/selectors.yaml

Write the validation report to: .claude/architecture/$ARGUMENTS/contract-validation.json
```

Wait for completion. Read the result. If `FAIL`, report errors to the user and stop — the suggestion must be revised before proceeding.

### 8d — Compile testState.md

Read `testState-backend.md` and `testState-frontend.md`. Merge into `testState.md` organised by BR ID (same format as `/uc-generate`). Write `testStateDiff.md` comparing against `<anchor>/testState.md`. Delete the two partial files.

---

## Step 9 — Impact analysis

For each downstream UC (collected in Step 2), determine whether its architecture is still valid given the insert's changes.

Read from the insert's diff files:
- `.claude/architecture/$ARGUMENTS/ClassDiagramDiff.md` → collect all MODIFIED and REMOVED entities and fields (ignore ADDED — new things don't break existing downstream assumptions)
- `.claude/architecture/$ARGUMENTS/openapiDiff.md` → collect all MODIFIED and REMOVED endpoints and response shapes
- `.claude/architecture/$ARGUMENTS/FrontendStateDiff.md` → collect all MODIFIED and REMOVED NgRx slices, actions, and selectors

For each downstream UC, read:
- `ClassDiagram.md` — does it reference any of the modified/removed entities?
- `openapi.yaml` — does it reference any of the modified/removed endpoints?
- `FrontendState.md` — does it reference any of the modified/removed store artifacts?

Classify each downstream UC as:

| Result | Meaning |
|---|---|
| `CLEAN` | No overlapping references found — architecture remains valid |
| `AFFECTED` | At least one reference found — architecture was generated against a now-changed baseline and must be regenerated |
| `MANUAL` | UC is `In Development`, `Testing`, or `Done` — cannot be auto-regenerated; flag for human review |

---

## Step 10 — Report impact and request confirmation

Present the impact table to the user:

```
## Impact Analysis — $ARGUMENTS

| Downstream UC | Status | Impact | Reason |
|---|---|---|---|
| UC-004 | Approved | AFFECTED | openapi: POST /api/foo was modified |
| UC-005 | Approved | CLEAN | no overlapping references |
| UC-006 | Done | MANUAL | already implemented — review manually |
```

If any AFFECTED UCs exist, ask:
> `<N>` downstream UC(s) need their architecture regenerated against the new baseline. Regenerate now? (This will overwrite their current architecture files but preserve their `suggestion.md`.)

Wait for the user to confirm before proceeding. If the user declines, stop here — the user must manually reconcile the affected UCs before development.

---

## Step 11 — Regenerate affected downstream UCs

For each AFFECTED downstream UC, in chain order:

The **baseline for regeneration** is the previous UC in the chain as it now stands (which may be `$ARGUMENTS` itself for the first downstream UC, or the just-regenerated previous downstream UC for subsequent ones).

Spawn `backend-architect` and `frontend-architect` **in parallel** for the UC being regenerated:

**backend-architect prompt:**
```
Regeneration pass for <downstream-UC-ID> (baseline shifted by inserted UC $ARGUMENTS).

Suggestion:            .claude/architecture/<downstream-UC-ID>/suggestion.md
Previous ClassDiagram: .claude/architecture/<new-prev-UC>/ClassDiagram.md
Previous openapi:      .claude/architecture/<new-prev-UC>/openapi.yaml

Output directory: .claude/architecture/<downstream-UC-ID>/

Overwrite existing files. Produce:
- ClassDiagram.md
- openapi.yaml
- ClassDiagramDiff.md
- openapiDiff.md
- testState-backend.md
```

**frontend-architect prompt:**
```
Regeneration pass for <downstream-UC-ID> (baseline shifted by inserted UC $ARGUMENTS).

Suggestion:               .claude/architecture/<downstream-UC-ID>/suggestion.md
Current openapi:          .claude/architecture/<downstream-UC-ID>/openapi.yaml
Previous FrontendState:   .claude/architecture/<new-prev-UC>/FrontendState.md
Previous selectors:       .claude/architecture/<new-prev-UC>/selectors.yaml

Output directory: .claude/architecture/<downstream-UC-ID>/

Overwrite existing files. Produce:
- FrontendState.md
- selectors.yaml
- FrontendStateDiff.md
- selectorsDiff.md
- mockupsDiff.md
- ComponentInventory.md
- testState-frontend.md
```

After both complete, recompile `testState.md` for the downstream UC (same merge process as Step 8d). Do NOT re-run the contract validator for downstream UCs during regeneration — that is the responsibility of the next `/uc-develop` run.

After regenerating each downstream UC, re-run impact analysis (Step 9) for the UC that follows it in the chain before regenerating the next one. This catches cascading conflicts.

---

## Step 12 — Update usecases.md

Add (or update) the row for `$ARGUMENTS` in `.claude/architecture/usecases.md`. Insert it immediately after the anchor row. Set Status to `Approved`. Set Updated to today.

For any regenerated downstream UCs, update their `Updated` date. Do not change their Status.

---

## Step 13 — Final report

```
## Insert Complete — $ARGUMENTS

Anchor      : <anchor-id> (Done)
Inserted    : $ARGUMENTS — <title>
Status      : Approved (ready for /uc-develop)

### Generated Artifacts
<list files created for $ARGUMENTS>

### Impact Summary
| Downstream UC | Result | Action taken |
|---|---|---|
| UC-004 | AFFECTED | Regenerated |
| UC-005 | CLEAN    | No action |
| UC-006 | MANUAL   | ⚠ Flagged — review required |

### Manual Review Required
<For any MANUAL entries: explain what the human needs to check and why.>

### Next Steps
1. Review $ARGUMENTS artifacts in .claude/architecture/$ARGUMENTS/
2. Run `/uc-develop $ARGUMENTS` to implement this UC before the downstream ones
3. For any MANUAL UCs: inspect and reconcile by hand before developing them
```
