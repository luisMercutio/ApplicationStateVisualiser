Scan the UC chain for mentions of a new UC's concept and enrich its suggestion with chain awareness. Usage: `/uc-enrich UC-011`

## What you are doing

You are reading an existing (Draft or Approved) suggestion, deriving its core concept, then scanning every other UC in the chain for textual or structural mentions of that concept. You classify each finding into one of four buckets and propose additions to the suggestion. Nothing is applied until the user reviews and approves the enrich-report.

This command is useful any time, not only before a shift — running it on a normal UC-011 before generating its architecture will surface cross-UC awareness even if you never reposition it.

---

## Step 1 — Resolve the UC folder and re-entry check

Parse $ARGUMENTS (e.g. `UC-011`) using the standard folder resolution: glob `.claude/architecture/${NNN}-*/`, fallback to legacy `UC-${N}`.

Check for `.claude/architecture/<uc-folder>/enrich-report.md`:
- **Does not exist** → first run. Continue to Step 2.
- **Exists, `status: draft`** → remind the user:
  > `enrich-report.md` is still draft. Review it, edit any classifications you disagree with, set frontmatter `status: approved`, then re-run `/uc-enrich $ARGUMENTS` to apply.
  Stop.
- **Exists, `status: approved`** → re-entry after approval. Skip to Step 7.
- **Exists, `status: complete`** → tell the user enrichment has already been applied. Offer to re-run from scratch (will overwrite the existing report).

---

## Step 2 — Read the target suggestion

Read `<uc-folder>/suggestion.md`. Extract:
- The UC title
- The scope section (1–3 sentences)
- All existing BRs (so awareness BRs can avoid duplication)
- The domain (auth, bookings, calendar, etc.)

Derive the **concept key terms**: the 3–8 words or phrases most central to this feature (e.g. for a toolbar: `toolbar`, `navigation bar`, `action bar`, `quick access`, `top nav`, `shortcut`). Include synonyms and partial matches. These are the search terms for the scan.

---

## Step 3 — Scan the chain

Glob all UC folders: `.claude/architecture/*/`. Exclude the target UC itself.

For each other UC folder, read the following files if they exist:
- `suggestion.md` — BRs, component descriptions, scope text
- `ComponentInventory.md` — component names and descriptions
- `FrontendState.md` — slice names, action names, effect names
- `ClassDiagram.md` — entity names and field names

For each file, search for any of the concept key terms — both literal and semantic. A semantic match is a description that implies the concept even without naming it exactly (e.g. "shortcut buttons at the top of every page" implies toolbar).

Also scan `.old/frontend/src/` and `.old/backend/src/` for the concept — the old app may already have this feature, which tells you what the design should look like.

Record every match with: UC folder, file, approximate location, and the matching text.

---

## Step 4 — Classify each finding

For each match, assign one of four classifications:

**`awareness-br`** — The existing UC *assumes* the target feature exists, or its design would be cleaner if the target feature exposed a specific API/hook. The target UC's suggestion.md should add a BR to formalize this assumption. Examples:
- UC-006 says "users can jump to any tour from the top bar" — this assumes a toolbar navigation API
- UC-008's quick-add button placement implies the toolbar will accept registered actions

**`touch-md`** — The existing UC builds on or extends the concept. A forward dependency: if redesigned with knowledge of the target UC, UC-006 would have integrated with it rather than working around it. No code change needed now; creates a touch.md entry at shift time. Examples:
- UC-006 has a navigation shortcut that logically belongs as a toolbar action
- UC-009 adds a page-level action that would live in the toolbar

**`cr-patch`** (shallow) — The existing UC already has *implemented* code that should integrate with, move to, or be replaced by the target feature. The change is bounded: a component moves, a call is rerouted, a button is relocated. Examples:
- UC-008's floating quick-add button should become a toolbar action registration call
- UC-007's back-navigation arrows duplicate toolbar navigation

**`architecture-conflict`** (deep) — The existing UC independently solved the same problem the target UC is meant to solve. A CR-patch will not cleanly resolve this; it needs `uc-reconcile` or architectural discussion after the target UC is developed. Examples:
- UC-009 introduced its own `NavigationBarComponent` that does what the toolbar does
- UC-010 has its own quick-action state slice that the toolbar would replace

**Filtering rule**: if a mention is purely textual with no design or code implication (e.g. "the toolbar from UC-002 provides auth context"), classify as `touch-md`. Only classify as `cr-patch` or `architecture-conflict` if there is a concrete component, slice, or entity involved.

