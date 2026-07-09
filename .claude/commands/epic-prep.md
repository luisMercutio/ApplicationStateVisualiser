Analyze cross-Epic preparation opportunities. Usage: `/epic-prep EPIC-001` (single Epic) or `/epic-prep` (all Epics).

## What you are doing

You are reading all `touch.md` files that document how later Epics modified the domain of earlier Epics, and producing a `prep-report.md` for each targeted Epic. The report answers: "If you regenerated this Epic from scratch today, what small design decisions would make all known future extensions cleaner — without creating loose ends?"

This command is read-only analysis. It writes only `prep-report.md` files. It does not modify any existing architecture artifacts or source code.

---

## Step 1 — Determine target Epic(s)

**If $ARGUMENTS is provided** (e.g. `EPIC-001`, `001`, or `1`):
- Normalize to a 3-digit zero-padded number (e.g. `001`).
- Locate the Epic folder: glob `.claude/architecture/${NNN}-*/`, fallback to `.claude/architecture/EPIC-${original}/`.
- If not found: abort — "No architecture folder found for $ARGUMENTS."
- Process this single Epic only.

**If $ARGUMENTS is empty:**
- Read `.claude/architecture/epics.md` to collect all registered Epic IDs.
- For each Epic, check whether any `touch.md` files exist for it (Step 2). Skip Epics with no touch.md files.
- Process all Epics that have at least one touch.md.

---

## Step 2 — Find touch.md files for each target Epic

For each target Epic with number `MMM`:
- Glob for all files matching: `.claude/architecture/*/${MMM}/touch.md`
- If none found: note "No later Epic has touched EPIC-MMM yet" and skip to Step 5 with a minimal report.

---

## Step 3 — Read touch.md files

For each found touch.md:
- Read the full content.
- Record: touching Epic number, the schema/API/frontend changes, and the prep opportunity text.

---

## Step 4 — Evaluate prep opportunities

For each prep opportunity extracted from a touch.md, apply the **no-loose-end filter**:

An opportunity is **actionable** if it could have been implemented in the target Epic without adding any entity, endpoint, or business logic that the target Epic's own BRs do not require. The change must be purely structural, typographical, or extensibility-oriented.

Actionable examples (no loose end):
- Extract hardcoded role strings into a `UserRole` enum — no new values, just better typing
- Use a config-sourced constant for a timeout value instead of a hardcoded literal
- Add `nullable notes String` to an entity — the field exists but is unused until a later Epic fills it
- Define a base entity class with `createdAt`/`updatedAt` that other entities inherit

Non-actionable examples (would create a loose end):
- Add a `customerId` FK to a table before the Customer entity exists
- Add a `bookingStatus` field before Bookings are a concept in the system
- Pre-create an availability slot model before any scheduling feature exists

For each actionable opportunity, classify its **type**:
- `structural` — enum extraction, typing improvement, naming convention, shared base class
- `extensibility` — nullable field placeholder, soft-delete flag, extra index, version column
- `convention` — package structure, constant naming, shared utility placement
- `config` — externalized constant or property instead of hardcoded value

Discard non-actionable opportunities entirely. If a touch.md's prep opportunity section says "None — these changes required future business logic…", discard it.

---

## Step 5 — Write prep-report.md

For each target Epic Y, write `<epic-folder>/prep-report.md`:

**When actionable opportunities exist:**

```markdown
---
epic: EPIC-<MMM>
generated: <today YYYY-MM-DD>
opportunities: <count of actionable items>
---

# Prep Report — EPIC-<MMM>: <Epic title>

> What this Epic could have designed differently to prepare for known future extensions —
> without creating loose ends. Every item here is a structural or typographical decision
> that requires no future business logic. Use this when regenerating this Epic.

## Summary

| Future Epic | Type | Opportunity |
|---|---|---|
| EPIC-<N> (<title>) | structural | <one-line description> |
| EPIC-<N> (<title>) | extensibility | <one-line description> |

## Details

### From EPIC-<N>: <touching Epic title>

**What EPIC-<N> changed in EPIC-<MMM>'s domain:**
<brief summary: which entities/endpoints/slices were modified>

**Prep opportunity:** <the full prep opportunity text from touch.md>

**Type:** `structural` | `extensibility` | `convention` | `config`

**How to apply when regenerating:** <one concrete instruction for the architect — e.g. "In the ClassDiagram, type the `role` field as `UserRole` enum rather than `String`.">

---

_(repeat for each touching Epic that had an actionable opportunity)_

## Discarded (non-actionable)

The following touch.md entries were reviewed and discarded because they required future business logic not present in EPIC-<MMM>:

| Future Epic | Reason |
|---|---|
| EPIC-<N> (<title>) | <why it would create a loose end> |

_(Omit this section if no entries were discarded.)_
```

**When no actionable opportunities exist:**

```markdown
---
epic: EPIC-<MMM>
generated: <today YYYY-MM-DD>
opportunities: 0
---

# Prep Report — EPIC-<MMM>: <Epic title>

No actionable prep opportunities found.

All known future extensions to this Epic's domain required future business logic (new entities,
new endpoints, or new models) that was not anticipatable at this Epic's design time.
A regeneration of this Epic would not benefit from advance preparation.
```

**When no touch.md files exist yet:**

```markdown
---
epic: EPIC-<MMM>
generated: <today YYYY-MM-DD>
opportunities: 0
---

# Prep Report — EPIC-<MMM>: <Epic title>

No later Epic has modified this Epic's domain yet. No prep report can be generated.
Re-run `/epic-prep EPIC-<MMM>` after more Epics have been generated to see if cross-Epic
impacts emerge.
```

---

## Step 6 — Report to the user

List each processed Epic:
- Epic ID and title
- Count of actionable opportunities
- Path to the written `prep-report.md`, or a note if skipped

Then tell the user:

> Prep reports describe design decisions for future regenerations — they do not require
> any immediate action on existing code or specs. When you plan to regenerate or rewrite
> an Epic, read its `prep-report.md` before running `/epic-generate` so the architect can
> incorporate the known forward-compatibility decisions from the start.
