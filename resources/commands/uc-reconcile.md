Reconcile architecture artifacts with what was actually implemented for a Done or Needs-Human-Review use case. Usage: `/uc-reconcile UC-005`

## Folder resolution

Before Step 1, resolve the UC folder from $ARGUMENTS:
1. Extract the 3-digit UC number (strip `UC-` prefix, zero-pad).
2. Glob `.claude/architecture/${NNN}-*/` — if one match, use it as `<uc-folder>`.
3. Fallback: `<uc-folder>/` (legacy).
4. All subsequent path references use `<uc-folder>` instead of `<uc-folder>/`.

## What you are doing

You are comparing the architecture documents produced by `/uc-generate` against what the developer agents actually built. The goal is two-fold:

1. **FIX_SPEC** — the code made a better or different choice than the spec described. The code is correct; update the architecture documents so future UCs and fresh regenerations use the correct baseline.
2. **FIX_CODE** — the spec correctly required something the code omitted. Surface it with pre-filled uc-patch guidance so the user can close the gap cleanly.

**Files that MAY be updated:** `ClassDiagram.md`, `testState.md`, `FrontendState.md`, `selectors.yaml`
**Files that must NOT be changed:** `openapi.yaml` (API contract), `suggestion.md` (original intent), any diff files

If a divergence in `openapi.yaml` is found (the API was implemented differently from the contract), classify it as `NEEDS_PATCH` — report it and tell the user to run `/uc-patch`.

---

## Step 1 — Validate preconditions

1. Read `.claude/architecture/usecases.md`. Confirm `$ARGUMENTS` has Status `Done` or `Needs Human Review`. If not, abort:
   > `$ARGUMENTS` has status `<STATUS>`. Reconcile applies only to implemented UCs (Done or Needs Human Review).

2. Read:
   - `<uc-folder>/suggestion.md`
   - `<uc-folder>/ClassDiagram.md`
   - `<uc-folder>/openapi.yaml`
   - `<uc-folder>/FrontendState.md`
   - `<uc-folder>/selectors.yaml`
   - `<uc-folder>/testState.md`

---

## Step 2 — Re-entry detection

Look for `<uc-folder>/reconcile-report.md`.

- **Does not exist** → first run. Continue to Step 3.
- **Exists, `status: Draft`** → remind the user:
  > `reconcile-report.md` is still `Draft`. Review the divergences, reclassify any you disagree with, then set frontmatter `status: Approved` and re-run `/uc-reconcile $ARGUMENTS`.

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
  ClassDiagram:  <uc-folder>/ClassDiagram.md
  openapi:       <uc-folder>/openapi.yaml
  testState:     <uc-folder>/testState.md

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

Write your findings to: <uc-folder>/reconcile-scan-backend.md

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
  FrontendState: <uc-folder>/FrontendState.md
  selectors:     <uc-folder>/selectors.yaml
  testState:     <uc-folder>/testState.md
  openapi:       <uc-folder>/openapi.yaml

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

Write findings to: <uc-folder>/reconcile-scan-frontend.md
```

Wait for both.

---

## Step 4 — Compile reconcile-report.md

Read both scan files:
- `<uc-folder>/reconcile-scan-backend.md`
- `<uc-folder>/reconcile-scan-frontend.md`

Merge into `<uc-folder>/reconcile-report.md`:

```markdown
---
uc: $ARGUMENTS
status: Draft
generated: <today YYYY-MM-DD>
---

# Reconcile Report — $ARGUMENTS

> Review each divergence below. Change any classification you disagree with.
> To skip an item, change its classification to `ACCEPTED` or `WONT_FIX`.
> Set frontmatter `status: Approved` when ready, then re-run `/uc-reconcile $ARGUMENTS`.

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

> For each item below, run `/uc-patch $ARGUMENTS` and use the pre-filled answers.

### B2: <topic>
**BR:** BR-0XX — <rule text>
**Gap:** <what the spec requires that the code omits>

**Pre-filled uc-patch answers:**
1. What changed? → <one-sentence description of what needs to be added>
2. Affected BRs → BR-0XX (no new BRs)
3. Affected components → backend: `<TestClass>` — add test method `<test_name>`
4. API / Schema impact? → No
5. Acceptance criteria → <the specific observable outcome>

