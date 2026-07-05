Analyze cross-UC preparation opportunities. Usage: `/uc-prep UC-001` (single UC) or `/uc-prep` (all UCs).

## What you are doing

You are reading all `touch.md` files that document how later UCs modified the domain of earlier UCs, and producing a `prep-report.md` for each targeted UC. The report answers: "If you regenerated this UC from scratch today, what small design decisions would make all known future extensions cleaner — without creating loose ends?"

This command is read-only analysis. It writes only `prep-report.md` files. It does not modify any existing architecture artifacts or source code.

---

## Step 1 — Determine target UC(s)

**If $ARGUMENTS is provided** (e.g. `UC-001`, `001`, or `1`):
- Normalize to a 3-digit zero-padded number (e.g. `001`).
- Locate the UC folder: glob `.claude/architecture/${NNN}-*/`, fallback to `.claude/architecture/UC-${original}/`.
- If not found: abort — "No architecture folder found for $ARGUMENTS."
- Process this single UC only.

**If $ARGUMENTS is empty:**
- Read `.claude/architecture/usecases.md` to collect all registered UC IDs.
- For each UC, check whether any `touch.md` files exist for it (Step 2). Skip UCs with no touch.md files.
- Process all UCs that have at least one touch.md.

---

## Step 2 — Find touch.md files for each target UC

For each target UC with number `MMM`:
- Glob for all files matching: `.claude/architecture/*/${MMM}/touch.md`
- If none found: note "No later UC has touched UC-MMM yet" and skip to Step 5 with a minimal report.

---

## Step 3 — Read touch.md files

For each found touch.md:
- Read the full content.
- Record: touching UC number, the schema/API/frontend changes, and the prep opportunity text.

---

## Step 4 — Evaluate prep opportunities

For each prep opportunity extracted from a touch.md, apply the **no-loose-end filter**:

An opportunity is **actionable** if it could have been implemented in the target UC without adding any entity, endpoint, or business logic that the target UC's own BRs do not require. The change must be purely structural, typographical, or extensibility-oriented.

Actionable examples (no loose end):
- Extract hardcoded role strings into a `UserRole` enum — no new values, just better typing
- Use a config-sourced constant for a timeout value instead of a hardcoded literal
- Add `nullable notes String` to an entity — the field exists but is unused until a later UC fills it
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

For each target UC Y, write `<uc-folder>/prep-report.md`:

**When actionable opportunities exist:**

```markdown
---
uc: UC-<MMM>
generated: <today YYYY-MM-DD>
opportunities: <count of actionable items>
---

# Prep Report — UC-<MMM>: <UC title>

> What this UC could have designed differently to prepare for known future extensions —
> without creating loose ends. Every item here is a structural or typographical decision
> that requires no future business logic. Use this when regenerating this UC.

## Summary

| Future UC | Type | Opportunity |
|---|---|---|
| UC-<N> (<title>) | structural | <one-line description> |
| UC-<N> (<title>) | extensibility | <one-line description> |

## Details

### From UC-<N>: <touching UC title>

**What UC-<N> changed in UC-<MMM>'s domain:**
<brief summary: which entities/endpoints/slices were modified>

**Prep opportunity:** <the full prep opportunity text from touch.md>

**Type:** `structural` | `extensibility` | `convention` | `config`

**How to apply when regenerating:** <one concrete instruction for the architect — e.g. "In the ClassDiagram, type the `role` field as `UserRole` enum rather than `String`.">

---

_(repeat for each touching UC that had an actionable opportunity)_

## Discarded (non-actionable)

The following touch.md entries were reviewed and discarded because they required future business logic not present in UC-<MMM>:

| Future UC | Reason |
|---|---|
| UC-<N> (<title>) | <why it would create a loose end> |

_(Omit this section if no entries were discarded.)_
```

**When no actionable opportunities exist:**

```markdown
---
uc: UC-<MMM>
generated: <today YYYY-MM-DD>
opportunities: 0
---

# Prep Report — UC-<MMM>: <UC title>

No actionable prep opportunities found.

All known future extensions to this UC's domain required future business logic (new entities,
new endpoints, or new models) that was not anticipatable at this UC's design time.
A regeneration of this UC would not benefit from advance preparation.
```

**When no touch.md files exist yet:**

```markdown
---
uc: UC-<MMM>
generated: <today YYYY-MM-DD>
opportunities: 0
---

# Prep Report — UC-<MMM>: <UC title>

No later UC has modified this UC's domain yet. No prep report can be generated.
Re-run `/uc-prep UC-<MMM>` after more UCs have been generated to see if cross-UC
impacts emerge.
```

---

## Step 6 — Report to the user

List each processed UC:
- UC ID and title
- Count of actionable opportunities
- Path to the written `prep-report.md`, or a note if skipped

Then tell the user:

> Prep reports describe design decisions for future regenerations — they do not require
> any immediate action on existing code or specs. When you plan to regenerate or rewrite
> a UC, read its `prep-report.md` before running `/uc-generate` so the architect can
> incorporate the known forward-compatibility decisions from the start.
