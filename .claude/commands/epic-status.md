Show the implementation status of the Epic chain and detail the state of a specific Epic.

Usage: `/epic-status` (last Epic) or `/epic-status EPIC-014` (specific Epic).

## What you are doing

You are reading the architecture folder to produce a concise human-readable status report. You do NOT write any files. Everything is output directly to the user.

---

## Step 1 — Resolve the target Epic

Read `.claude/architecture/epics.md`.

**If $ARGUMENTS is provided** (e.g. `EPIC-014`, `14`, `014`):
- Normalize to a 3-digit zero-padded number.
- Find that row in `epics.md`. If not found, abort: "EPIC-XXX not found in epics.md."
- This is the **target Epic**.

**If $ARGUMENTS is empty:**
- The **target Epic** is the last row in the table (highest Epic number).

---

## Step 2 — Print the chain overview

Output a markdown table of all Epics from `epics.md`, with a status badge:

```
## Epic Chain Overview

| Epic | Title | Status |
|----|-------|--------|
| EPIC-001 | Authentication & User Management | ✅ Done |
| EPIC-002 | Application Bootstrap | ✅ Done |
| EPIC-003 | Pre-Setup Guard | ⚠️ Needs Human Review |
| EPIC-014 | Associate Documents to Billing | 🔍 Needs Human Review |  ← (target Epic highlighted)
```

Use these badges:
- `✅ Done` — Status is `Done`
- `⚠️ Needs Human Review` — Status is `Needs Human Review`
- `🔄 In Development` — Status is `In Development`
- `🧪 Testing` — Status is `Testing`
- `🔧 Fixing Deprecations` — Status is `Fixing Deprecations`
- `🔁 Re-Testing` — Status is `Re-Testing`
- `📐 Approved` — Status is `Approved`
- `📝 Draft` — Status is `Draft`
- `🔗 Retroactive` — Status is `Retroactive`

Mark the target Epic row with `← target` at the end of its line.

Then print a one-line count summary, e.g.:
> 2 Done · 11 Needs Human Review · 1 Draft · 14 total

---

## Step 3 — Locate the target Epic folder

Glob `.claude/architecture/<NNN>-*/` where `<NNN>` is the zero-padded target Epic number.
Fallback: `.claude/architecture/EPIC-<original>/` (legacy naming).
If not found, abort: "Architecture folder for target Epic not found."

All subsequent reads use this `<epic-folder>`.

---

## Step 4 — Read target Epic artifacts

Read all of the following files that exist (skip gracefully if absent):

1. `<epic-folder>/suggestion.md` — title, status, business rules
2. `<epic-folder>/ClassDiagramDiff.md` — schema changes introduced by this Epic
3. `<epic-folder>/openapiDiff.md` — API changes introduced by this Epic
4. `<epic-folder>/FrontendStateDiff.md` — frontend state changes introduced by this Epic
5. `<epic-folder>/test-report-backend.md` — backend test results (look for `## Status` line and total test count)
6. `<epic-folder>/test-report-frontend.md` — frontend test results (look for `## Status` line and total test count)
7. `<epic-folder>/contract-validation.json` — API contract validation result (`result` field)

---

## Step 5 — Print the target Epic detail section

Output the following sections. Omit a section entirely if its source file was absent.

### Header

```
---

## EPIC-NNN: <Title> — <Status badge>
```

### Design Scope (from diffs)

Summarize what this Epic introduced or changed. Be concise — use bullets, not paragraphs.

```
### Design Scope

**Schema** (from ClassDiagramDiff.md)
- NEW entity `document` (id, billing_information_id FK, original_filename, stored_filename, content_type, uploaded_at, document_type)
- MODIFIED entity `billing_information` — (describe change if any)

**API** (from openapiDiff.md)
- NEW  POST /documents/upload/{billingId}/
- NEW  GET  /billing/{billingId}/documents/
- NEW  GET  /documents/{documentId}/download/
- NEW  DELETE /documents/{documentId}/

**Frontend** (from FrontendStateDiff.md)
- NEW slice `documentsSlice` in `bookingsFeature`
- NEW component `BillingDetailPageComponent`
- MODIFIED `BookingsListPageComponent`
```

If a diff file is missing, write `(diff not yet generated)` for that section.

### Business Rules (from suggestion.md)

Extract and print the business rules table from `suggestion.md` as-is. If not present, skip.

```
### Business Rules

| ID | Rule |
|----|------|
| BR-001 | All document endpoints require MANAGE_BOOKINGS ... |
...
```

### Test Status

```
### Test Status

| Side | Status | Tests |
|------|--------|-------|
| Backend  | ✅ CLEAN | 439 passed, 0 failed |
| Frontend | ✅ CLEAN | 87 passed, 0 failed |

**Contract validation:** PASS
```

Derive the test counts from the `## Test Results` section of each report (look for lines like `Total: N tests, M failures`). If a report file is absent, show `(not yet run)`.

For Status: `✅ CLEAN` if `## Status` = `CLEAN`, `❌ NEEDS_FIX` if `NEEDS_FIX`, `(not yet run)` if file absent.

For contract-validation.json: show `PASS`, `FAIL`, or `(not yet validated)`.

### What's Next

Based on the target Epic's current status, print a one-line recommended next step:

| Status | Next step message |
|---|---|
| `Draft` | Run `/epic-generate EPIC-NNN` to produce architecture artifacts. |
| `Approved` | Run `/epic-develop` to implement this Epic. |
| `In Development` | Development is in progress — wait or check agent output. |
| `Testing` | Tests are running — wait or check tester agent output. |
| `Fixing Deprecations` | Deprecation fixes are in progress — wait or check agent output. |
| `Re-Testing` | Re-test round is running — wait or check tester agent output. |
| `Done` | This Epic is complete. Review the next Epic or run `/epic-suggest` to plan the next one. |
| `Needs Human Review` | Human review required. Check `test-report-backend.md` and `test-report-frontend.md` for unresolved action items, then resolve them manually or with `/epic-patch EPIC-NNN`. |
| `Retroactive` | Retroactive spec only — no development needed here. |

---

## Step 6 — Done

Output nothing further. Do not write any files.
