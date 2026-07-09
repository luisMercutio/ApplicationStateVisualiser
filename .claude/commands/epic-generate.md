Generate all architecture artifacts for Epic $ARGUMENTS.

## What you are doing

You are orchestrating the backend architect, frontend architect, and contract validator agents to produce the full set of design artifacts for the resolved Epic folder. You do not write architecture content yourself — you coordinate agents, compile their outputs, and update the tracking file.

---

## Step 0 — Resolve the Epic folder

Parse $ARGUMENTS to extract the Epic number:
- If format is `EPIC-NNN` or `EPIC-N` (e.g. `EPIC-005`, `EPIC-5`): strip the `EPIC-` prefix and zero-pad to 3 digits → `005`.
- If format is already a 3-digit number (e.g. `005`): use as-is.

Call this the **epic-number** (e.g. `005`).

Locate the Epic folder:
1. Glob `.claude/architecture/${epic-number}-*/` — if exactly one match, that is `<epic-folder>`.
2. If no match: fallback glob `.claude/architecture/EPIC-${ARGUMENTS}/` (legacy naming).
3. If still no match: abort — "No architecture folder found for $ARGUMENTS. Run `/epic-suggest $ARGUMENTS` first to create it."

All subsequent path references use `<epic-folder>` (the resolved absolute directory path).

---

## Step 1 — Validate preconditions

1. Check that `<epic-folder>/suggestion.md` exists. If not, abort: "No suggestion.md found in `<epic-folder>`. Run `/epic-suggest $ARGUMENTS` first."
2. Read the suggestion.md frontmatter. If `status` is not `Approved`, warn the user: "suggestion.md status is '$STATUS' — proceeding anyway, but typically you should approve the suggestion before generating." Continue unless the user cancels.

---

## Step 2 — Determine the baseline Epic folder

Read `<epic-folder>/suggestion.md` frontmatter. Check for a `baseline:` field (e.g. `baseline: EPIC-001`).

- If `baseline:` is present: extract its number as `prev-epic-number` (zero-padded). This is an explicit override — the suggestion was anchored to a non-adjacent predecessor (e.g. prepared for `/epic-shift`).
- If `baseline:` is absent: compute `prev-epic-number` = `epic-number` minus 1, zero-padded to 3 digits.

Then:
- If `prev-epic-number` would be `000` (i.e. EPIC-001 with no baseline field) → previous Epic is **blank baseline**.
- Otherwise → locate `<prev-epic-folder>`:
  1. Glob `.claude/architecture/${prev-epic-number}-*/` — if exactly one match, use it.
  2. Fallback: `.claude/architecture/EPIC-0${prev-epic-number-unpadded}/` (legacy naming, e.g. `EPIC-004`).
  3. If still no match: abort — "Previous Epic directory for `${prev-epic-number}` not found. Generate that Epic first."

---

## Step 3 — Run the backend architect

Spawn the `backend-architect` agent with the following prompt (fill in actual resolved paths):

```
Epic Design Mode for $ARGUMENTS.

Suggestion: <epic-folder>/suggestion.md
Previous ClassDiagram: <prev-epic-folder>/ClassDiagram.md  (or BLANK BASELINE if EPIC-001)
Previous openapi:      <prev-epic-folder>/openapi.yaml     (or BLANK BASELINE if EPIC-001)

Output directory: <epic-folder>/

Produce:
- ClassDiagram.md
- openapi.yaml
- ClassDiagramDiff.md
- openapiDiff.md
- testState-backend.md
```

Wait for the backend architect to complete before proceeding.

---

## Step 4 — Run the frontend architect

Spawn the `frontend-architect` agent with the following prompt:

```
Epic Design Mode for $ARGUMENTS.

Suggestion:           <epic-folder>/suggestion.md
Current openapi:      <epic-folder>/openapi.yaml
Previous FrontendState: <prev-epic-folder>/FrontendState.md  (or BLANK BASELINE)
Previous selectors:     <prev-epic-folder>/selectors.yaml    (or BLANK BASELINE)

Output directory: <epic-folder>/

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

Wait for the frontend architect to complete before proceeding.

---

## Step 5 — Run the contract validator

Spawn the `contract-validator` agent with the following prompt:

```
Validate the API contract for $ARGUMENTS.

openapi:       <epic-folder>/openapi.yaml
FrontendState: <epic-folder>/FrontendState.md
selectors:     <epic-folder>/selectors.yaml

Write the validation report to: <epic-folder>/contract-validation.json
```

Wait for the contract validator to complete.

---

## Step 5.5 — Generate touch.md files

This step identifies which previous Epic feature domains the current Epic has modified, and writes a `touch.md` relationship file for each one.

### 5.5a — Collect MODIFIED items from the diffs

Read the three diff files produced by the architect agents:
- `<epic-folder>/ClassDiagramDiff.md`
- `<epic-folder>/openapiDiff.md`
- `<epic-folder>/FrontendStateDiff.md`

From each diff, collect only the **MODIFIED** section items (skip NEW and REMOVED):
- **Schema mods**: entity names listed under `## MODIFIED Entities`
- **API mods**: endpoint paths listed under `## MODIFIED Endpoints`
- **Frontend mods**: slice names listed under `## MODIFIED Slices`

If all three diffs contain no MODIFIED items (this Epic only adds new things), skip the rest of Step 5.5.

### 5.5b — Identify the owning Epic for each modified item

