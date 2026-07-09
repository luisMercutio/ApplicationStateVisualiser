Reconcile architecture artifacts with what was actually implemented for a Done or Needs-Human-Review Epic. Usage: `/epic-reconcile EPIC-005`

## Folder resolution

Before Step 1, resolve the Epic folder from $ARGUMENTS:
1. Extract the 3-digit Epic number (strip `EPIC-` prefix, zero-pad).
2. Glob `.claude/architecture/${NNN}-*/` — if one match, use it as `<epic-folder>`.
3. Fallback: `<epic-folder>/` (legacy).
4. All subsequent path references use `<epic-folder>` instead of `<epic-folder>/`.

## What you are doing

You are comparing the architecture documents produced by `/epic-generate` against what the developer agents actually built. The goal is two-fold:

1. **FIX_SPEC** — the code made a better or different choice than the spec described. The code is correct; update the architecture documents so future Epics and fresh regenerations use the correct baseline.
2. **FIX_CODE** — the spec correctly required something the code omitted. Surface it with pre-filled epic-patch guidance so the user can close the gap cleanly.

**Files that MAY be updated:** `ClassDiagram.md`, `testState.md`, `FrontendState.md`, `selectors.yaml`
**Files that must NOT be changed:** `openapi.yaml` (API contract), `suggestion.md` (original intent), any diff files

If a divergence in `openapi.yaml` is found (the API was implemented differently from the contract), classify it as `NEEDS_PATCH` — report it and tell the user to run `/epic-patch`.

---

## Step 1 — Validate preconditions

1. Read `.claude/architecture/epics.md`. Confirm `$ARGUMENTS` has Status `Done` or `Needs Human Review`. If not, abort:
   > `$ARGUMENTS` has status `<STATUS>`. Reconcile applies only to implemented Epics (Done or Needs Human Review).

2. Read:
   - `<epic-folder>/suggestion.md`
   - `<epic-folder>/ClassDiagram.md`
   - `<epic-folder>/openapi.yaml`
   - `<epic-folder>/FrontendState.md`
   - `<epic-folder>/selectors.yaml`
   - `<epic-folder>/testState.md`

---

## Step 2 — Re-entry detection

Look for `<epic-folder>/reconcile-report.md`.

- **Does not exist** → first run. Continue to Step 3.
- **Exists, `status: Draft`** → remind the user:
  > `reconcile-report.md` is still `Draft`. Review the divergences, reclassify any you disagree with, then set frontmatter `status: Approved` and re-run `/epic-reconcile $ARGUMENTS`.

  Stop.
- **Exists, `status: Approved`** → re-entry after approval. Skip to Step 5.

---

## Step 3 — Scan: identify divergences (parallel)

Spawn the **backend-architect** and **frontend-architect** agents in a single parallel call.

**backend-architect prompt:**
```
Reconcile scan — backend, for $ARGUMENTS.

You are reading both the architecture documents and the actual implementation to identify every meaningful divergence. Do NOT modify any existing file — your only output is the scan report.

Architecture to compare against:
  ClassDiagram:  <epic-folder>/ClassDiagram.md
  openapi:       <epic-folder>/openapi.yaml
  testState:     <epic-folder>/testState.md

Implementation to read (scope to $ARGUMENTS-related files only):
  backend/src/main/java/
  backend/src/test/java/

For every divergence, classify as one of:
  FIX_SPEC   — code is correct; the spec doc is imprecise, wrong, or describes the wrong mechanism
  FIX_CODE   — spec correctly required something the code omitted or weakly implemented
  NEEDS_PATCH — the openapi.yaml API contract diverges from the running implementation (escalate)
  ACCEPTED   — a deliberate simplification with no spec impact (note it but no action needed)

Common divergence types to check for:
  - Entity mapping choices (@ElementCollection vs full @Entity, scalar FK vs @ManyToOne, etc.)
  - Bidirectional navigation collections present in code but absent from the diagram
  - Security enforcement mechanism (@PreAuthorize on methods vs URL matchers in SecurityConfig)
  - Test descriptions in testState.md that describe the wrong implementation mechanism
  - Tests specified in testState.md that are absent or materially weaker in the test classes
  - Validation logic implemented differently from the BR description
  - DB constraints present in code but not reflected in ClassDiagram.md annotations

Write your findings to: <epic-folder>/reconcile-scan-backend.md

Use this format:

---
## Divergence B1: <short topic name>
**Classification:** FIX_SPEC | FIX_CODE | NEEDS_PATCH | ACCEPTED
**Spec says:** <what ClassDiagram.md / testState.md / openapi.yaml states>
**Impl does:** <what the code actually does>
**Affected spec file:** <ClassDiagram.md | testState.md | openapi.yaml | none>
**Proposed change:** <exact edit needed, or "no change" for ACCEPTED>
**Reason this approach is correct / why this gap matters:** <one sentence>
---

Prefix every ID with "B". Write a section for every divergence found, including ACCEPTED items. If no divergences are found, write "No backend divergences found."
```

