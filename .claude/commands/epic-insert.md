Insert a new Epic into the middle of the existing Epic chain. Usage: `/epic-insert EPIC-003b`

## What you are doing

You are adding a new Epic between two already-registered Epics — for example inserting `EPIC-003b` between `EPIC-003` (Done) and `EPIC-004` (Approved). Because every Epic's architecture is generated against its predecessor's cumulative outputs, inserting mid-chain can silently invalidate the architecture of subsequent Approved Epics. This command handles the full flow: suggestion → generation → impact analysis → selective regeneration of affected downstream Epics.

**Naming convention:** the inserted Epic ID must follow the pattern `EPIC-<N><letter>` (e.g. `EPIC-003b`, `EPIC-004a`). The numeric part identifies the anchor — the last Done Epic before this insert. The letter (`a`, `b`, `c`…) orders multiple inserts at the same position. Never use a plain numeric ID for an insert; that would collide with an existing Epic.

---

## Folder resolution helper

Wherever this command needs to locate an Epic's folder, use this pattern:
1. Glob `.claude/architecture/${NNN}-*/` (where NNN is the zero-padded 3-digit number, e.g. `003`).
2. If exactly one match: use that path.
3. Fallback: `.claude/architecture/EPIC-${original-id}/` (legacy naming).
4. If still no match: the folder does not exist.

---

## Step 1 — Parse arguments and derive position

From `$ARGUMENTS` (e.g. `EPIC-003b`):
- Strip the trailing letter(s) to get the **anchor ID** (e.g. `EPIC-003`).
- The letter suffix is the **insert slot** (e.g. `b`).

If `$ARGUMENTS` contains no letter suffix (plain `EPIC-004`) abort:
> Plain numeric IDs are reserved for normal Epic sequencing. For an insertion use a letter suffix, e.g. `EPIC-003b`.

---

## Step 2 — Validate anchor and chain state

1. Read `.claude/architecture/epics.md`.
2. Confirm the anchor Epic row exists. If not, abort: "Anchor Epic `<anchor>` not found in epics.md."
3. Confirm the anchor's Status is `Done`. If it is `Approved` or `In Development` or anything other than `Done`, abort:
   > Anchor `<anchor>` has status `<STATUS>`. Insertions may only follow a fully implemented (`Done`) Epic. Either wait for `<anchor>` to be completed, or choose an earlier anchor.
4. Collect all rows in epics.md that appear **after** the anchor row and have Status `Approved`. These are the **downstream Epics** that may need regeneration. If any downstream Epic has Status `In Development`, `Testing`, or `Done`, note it separately — those cannot be regenerated automatically and will be flagged in the impact report.

---

## Step 3 — Check for an existing suggestion (re-entry detection)

Look for `.claude/architecture/$ARGUMENTS/suggestion.md`.

- **Does not exist** → this is the **first run**. Continue to Step 4 (suggestion session).
- **Exists, `status: Draft`** → remind the user to approve it and re-run:
  > `$ARGUMENTS/suggestion.md` exists but is still `Draft`. Edit the frontmatter to `status: Approved` then re-run `/epic-insert $ARGUMENTS`.
  Stop.
- **Exists, `status: Approved`** → this is the **second run** (re-entry after approval). Skip to Step 8 (generation).

---

## Step 4 — Summarise the baseline for the user

Read the anchor Epic's artifacts:
- `.claude/architecture/<anchor>/ClassDiagram.md`
- `.claude/architecture/<anchor>/FrontendState.md`
- `.claude/architecture/<anchor>/suggestion.md`

Summarise in 3–5 bullet points: what entities exist, what endpoints exist, what NgRx slices exist. This tells the user the exact starting point for the insert.

Also show the downstream Epics table collected in Step 2 so the user knows what may be affected:
```
Downstream Approved Epics (may require regeneration after this insert):
  - EPIC-004: <title>
  - EPIC-005: <title>
```

---

## Step 5 — Guided suggestion session

Ask ALL of the following in a single message. Wait for complete answers before writing anything.

1. **Title** — Short title for this inserted Epic.
2. **Scope** — What does it add or change? (1–3 sentences)
3. **Why here?** — Why does this need to come before the downstream Epics? What would break or be wrong if it came after?
4. **Affected downstream Epics** — Which of the downstream Epics does this insert affect, and how? (The user may say "none" — that is valid.)
5. **Business rules** — List each BR explicitly.
6. **DB entities** — Any new or modified entities?
7. **Endpoints** — New or modified endpoints?
8. **Components** — Frontend components involved?

---

## Step 6 — Write suggestion.md

Create the directory `.claude/architecture/$ARGUMENTS/` if it does not exist, then write `suggestion.md`:

```
---
type: epic-suggestion
epic: $ARGUMENTS
anchor: <anchor-id>
inserts-before: <first downstream Epic ID, or "none">
status: Draft
updated: <today YYYY-MM-DD>
---

# $ARGUMENTS: <Title> — Design Suggestions

## Insertion Context

| | |
|---|---|
| **Anchor (follows)** | `<anchor-id>` (Done) |
| **Inserts before** | `<next Epic ID>` (Approved) |
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
- Re-run `/epic-insert $ARGUMENTS` — the command will detect the approved suggestion and proceed to generation and impact analysis

Stop here until the user re-runs.

---

## Step 8 — Generate architecture artifacts (re-entry point)

Read `.claude/architecture/$ARGUMENTS/suggestion.md` to confirm `status: Approved`. If not, stop and remind the user.

Read the anchor field from the frontmatter (e.g. `anchor: EPIC-003`). This is the baseline for all architect prompts.

### 8a — Backend architect

Spawn the `backend-architect` agent:

```
Epic Design Mode for $ARGUMENTS (inserted Epic).

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
Epic Design Mode for $ARGUMENTS (inserted Epic).

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

