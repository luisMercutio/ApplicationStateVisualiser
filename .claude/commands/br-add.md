Add a single Business Rule to an existing Epic (the small-change path). Usage: `/br-add EPIC-007` (add one BR to that Epic), optionally with the rule text: `/br-add EPIC-007 "Session names are validated before attach"`.

## What you are doing

The **Business Rule is the atomic unit** of this methodology. When a change is
*small* — it fits inside an existing Epic, needs **no new** entity/table/endpoint-group/
NgRx slice/route, and is expressible as **one (occasionally two)** enforceable rule(s) —
you do **not** spin up a whole Epic. You append a single Business Rule to the Epic
that already owns that area.

This is the counterpart to `/epic-generate` (the large path). `/epic-suggest`
classifies a change by size and routes here when it is small. See the size
heuristic in `.claude/EPIC-METHODOLOGY.md` — it is the source of truth.

**Escalate, don't force:** if while doing this you find the change needs a new
entity, endpoint group, slice, route, or spills past two rules, STOP and tell the
user to run `/epic-generate` (new Epic) or `/epic-patch` instead. A BR is cheap to
promote; do not smuggle Epic-sized work through this command.

---

## Step 0 — Parse `$ARGUMENTS`

- First token = the target **Epic id** (`EPIC-NNN`, optionally a letter suffix). Required.
- Remaining text (optional) = the rule statement. If absent, ask the user for it.
- Resolve the Epic folder `.claude/architecture/<NNN>-<slug>/`. If it does not exist,
  tell the user the Epic must exist first (`/epic-suggest` then `/epic-generate`), and stop.

## Step 1 — Size gate (fail closed to the Epic path)

Confirm the change qualifies as a single BR against the heuristic:
- fits inside this existing Epic, AND
- introduces no new entity/table/endpoint-group/slice/route, AND
- is 1 (or at most 2) enforceable rule(s).

If it does not qualify, print which condition failed and recommend `/epic-generate`
or `/epic-patch`. Do not proceed.

## Step 2 — Allocate the BR id and seq

- Scan every `.claude/architecture/*/business-rules.json` for the highest existing
  `BR-###` id and the highest `seq`. The new rule takes the next id (`BR-<max+1>`,
  zero-padded to at least 3 digits) and, by default, the next global `seq` (`max+1`).
- If the rule logically belongs earlier in the Epic's local order, you may instead
  insert it with a fractional/interstitial seq consistent with the Epic's other
  rules — but keep the global id monotonic.

## Step 3 — Append the Business Rule

Append one object to the Epic's `business-rules.json` `rules[]`, conforming to
`.claude/schemas/business-rules.schema.json`:
- `id` — the allocated `BR-###`.
- `epic` — this Epic id.
- `seq` — the allocated sequence.
- `rule` — the exact statement.
- `category` — one of the schema's categories (auth/validation/workflow/data/ui/routing/integration/other).
- `rationale` — optional, the WHY.
- `dependsOn` — ids of BRs that are HARD prerequisites (true prerequisite DAG only).
- `relatedEpic` — any `[[EPIC-XXX]]` referenced.
- `touches` — anchors into the existing artifacts this rule governs (entities,
  endpoints `METHOD /path`, slices, selectors, components, mockups, tests). Only
  reference artifacts that ALREADY exist in this Epic — if you would need a new one,
  the change is not BR-sized (escalate).

Do **not** write node (x,y) coordinates here — those live in the viewer-owned
`br-positions.json`.

## Step 4 — Reflect the rule in the human artifacts (light touch)

- **`suggestion.md`** — append one row to the Epic's **Business Rules** table
  (id, rule, category, dependsOn), so the human brief and the JSON stay in step.
- **`testState.md`** — add one `## BR-###` section with at least one test case that
  verifies the rule (its test-case library). Keep it to this rule only.
- Do **not** regenerate `ClassDiagram.md`, `openapi.yaml`, `FrontendState.md`,
  `selectors.yaml`, or mockups. If the rule genuinely required changing any of those,
  it was not BR-sized — escalate (Step 1).

## Step 5 — Report

Print a short summary: the new `BR-###`, its Epic, category, `dependsOn`, and the
files touched. Remind the user that the running application's live copy of BRs lives
in that application's own database (editable in the app's **BR List** under the
active connection) — this command only updates the spec artifacts.

## Hard rules

- One (at most two) Business Rule(s) per invocation. More than that → `/epic-generate`.
- Never add a new entity, endpoint group, NgRx slice, or route here. Those are
  Epic-sized and must go through `/epic-generate`.
- The BR id is globally unique and monotonic; never reuse or renumber existing ids.
- Keep `dependsOn` a true prerequisite graph, not a "related to" list.