For each modified entity, endpoint, or slice, scan **backwards** through previous Epic folders (from `prev-epic-number` down to `001`) to find which Epic first introduced it:
- For an entity name: check each `<folder>/ClassDiagram.md` — the first one (highest number) that contains the entity name is the owner.
- For an endpoint path: check each `<folder>/openapi.yaml` — same rule.
- For a slice name: check each `<folder>/FrontendState.md` — same rule.

Use the folder resolution glob (Step 0 logic) for each previous Epic number.

Group all modified items by their owner Epic number.

### 5.5c — Write touch.md for each owning Epic

For each owner Epic number `MMM` that has at least one modified item:

1. Create directory `<epic-folder>/<MMM>/` (e.g. `<epic-folder>/001/`).
2. Read `<owner-epic-folder>/suggestion.md` to get the owner Epic's title.
3. Write `<epic-folder>/<MMM>/touch.md` using this format:

```markdown
---
touching-epic: <epic-number>
touched-epic: <MMM>
touching-epic-title: <title from current suggestion.md>
touched-epic-title: <title from owner suggestion.md>
generated: <today YYYY-MM-DD>
---

# EPIC-<epic-number> touching EPIC-<MMM>

> EPIC-<epic-number> (<current title>) modifies artifacts originally introduced by EPIC-<MMM> (<owner title>).

## Schema changes in EPIC-<MMM>'s domain

- `<EntityName>`: <what was added, modified, or extended — one bullet per entity>

_None_ (if no schema changes for this owner)

## API changes in EPIC-<MMM>'s domain

- `<METHOD> <path>`: <what changed — one bullet per endpoint>

_None_ (if no API changes for this owner)

## Frontend changes in EPIC-<MMM>'s domain

- `<sliceName>`: <what was added or modified — one bullet per slice>

_None_ (if no frontend changes for this owner)

## Prep opportunity

<One concise paragraph: what EPIC-<MMM> could have designed differently — a structural choice, naming convention, enum extraction, or extensibility hook — to make this modification cleaner, WITHOUT requiring any business logic or model that EPIC-<MMM>'s own feature did not need.

If every modification required future business logic that EPIC-<MMM> had no reason to anticipate (e.g. adding a FK to an entity that didn't exist yet), write:>

None — these changes required future business logic that EPIC-<MMM> had no reason to anticipate at design time.
```

---

## Step 6 — Compile testState.md

Read both partial test files:
- `<epic-folder>/testState-backend.md`
- `<epic-folder>/testState-frontend.md`

Merge them into a single `<epic-folder>/testState.md` reorganised by BR ID. Format:

```markdown
# Test State — $ARGUMENTS

## <BR-ID>: <Rule text>

| Application | Type | Test Description |
|---|---|---|
| backend | integration | ... |
| frontend | component | ... |
```

All tests for a given BR appear in the same table regardless of application. BRs appear in ID order (BR-001, BR-002, ...).

Also write `<epic-folder>/testStateDiff.md`:
- For EPIC-001 (blank baseline): every BR section is marked **NEW**
- Otherwise: compare against `<prev-epic-folder>/testState.md` and show NEW, MODIFIED, or REMOVED sections

After writing `testState.md`, delete `testState-backend.md` and `testState-frontend.md`.

---

## Step 6.5 — Synthesize structured Business Rules

Spawn the `br-synthesizer` agent with the following prompt (fill in actual resolved paths):

```
Business Rule Data Mode for $ARGUMENTS.

Epic folder:          <epic-folder>/
Suggestion:           <epic-folder>/suggestion.md
ClassDiagram:         <epic-folder>/ClassDiagram.md
openapi:              <epic-folder>/openapi.yaml
FrontendState:        <epic-folder>/FrontendState.md
selectors:            <epic-folder>/selectors.yaml
ComponentInventory:   <epic-folder>/ComponentInventory.md
Mockups:              <epic-folder>/mockups/
testState:            <epic-folder>/testState.md
Predecessor BR data:  .claude/architecture/*/business-rules.json  (all lower-numbered Epics)

Write: <epic-folder>/business-rules.json
```

Wait for the br-synthesizer to complete. This file is what the ApplicationStateVisualiser reads to render the Business Rule dependency net. Do **not** write node coordinates — the viewer owns `br-positions.json`.

---

## Step 7 — Handle contract validation result

Read `<epic-folder>/contract-validation.json`.

- If `result` is `FAIL`: report all errors to the user. Do NOT update `epics.md`. Tell the user the architects must be re-run after fixing the errors in `suggestion.md`.
- If `result` is `PASS`: proceed to Step 7.5.

---

## Step 7.5 — Run the postman builder

Spawn the `postman-builder` agent with the following prompt (fill in actual resolved paths):

```
Build Postman collection entry for $ARGUMENTS.

openapi:       <epic-folder>/openapi.yaml
testState:     <epic-folder>/testState.md
suggestion:    <epic-folder>/suggestion.md
Collection:    postman/campmanager-collection.json
Environment:   postman/campmanager-environment.json
```

Wait for the postman builder to complete before proceeding.

---

## Step 8 — Update epics.md

Read `.claude/architecture/epics.md`. Upsert the row for $ARGUMENTS:
- If no row exists: add it with status `Draft` (or `Approved` if suggestion.md status is `Approved`)
- If a row exists: update the `Updated` date; preserve the existing status unless suggestion.md is `Approved` (in which case set to `Approved`)

---

## Step 9 — Report to the user

Summarise:
- Artifacts generated (list files, including `business-rules.json` and any touch.md files created under `<epic-folder>/NNN/`)
- Postman files updated (`postman/campmanager-collection.json`, `postman/campmanager-environment.json`)
- Contract validation result + any warnings
- Any errors that must be resolved
- Next step: review the artifacts, then proceed to implementation