Read `testState-backend.md` and `testState-frontend.md`. Merge into `testState.md` organised by BR ID (same format as `/epic-generate`). Write `testStateDiff.md` comparing against `<anchor>/testState.md`. Delete the two partial files.

---

## Step 9 — Impact analysis

For each downstream Epic (collected in Step 2), determine whether its architecture is still valid given the insert's changes.

Read from the insert's diff files:
- `.claude/architecture/$ARGUMENTS/ClassDiagramDiff.md` → collect all MODIFIED and REMOVED entities and fields (ignore ADDED — new things don't break existing downstream assumptions)
- `.claude/architecture/$ARGUMENTS/openapiDiff.md` → collect all MODIFIED and REMOVED endpoints and response shapes
- `.claude/architecture/$ARGUMENTS/FrontendStateDiff.md` → collect all MODIFIED and REMOVED NgRx slices, actions, and selectors

For each downstream Epic, read:
- `ClassDiagram.md` — does it reference any of the modified/removed entities?
- `openapi.yaml` — does it reference any of the modified/removed endpoints?
- `FrontendState.md` — does it reference any of the modified/removed store artifacts?

Classify each downstream Epic as:

| Result | Meaning |
|---|---|
| `CLEAN` | No overlapping references found — architecture remains valid |
| `AFFECTED` | At least one reference found — architecture was generated against a now-changed baseline and must be regenerated |
| `MANUAL` | Epic is `In Development`, `Testing`, or `Done` — cannot be auto-regenerated; flag for human review |

---

## Step 10 — Report impact and request confirmation

Present the impact table to the user:

```
## Impact Analysis — $ARGUMENTS

| Downstream Epic | Status | Impact | Reason |
|---|---|---|---|
| EPIC-004 | Approved | AFFECTED | openapi: POST /api/foo was modified |
| EPIC-005 | Approved | CLEAN | no overlapping references |
| EPIC-006 | Done | MANUAL | already implemented — review manually |
```

If any AFFECTED Epics exist, ask:
> `<N>` downstream Epic(s) need their architecture regenerated against the new baseline. Regenerate now? (This will overwrite their current architecture files but preserve their `suggestion.md`.)

Wait for the user to confirm before proceeding. If the user declines, stop here — the user must manually reconcile the affected Epics before development.

---

## Step 11 — Regenerate affected downstream Epics

For each AFFECTED downstream Epic, in chain order:

The **baseline for regeneration** is the previous Epic in the chain as it now stands (which may be `$ARGUMENTS` itself for the first downstream Epic, or the just-regenerated previous downstream Epic for subsequent ones).

Spawn `backend-architect` and `frontend-architect` **in parallel** for the Epic being regenerated:

**backend-architect prompt:**
```
Regeneration pass for <downstream-Epic-ID> (baseline shifted by inserted Epic $ARGUMENTS).

Suggestion:            .claude/architecture/<downstream-Epic-ID>/suggestion.md
Previous ClassDiagram: .claude/architecture/<new-prev-Epic>/ClassDiagram.md
Previous openapi:      .claude/architecture/<new-prev-Epic>/openapi.yaml

Output directory: .claude/architecture/<downstream-Epic-ID>/

Overwrite existing files. Produce:
- ClassDiagram.md
- openapi.yaml
- ClassDiagramDiff.md
- openapiDiff.md
- testState-backend.md
```

**frontend-architect prompt:**
```
Regeneration pass for <downstream-Epic-ID> (baseline shifted by inserted Epic $ARGUMENTS).

Suggestion:               .claude/architecture/<downstream-Epic-ID>/suggestion.md
Current openapi:          .claude/architecture/<downstream-Epic-ID>/openapi.yaml
Previous FrontendState:   .claude/architecture/<new-prev-Epic>/FrontendState.md
Previous selectors:       .claude/architecture/<new-prev-Epic>/selectors.yaml

Output directory: .claude/architecture/<downstream-Epic-ID>/

Overwrite existing files. Produce:
- FrontendState.md
- selectors.yaml
- FrontendStateDiff.md
- selectorsDiff.md
- mockupsDiff.md
- ComponentInventory.md
- testState-frontend.md
```

After both complete, recompile `testState.md` for the downstream Epic (same merge process as Step 8d). Do NOT re-run the contract validator for downstream Epics during regeneration — that is the responsibility of the next `/epic-develop` run.

After regenerating each downstream Epic, re-run impact analysis (Step 9) for the Epic that follows it in the chain before regenerating the next one. This catches cascading conflicts.

---

## Step 12 — Update epics.md

Add (or update) the row for `$ARGUMENTS` in `.claude/architecture/epics.md`. Insert it immediately after the anchor row. Set Status to `Approved`. Set Updated to today.

For any regenerated downstream Epics, update their `Updated` date. Do not change their Status.

---

## Step 13 — Final report

```
## Insert Complete — $ARGUMENTS

Anchor      : <anchor-id> (Done)
Inserted    : $ARGUMENTS — <title>
Status      : Approved (ready for /epic-develop)

### Generated Artifacts
<list files created for $ARGUMENTS>

### Impact Summary
| Downstream Epic | Result | Action taken |
|---|---|---|
| EPIC-004 | AFFECTED | Regenerated |
| EPIC-005 | CLEAN    | No action |
| EPIC-006 | MANUAL   | ⚠ Flagged — review required |

### Manual Review Required
<For any MANUAL entries: explain what the human needs to check and why.>

### Next Steps
1. Review $ARGUMENTS artifacts in .claude/architecture/$ARGUMENTS/
2. Run `/epic-develop $ARGUMENTS` to implement this Epic before the downstream ones
3. For any MANUAL Epics: inspect and reconcile by hand before developing them
```