---

## Step 5 — Derive awareness BRs

For each `awareness-br` finding, write a concrete BR to add to the target suggestion. Rules:
- The BR must be something the target UC *itself* needs to provide (not what the other UC needs to do)
- It should formalize an extension point or API contract implied by the other UC's design
- Do not duplicate any existing BR in the target suggestion
- Do not add scope from other UCs — awareness BRs define contracts, not features

Format: `BR-ENR-NNN: <rule text> _(derived from <UC-ID> — <one phrase explaining the link>)_`

Number them `BR-ENR-001`, `BR-ENR-002`, etc. The `/uc-generate` architects will renumber them correctly.

---

## Step 6 — Write enrich-report.md (draft)

Write `<uc-folder>/enrich-report.md`:

```markdown
---
uc: <UC-ID>
concept: <concept key terms as comma-separated list>
status: draft
generated: <today YYYY-MM-DD>
findings: <total count>
awareness-brs: N
touch-md-entries: N
cr-patches: N
architecture-conflicts: N
---

# Enrich Report — <UC-ID>: <title>

> Review each finding and its classification. Change any classification you disagree with.
> Set frontmatter `status: approved` when ready, then re-run `/uc-enrich $ARGUMENTS`.

## Concept Key Terms

<list of search terms used>

## Findings

### UC-<NNN>: <title> — `<classification>`

**File:** `<file where found>`
**Match:** "<exact or paraphrased matching text>"
**Reasoning:** <one sentence explaining why this classification was chosen>
**Action:** <what will happen when this report is approved>

---

_(repeat for each finding, grouped by UC)_

---

## Proposed Awareness BRs

To be appended to `<uc-folder>/suggestion.md` under a new `## Chain Awareness` section:

| ID | Rule | Source |
|---|---|---|
| BR-ENR-001 | <rule text> | UC-<NNN> — <link> |
| BR-ENR-002 | <rule text> | UC-<NNN> — <link> |

_(If none: "No awareness BRs derived — no existing UC assumes a specific API from this feature.")_

## Touch.md Queue

To be created by `/uc-shift` when this UC is repositioned (or manually, if not shifting):

| Source UC | Direction | Summary |
|---|---|---|
| UC-<NNN> | builds-on | <one line> |

## Pending CR-Patches

To be addressed via `/cr-start` after this UC is developed:

| UC | Severity | What to patch |
|---|---|---|
| UC-<NNN> | shallow | <one line> |

## Architecture Conflicts

Require manual review or `/uc-reconcile` after this UC is developed:

| UC | Conflict description |
|---|---|
| UC-<NNN> | <one line> |

## Old App

<What the old app had for this concept, or "No matching components found in .old/">
```

Tell the user:
- Report is at `<uc-folder>/enrich-report.md` with `status: draft`
- Review each classification — change any you disagree with
- Set `status: approved` then re-run `/uc-enrich $ARGUMENTS` to apply the awareness BRs to the suggestion

Stop here until re-run.

---

## Step 7 — Apply awareness BRs (re-entry after approval)

Read `enrich-report.md`. Confirm `status: approved`.

Read the current `suggestion.md`. Append a new section at the end:

```markdown
## Chain Awareness
<!-- Added by /uc-enrich — these BRs formalize contracts implied by later UCs in the chain -->

| ID | Rule | Source |
|---|---|---|
| BR-ENR-001 | <rule> | UC-NNN |
```

The architects will incorporate these when generating ClassDiagram.md and openapi.yaml. The BR-ENR IDs will be renumbered into the standard BR-NNN sequence during generation.

Update `enrich-report.md` frontmatter: `status: complete`, add `completed: <today>`.

---

## Step 8 — Report to the user

```
## Enrich Complete — <UC-ID>

Awareness BRs added : N  (see ## Chain Awareness in suggestion.md)
Touch.md queue      : N  (will be created by /uc-shift, or run /uc-enrich --apply-touch manually)
Pending CR-patches  : N  (address via /cr-start after this UC is developed)
Architecture conflicts: N  (review manually after this UC is developed)

Next steps:
- Review the updated suggestion.md — confirm the awareness BRs fit the design
- Run /uc-generate $ARGUMENTS to produce architecture artifacts
- If repositioning this UC: run /uc-shift $ARGUMENTS <target-position>
  (the shift will read this enrich-report to create touch.md entries automatically)
```