---

## NEEDS_PATCH Escalations

<List any openapi.yaml divergences. These require /uc-patch or a new UC.>
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
- Re-run `/uc-reconcile $ARGUMENTS`

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

Read the approved reconcile report: <uc-folder>/reconcile-report.md

Apply ONLY the items classified FIX_SPEC that affect ClassDiagram.md or testState.md.

Files you may edit:
  <uc-folder>/ClassDiagram.md
  <uc-folder>/testState.md  (backend rows only)

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

Read the approved reconcile report: <uc-folder>/reconcile-report.md

Apply ONLY the items classified FIX_SPEC that affect FrontendState.md, selectors.yaml, or testState.md frontend rows.

Files you may edit:
  <uc-folder>/FrontendState.md
  <uc-folder>/selectors.yaml
  <uc-folder>/testState.md  (frontend rows only)

Same hard constraints as above. Do NOT touch openapi.yaml.

After editing, write a one-line summary of each change made.
```

Wait for both. If either reports an error, stop and surface it before proceeding.

---

## Step 6 — Surface FIX_CODE guidance

Read `reconcile-report.md`. Collect all divergences where classification is `FIX_CODE`.

If none → skip to Step 7.

Tell the user:

> The following code gaps were identified. Run `/uc-patch $ARGUMENTS` once per item — the pre-filled answers in the reconcile report are your Q&A inputs for each patch session. No changes are made automatically; you control when each patch is applied.

List each FIX_CODE item with its pre-filled answers.

If any `NEEDS_PATCH` escalations exist, surface them separately:

> The following divergences affect the API contract (`openapi.yaml`) and cannot be reconciled by updating specs alone. Address each with `/uc-patch $ARGUMENTS` (if no schema change is needed) or a new `/uc-suggest UC-00X` (if a schema change is required).

---

## Step 7 — Update reconcile-report.md status

Edit the frontmatter:
- `status: Complete`
- Add `completed: <today YYYY-MM-DD>`

---

## Step 8 — Commit

Stage only architecture files (no source code):
```bash
git add <uc-folder>/
```

Commit:
```bash
git commit -m "docs($ARGUMENTS): reconcile spec with implementation [uc-reconcile]"
```

If nothing was changed by FIX_SPEC (all items were ACCEPTED or FIX_CODE only), commit only the reconcile-report.md:
```bash
git commit -m "docs($ARGUMENTS): add reconcile report — no spec changes needed [uc-reconcile]"
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
  - <ID>: <topic> — run `/uc-patch $ARGUMENTS` (pre-filled answers in reconcile-report.md)

### NEEDS_PATCH Escalations
<list any openapi.yaml divergences, or "None">

### ACCEPTED / WONT_FIX
<list items skipped with reason>

### Next Steps
<if FIX_CODE items exist>
  1. Open <uc-folder>/reconcile-report.md — FIX_CODE Details section
  2. For each item, run `/uc-patch $ARGUMENTS` using the pre-filled answers
<if no FIX_CODE items>
  Spec is now aligned with implementation. No further action required.
```

---

## Classification reference

| Classification | Meaning | Action |
|---|---|---|
| `FIX_SPEC` | Code correct; spec document wrong or imprecise | Architect agents update ClassDiagram.md / testState.md / FrontendState.md / selectors.yaml |
| `FIX_CODE` | Spec correct; code omitted or weakened something | User runs `/uc-patch` with pre-filled guidance |
| `NEEDS_PATCH` | API contract (`openapi.yaml`) diverges from running code | User runs `/uc-patch` or `/uc-suggest` for a new UC |
| `ACCEPTED` | Deliberate simplification; both spec and code are fine as-is | No action |
| `WONT_FIX` | Known gap; out of scope for this UC | No action; document reason |

## When to run this command

Run `/uc-reconcile` after any UC whose outcome is `Needs Human Review`, or when a post-implementation review (like the one that prompted this command's creation) identifies spec-vs-code divergences. It is not necessary after a clean `Done` outcome unless a review reveals gaps.
