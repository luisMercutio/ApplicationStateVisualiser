Generate all architecture artifacts for use case $ARGUMENTS.

## What you are doing

You are orchestrating the backend architect, frontend architect, and contract validator agents to produce the full set of design artifacts for the resolved UC folder. You do not write architecture content yourself — you coordinate agents, compile their outputs, and update the tracking file.

---

## Step 0 — Resolve the UC folder

Parse $ARGUMENTS to extract the UC number:
- If format is `UC-NNN` or `UC-N` (e.g. `UC-005`, `UC-5`): strip the `UC-` prefix and zero-pad to 3 digits → `005`.
- If format is already a 3-digit number (e.g. `005`): use as-is.

Call this the **uc-number** (e.g. `005`).

Locate the UC folder:
1. Glob `.claude/architecture/${uc-number}-*/` — if exactly one match, that is `<uc-folder>`.
2. If no match: fallback glob `.claude/architecture/UC-${ARGUMENTS}/` (legacy naming).
3. If still no match: abort — "No architecture folder found for $ARGUMENTS. Run `/uc-suggest $ARGUMENTS` first to create it."

All subsequent path references use `<uc-folder>` (the resolved absolute directory path).

---

## Step 1 — Validate preconditions

1. Check that `<uc-folder>/suggestion.md` exists. If not, abort: "No suggestion.md found in `<uc-folder>`. Run `/uc-suggest $ARGUMENTS` first."
2. Read the suggestion.md frontmatter. If `status` is not `Approved`, warn the user: "suggestion.md status is '$STATUS' — proceeding anyway, but typically you should approve the suggestion before generating." Continue unless the user cancels.

---

## Step 2 — Determine the baseline UC folder

Read `<uc-folder>/suggestion.md` frontmatter. Check for a `baseline:` field (e.g. `baseline: UC-001`).

- If `baseline:` is present: extract its number as `prev-uc-number` (zero-padded). This is an explicit override — the suggestion was anchored to a non-adjacent predecessor (e.g. prepared for `/uc-shift`).
- If `baseline:` is absent: compute `prev-uc-number` = `uc-number` minus 1, zero-padded to 3 digits.

Then:
- If `prev-uc-number` would be `000` (i.e. UC-001 with no baseline field) → previous UC is **blank baseline**.
- Otherwise → locate `<prev-uc-folder>`:
  1. Glob `.claude/architecture/${prev-uc-number}-*/` — if exactly one match, use it.
  2. Fallback: `.claude/architecture/UC-0${prev-uc-number-unpadded}/` (legacy naming, e.g. `UC-004`).
  3. If still no match: abort — "Previous UC directory for `${prev-uc-number}` not found. Generate that UC first."

---

## Step 3 — Run the backend architect

Spawn the `backend-architect` agent with the following prompt (fill in actual resolved paths):

```
UC Design Mode for $ARGUMENTS.

Suggestion: <uc-folder>/suggestion.md
Previous ClassDiagram: <prev-uc-folder>/ClassDiagram.md  (or BLANK BASELINE if UC-001)
Previous openapi:      <prev-uc-folder>/openapi.yaml     (or BLANK BASELINE if UC-001)

Output directory: <uc-folder>/

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
UC Design Mode for $ARGUMENTS.

Suggestion:           <uc-folder>/suggestion.md
Current openapi:      <uc-folder>/openapi.yaml
Previous FrontendState: <prev-uc-folder>/FrontendState.md  (or BLANK BASELINE)
Previous selectors:     <prev-uc-folder>/selectors.yaml    (or BLANK BASELINE)

Output directory: <uc-folder>/

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

openapi:       <uc-folder>/openapi.yaml
FrontendState: <uc-folder>/FrontendState.md
selectors:     <uc-folder>/selectors.yaml

Write the validation report to: <uc-folder>/contract-validation.json
```

Wait for the contract validator to complete.

---

## Step 5.5 — Generate touch.md files

This step identifies which previous UC feature domains the current UC has modified, and writes a `touch.md` relationship file for each one.

### 5.5a — Collect MODIFIED items from the diffs

Read the three diff files produced by the architect agents:
- `<uc-folder>/ClassDiagramDiff.md`
- `<uc-folder>/openapiDiff.md`
- `<uc-folder>/FrontendStateDiff.md`

From each diff, collect only the **MODIFIED** section items (skip NEW and REMOVED):
- **Schema mods**: entity names listed under `## MODIFIED Entities`
- **API mods**: endpoint paths listed under `## MODIFIED Endpoints`
- **Frontend mods**: slice names listed under `## MODIFIED Slices`

If all three diffs contain no MODIFIED items (this UC only adds new things), skip the rest of Step 5.5.