**frontend-architect prompt:**
```
Reconcile scan — frontend, for $ARGUMENTS.

You are reading both the architecture documents and the actual implementation to identify every meaningful divergence. Do NOT modify any existing file — your only output is the scan report.

Architecture to compare against:
  FrontendState: <epic-folder>/FrontendState.md
  selectors:     <epic-folder>/selectors.yaml
  testState:     <epic-folder>/testState.md
  openapi:       <epic-folder>/openapi.yaml

Implementation to read (scope to $ARGUMENTS-related files only):
  frontend/src/app/

For every divergence, use the same classification and format as the backend scan. Prefix IDs with "F".

Common divergence types to check for:
  - NgRx state shape differs from FrontendState.md (extra slices, renamed keys, missing fields)
  - Selector implementations differ from selectors.yaml (different composition, missing memoization)
  - Guards implemented differently from the spec (different signals, different redirect targets)
  - Test descriptions in testState.md that describe the wrong implementation mechanism
  - Tests specified in testState.md that are absent or materially weaker in the spec files
  - HTTP calls made differently from the openapi contract (wrong path, wrong method, extra headers)

Write findings to: <epic-folder>/reconcile-scan-frontend.md
```

Wait for both.

---

## Step 4 — Compile reconcile-report.md

Read both scan files:
- `<epic-folder>/reconcile-scan-backend.md`
- `<epic-folder>/reconcile-scan-frontend.md`

Merge into `<epic-folder>/reconcile-report.md`:

```markdown
---
epic: $ARGUMENTS
status: Draft
generated: <today YYYY-MM-DD>
---

# Reconcile Report — $ARGUMENTS

> Review each divergence below. Change any classification you disagree with.
> To skip an item, change its classification to `ACCEPTED` or `WONT_FIX`.
> Set frontmatter `status: Approved` when ready, then re-run `/epic-reconcile $ARGUMENTS`.

## Summary

| Classification | Count |
|---|---|
| FIX_SPEC | N |
| FIX_CODE | N |
| NEEDS_PATCH | N |
| ACCEPTED | N |

## Divergences

| ID | Topic | Classification | Affected file |
|---|---|---|---|
| B1 | ... | FIX_SPEC | ClassDiagram.md |
| F1 | ... | FIX_CODE | — |

---

## FIX_SPEC Details

### B1: <topic>
**Spec says:** <...>
**Impl does:** <...>
**Update:** Edit `ClassDiagram.md` — <specific change described>
**Reason:** <why the implementation approach is correct>

---

## FIX_CODE Details

> For each item below, run `/epic-patch $ARGUMENTS` and use the pre-filled answers.

### B2: <topic>
**BR:** BR-0XX — <rule text>
**Gap:** <what the spec requires that the code omits>

**Pre-filled epic-patch answers:**
1. What changed? → <one-sentence description of what needs to be added>
2. Affected BRs → BR-0XX (no new BRs)
3. Affected components → backend: `<TestClass>` — add test method `<test_name>`
4. API / Schema impact? → No
5. Acceptance criteria → <the specific observable outcome>

---

## NEEDS_PATCH Escalations

<List any openapi.yaml divergences. These require /epic-patch or a new Epic.>
<If none: "None found.">

---

## ACCEPTED / WONT_FIX

| ID | Topic | Reason |
|---|---|---|
| B3 | ... | Deliberate simplification — no spec impact |
```

Delete `reconcile-scan-backend.md` and `reconcile-scan-frontend.md` after merging.

Tell the user:
- `reconcile-report.md` is written as `status: Draft`
- Review every divergence — change any classification you disagree with
- To skip an item entirely, change its classification to `ACCEPTED` or `WONT_FIX`
- Set frontmatter to `status: Approved` when ready
- Re-run `/epic-reconcile $ARGUMENTS`

Stop here until the user approves.

---

## Step 5 — Execute FIX_SPEC updates (re-entry point)

Read `reconcile-report.md`. Confirm `status: Approved`. If not, stop and remind the user.

Collect all divergences where classification is `FIX_SPEC`.

If none → skip to Step 6.

Determine which agents are needed:
- Any FIX_SPEC item touches `ClassDiagram.md` or the backend rows of `testState.md` → spawn **backend-architect**
- Any FIX_SPEC item touches `FrontendState.md`, `selectors.yaml`, or the frontend rows of `testState.md` → spawn **frontend-architect**

