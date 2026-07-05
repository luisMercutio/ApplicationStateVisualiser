Apply a small targeted patch to an already-implemented use case. Usage: `/uc-patch UC-002`

## Folder resolution

Before Step 1, resolve the UC folder from $ARGUMENTS:
1. Extract the 3-digit UC number (strip `UC-` prefix, zero-pad).
2. Glob `.claude/architecture/${NNN}-*/` — if one match, use it as `<uc-folder>`.
3. Fallback: `<uc-folder>/` (legacy).
4. All subsequent path references use `<uc-folder>` instead of `<uc-folder>/`.

## What you are doing

You are guiding the user through a scoped change to an existing, implemented UC — a business-rule tweak, a new validation, a UI adjustment, or a small field addition. You do NOT re-run the architect agents. If the user's change touches the API contract or DB schema, you will escalate to a new UC instead.

---

## Step 1 — Validate preconditions

1. Read `.claude/architecture/usecases.md`. Confirm the target UC (`$ARGUMENTS`) has `Status = Done`. If not, abort:
   > `$ARGUMENTS` is not yet implemented (status: `<STATUS>`). Patches can only be applied to `Done` use cases.

2. Read `<uc-folder>/suggestion.md` and `<uc-folder>/ClassDiagram.md` and `<uc-folder>/openapi.yaml` — you will need them to scope the session.

---

## Step 2 — Determine patch number

Glob `.claude/architecture/patches/$ARGUMENTS-P*/` to find existing patches. The next patch ID is:
- No patches exist → `P1`
- Patches exist → `P<N+1>` where N is the highest existing number

The full patch ID is `$ARGUMENTS-P<N>` (e.g. `UC-002-P1`). Use this throughout.

---

## Step 3 — Guided patch session

Summarise the parent UC in 3–5 bullet points (title, BRs, endpoints, components) so the user has context.

Then ask ALL of the following in a single message. Wait for complete answers before writing anything.

1. **What changed?** Describe the change in 1–3 sentences.
2. **Affected BRs** — Which existing BR IDs does this touch? Are any new BRs added? State new ones explicitly.
3. **Affected components** — Which files, components, services, or endpoints are in scope? (Be specific — controller, service method, component, reducer action, etc.)
4. **API / Schema impact?** — Does this change any endpoint signature, response shape, or DB column/table? (Answer: yes / no / unsure)
5. **Acceptance criteria** — How will you know the patch is correct? List 1–3 observable outcomes.

---

## Step 4 — Escalation gate

Read the user's answer to question 4.

- If **yes** or **unsure** → stop and tell the user:
  > This patch touches the API contract or DB schema. Changes of that scope need a new UC so the architect baseline chain stays consistent. Run `/uc-suggest UC-00X` for the next UC instead.

- If **no** → continue to Step 5.

---

## Step 5 — Write patch-suggestion.md

Create directory `.claude/architecture/patches/<patch-ID>/` and write `patch-suggestion.md`:

```
---
type: uc-patch
patch-id: <patch-ID>
parent-uc: $ARGUMENTS
status: Draft
updated: <today YYYY-MM-DD>
---

# <patch-ID>: <one-line title of the change>

## Parent UC Summary (baseline)

<3–5 bullet points from Step 3>

## Change Description

<User's answer to Q1, lightly edited for clarity>

## Affected Business Rules

| ID | Change | Rule text |
|---|---|---|
| BR-00X | MODIFIED | <updated rule> |
| BR-00Y | NEW | <new rule> |

## Affected Components

| Layer | Artifact | Change |
|---|---|---|
| backend | `<ClassName>` | <what changes> |
| frontend | `<ComponentName>` | <what changes> |

## Acceptance Criteria

1. <criterion>
2. <criterion>
```

Tell the user:
- The file is written with `status: Draft`
- To approve it, edit the frontmatter to `status: Approved`
- Once approved, re-run `/uc-patch $ARGUMENTS` — the command will detect the approved patch and proceed to implementation

Stop here until the user approves.

---

## Step 6 — Check approval (re-entry point)

When the command is re-run after the user approves:

Read `.claude/architecture/patches/<patch-ID>/patch-suggestion.md`. If `status` is not `Approved`, remind the user to set it and stop.

Read the parent UC artifacts needed for context:
- `<uc-folder>/ClassDiagram.md`
- `<uc-folder>/openapi.yaml`
- `<uc-folder>/FrontendState.md`
- `<uc-folder>/testState.md`

---

## Step 7 — Spawn developer agents (parallel)

Spawn **backend-developer** and **frontend-developer** in a single parallel call.