### 5.5b — Identify the owning UC for each modified item

For each modified entity, endpoint, or slice, scan **backwards** through previous UC folders (from `prev-uc-number` down to `001`) to find which UC first introduced it:
- For an entity name: check each `<folder>/ClassDiagram.md` — the first one (highest number) that contains the entity name is the owner.
- For an endpoint path: check each `<folder>/openapi.yaml` — same rule.
- For a slice name: check each `<folder>/FrontendState.md` — same rule.

Use the folder resolution glob (Step 0 logic) for each previous UC number.

Group all modified items by their owner UC number.

### 5.5c — Write touch.md for each owning UC

For each owner UC number `MMM` that has at least one modified item:

1. Create directory `<uc-folder>/<MMM>/` (e.g. `<uc-folder>/001/`).
2. Read `<owner-uc-folder>/suggestion.md` to get the owner UC's title.
3. Write `<uc-folder>/<MMM>/touch.md` using this format:

```markdown
---
touching-uc: <uc-number>
touched-uc: <MMM>
touching-uc-title: <title from current suggestion.md>
touched-uc-title: <title from owner suggestion.md>
generated: <today YYYY-MM-DD>
---

# UC-<uc-number> touching UC-<MMM>

> UC-<uc-number> (<current title>) modifies artifacts originally introduced by UC-<MMM> (<owner title>).

## Schema changes in UC-<MMM>'s domain

- `<EntityName>`: <what was added, modified, or extended — one bullet per entity>

_None_ (if no schema changes for this owner)

## API changes in UC-<MMM>'s domain

- `<METHOD> <path>`: <what changed — one bullet per endpoint>

_None_ (if no API changes for this owner)

## Frontend changes in UC-<MMM>'s domain

- `<sliceName>`: <what was added or modified — one bullet per slice>

_None_ (if no frontend changes for this owner)

## Prep opportunity

<One concise paragraph: what UC-<MMM> could have designed differently — a structural choice, naming convention, enum extraction, or extensibility hook — to make this modification cleaner, WITHOUT requiring any business logic or model that UC-<MMM>'s own feature did not need.

If every modification required future business logic that UC-<MMM> had no reason to anticipate (e.g. adding a FK to an entity that didn't exist yet), write:>

None — these changes required future business logic that UC-<MMM> had no reason to anticipate at design time.
```

---

## Step 6 — Compile testState.md

Read both partial test files:
- `<uc-folder>/testState-backend.md`
- `<uc-folder>/testState-frontend.md`

Merge them into a single `<uc-folder>/testState.md` reorganised by BR ID. Format:

```markdown
# Test State — $ARGUMENTS

## <BR-ID>: <Rule text>

| Application | Type | Test Description |
|---|---|---|
| backend | integration | ... |
| frontend | component | ... |
```

All tests for a given BR appear in the same table regardless of application. BRs appear in ID order (BR-001, BR-002, ...).

Also write `<uc-folder>/testStateDiff.md`:
- For UC-001 (blank baseline): every BR section is marked **NEW**
- Otherwise: compare against `<prev-uc-folder>/testState.md` and show NEW, MODIFIED, or REMOVED sections

After writing `testState.md`, delete `testState-backend.md` and `testState-frontend.md`.

---

## Step 7 — Handle contract validation result

Read `<uc-folder>/contract-validation.json`.

- If `result` is `FAIL`: report all errors to the user. Do NOT update `usecases.md`. Tell the user the architects must be re-run after fixing the errors in `suggestion.md`.
- If `result` is `PASS`: proceed to Step 7.5.

---

## Step 7.5 — Run the postman builder

Spawn the `postman-builder` agent with the following prompt (fill in actual resolved paths):

```
Build Postman collection entry for $ARGUMENTS.

openapi:       <uc-folder>/openapi.yaml
testState:     <uc-folder>/testState.md
suggestion:    <uc-folder>/suggestion.md
Collection:    postman/campmanager-collection.json
Environment:   postman/campmanager-environment.json
```

Wait for the postman builder to complete before proceeding.

---

## Step 8 — Update usecases.md

Read `.claude/architecture/usecases.md`. Upsert the row for $ARGUMENTS:
- If no row exists: add it with status `Draft` (or `Approved` if suggestion.md status is `Approved`)
- If a row exists: update the `Updated` date; preserve the existing status unless suggestion.md is `Approved` (in which case set to `Approved`)

---

## Step 9 — Report to the user

Summarise:
- Artifacts generated (list files, including any touch.md files created under `<uc-folder>/NNN/`)
- Postman files updated (`postman/campmanager-collection.json`, `postman/campmanager-environment.json`)
- Contract validation result + any warnings
- Any errors that must be resolved
- Next step: review the artifacts, then proceed to implementation