Spawn the needed agents in a single parallel call.

**backend-architect prompt (if needed):**
```
Spec reconcile — update mode for $ARGUMENTS.

Read the approved reconcile report: <epic-folder>/reconcile-report.md

Apply ONLY the items classified FIX_SPEC that affect ClassDiagram.md or testState.md.

Files you may edit:
  <epic-folder>/ClassDiagram.md
  <epic-folder>/testState.md  (backend rows only)

Hard constraints:
  - Do NOT touch openapi.yaml
  - Do NOT add or remove BRs — only update descriptions or diagram annotations
  - Do NOT change the cumulative scope of the diagram — only correct how existing elements are described
  - Do NOT add new entities, endpoints, or test entries beyond what the reconcile report specifies

After editing, write a one-line summary of each change made.
```

**frontend-architect prompt (if needed):**
```
Spec reconcile — update mode for $ARGUMENTS.

Read the approved reconcile report: <epic-folder>/reconcile-report.md

Apply ONLY the items classified FIX_SPEC that affect FrontendState.md, selectors.yaml, or testState.md frontend rows.

Files you may edit:
  <epic-folder>/FrontendState.md
  <epic-folder>/selectors.yaml
  <epic-folder>/testState.md  (frontend rows only)

Same hard constraints as above. Do NOT touch openapi.yaml.

After editing, write a one-line summary of each change made.
```

Wait for both. If either reports an error, stop and surface it before proceeding.

---

## Step 6 — Surface FIX_CODE guidance

Read `reconcile-report.md`. Collect all divergences where classification is `FIX_CODE`.

If none → skip to Step 7.

Tell the user:

> The following code gaps were identified. Run `/epic-patch $ARGUMENTS` once per item — the pre-filled answers in the reconcile report are your Q&A inputs for each patch session. No changes are made automatically; you control when each patch is applied.

List each FIX_CODE item with its pre-filled answers.

If any `NEEDS_PATCH` escalations exist, surface them separately:

> The following divergences affect the API contract (`openapi.yaml`) and cannot be reconciled by updating specs alone. Address each with `/epic-patch $ARGUMENTS` (if no schema change is needed) or a new `/epic-suggest EPIC-00X` (if a schema change is required).

---

## Step 7 — Update reconcile-report.md status

Edit the frontmatter:
- `status: Complete`
- Add `completed: <today YYYY-MM-DD>`

---

## Step 8 — Commit

Stage only architecture files (no source code):
```bash
git add <epic-folder>/
```

Commit:
```bash
git commit -m "docs($ARGUMENTS): reconcile spec with implementation [epic-reconcile]"
```

If nothing was changed by FIX_SPEC (all items were ACCEPTED or FIX_CODE only), commit only the reconcile-report.md:
```bash
git commit -m "docs($ARGUMENTS): add reconcile report — no spec changes needed [epic-reconcile]"
```

---

## Step 9 — Report to user

```
## Reconcile Complete — $ARGUMENTS

### FIX_SPEC Updates Applied
<list each file changed and the one-line summary from the architect agents>
<or "None — all items were ACCEPTED or FIX_CODE">

### FIX_CODE Items (action required)
<for each item>
  - <ID>: <topic> — run `/epic-patch $ARGUMENTS` (pre-filled answers in reconcile-report.md)

### NEEDS_PATCH Escalations
<list any openapi.yaml divergences, or "None">

### ACCEPTED / WONT_FIX
<list items skipped with reason>

### Next Steps
<if FIX_CODE items exist>
  1. Open <epic-folder>/reconcile-report.md — FIX_CODE Details section
  2. For each item, run `/epic-patch $ARGUMENTS` using the pre-filled answers
<if no FIX_CODE items>
  Spec is now aligned with implementation. No further action required.
```

---

## Classification reference

| Classification | Meaning | Action |
|---|---|---|
| `FIX_SPEC` | Code correct; spec document wrong or imprecise | Architect agents update ClassDiagram.md / testState.md / FrontendState.md / selectors.yaml |
| `FIX_CODE` | Spec correct; code omitted or weakened something | User runs `/epic-patch` with pre-filled guidance |
| `NEEDS_PATCH` | API contract (`openapi.yaml`) diverges from running code | User runs `/epic-patch` or `/epic-suggest` for a new Epic |
| `ACCEPTED` | Deliberate simplification; both spec and code are fine as-is | No action |
| `WONT_FIX` | Known gap; out of scope for this Epic | No action; document reason |

## When to run this command

Run `/epic-reconcile` after any Epic whose outcome is `Needs Human Review`, or when a post-implementation review (like the one that prompted this command's creation) identifies spec-vs-code divergences. It is not necessary after a clean `Done` outcome unless a review reveals gaps.