**backend-developer prompt:**
```
Patch implementation for <patch-ID> (child of $ARGUMENTS).

Patch description: .claude/architecture/patches/<patch-ID>/patch-suggestion.md
Parent UC baseline — ClassDiagram: <uc-folder>/ClassDiagram.md
Parent UC baseline — openapi:      <uc-folder>/openapi.yaml

Scope: apply ONLY the changes listed under "Affected Components" in the patch description.
Do NOT touch DB migrations, endpoints, or entities not listed there.
Do NOT add new tests beyond those covering the patch's acceptance criteria.
After changes: run ./mvnw test -q.
Report: files changed (file + line range), acceptance criteria verified, test status.
```

**frontend-developer prompt:**
```
Patch implementation for <patch-ID> (child of $ARGUMENTS).

Patch description:  .claude/architecture/patches/<patch-ID>/patch-suggestion.md
Parent UC baseline — FrontendState: <uc-folder>/FrontendState.md
Parent UC baseline — openapi:       <uc-folder>/openapi.yaml

Scope: apply ONLY the changes listed under "Affected Components" in the patch description.
Do NOT add new NgRx slices, routes, or components not listed there.
Do NOT add new tests beyond those covering the patch's acceptance criteria.
After changes: run ng test --watch=false.
Report: files changed (file + line range), acceptance criteria verified, test status.
```

Wait for both. If either reports a build failure, stop and surface the error to the user before proceeding.

---

## Step 8 — Spawn tester agents (parallel)

Spawn **backend-tester** and **frontend-tester** in a single parallel call.

**backend-tester prompt:**
```
Run the backend test suite for patch <patch-ID>.
Patch description: .claude/architecture/patches/<patch-ID>/patch-suggestion.md
Parent testState:   <uc-folder>/testState.md
Write your report to: .claude/architecture/patches/<patch-ID>/test-report-backend.md
```

**frontend-tester prompt:**
```
Run the Angular test suite for patch <patch-ID>.
Patch description: .claude/architecture/patches/<patch-ID>/patch-suggestion.md
Parent testState:   <uc-folder>/testState.md
Write your report to: .claude/architecture/patches/<patch-ID>/test-report-frontend.md
```

Wait for both.

---

## Step 9 — Evaluate and fix (one round only)

Read `.claude/architecture/patches/<patch-ID>/test-report-backend.md` and `test-report-frontend.md`.

- Both `CLEAN` → skip to Step 10.
- Either `NEEDS_FIX` → spawn only the affected developer agent(s) with this prompt:

**backend-developer fix prompt (if needed):**
```
Fix round for <patch-ID>. Read .claude/architecture/patches/<patch-ID>/test-report-backend.md.
Apply every action item listed. Do not change architectural decisions or add new functionality.
Re-run ./mvnw test -q after fixes. Report: items resolved, items skipped (with reason), final test status.
```

**frontend-developer fix prompt (if needed):**
```
Fix round for <patch-ID>. Read .claude/architecture/patches/<patch-ID>/test-report-frontend.md.
Apply every action item listed. Do not change architectural decisions or add new functionality.
Re-run ng test --watch=false after fixes. Report: items resolved, items skipped (with reason), final test status.
```

After fix agents complete, re-run testers once more (same prompts as Step 8, overwrite reports). Read the new reports. If still `NEEDS_FIX`, proceed to Step 10 with outcome `Needs Human Review`.

---

## Step 10 — Update patch-suggestion.md status

Edit `.claude/architecture/patches/<patch-ID>/patch-suggestion.md` frontmatter:
- All tests pass → `status: Done`
- Still failing → `status: Needs Human Review`

Update `updated` to today.

---

## Step 11 — Commit

Stage changed files:
```bash
git add backend/ frontend/ .claude/architecture/patches/<patch-ID>/
```

Commit:
- Outcome `Done`:
  ```
  fix($ARGUMENTS): <one-line title from patch-suggestion.md> [<patch-ID>]
  ```
- Outcome `Needs Human Review`:
  ```
  fix($ARGUMENTS): <one-line title from patch-suggestion.md> [<patch-ID>] [needs human review]
  ```

---

## Step 12 — Report to user

```
## Patch Complete — <patch-ID>

Parent UC : $ARGUMENTS
Outcome   : Done | Needs Human Review
Files changed: <list>
Commit    : <commit message>

### Acceptance Criteria
- [x] <criterion 1>
- [x] <criterion 2>

### Unresolved Issues (Needs Human Review only)
<copy action items from test reports>
```

---

## Escalation rules (reference)

| Change type | Use |
|---|---|
| Business rule tweak, new validation, UI copy, minor field | `/uc-patch` |
| New endpoint, new DB column/table, new API response field | New UC (`/uc-suggest`) |
| Cross-cutting refactor affecting multiple UCs | New UC or human-led PR |