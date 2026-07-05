# Command Cheat Sheet

Quick reference for all UC pipeline and change-request commands.

---

## Normal UC flow

The standard path for designing and implementing a new use case.

```
/uc-suggest UC-011
  → creates .claude/architecture/011-<slug>/suggestion.md (Draft)
  → edit frontmatter: status: Approved

/uc-generate UC-011
  → runs backend-architect + frontend-architect + contract-validator
  → produces ClassDiagram.md, openapi.yaml, FrontendState.md, testState.md, etc.
  → review artifacts

/uc-develop
  → implements all Approved UCs in sequence (backend + frontend + test)
```

---

## New UC designed for an earlier slot (enrich + shift)

Use when you realize a foundational feature should be UC-002, not UC-011.

```
/uc-suggest UC-011 UC-001
  → designs the new UC anchored at UC-001 baseline
  → suggestion.md carries: baseline: UC-001
  → edit frontmatter: status: Approved

/uc-enrich UC-011
  → scans UC-002 through UC-010 for concept mentions
  → classifies findings: awareness-br / touch-md / cr-patch / architecture-conflict
  → proposes BRs to add to suggestion.md
  → writes draft enrich-report.md → review → set status: approved → re-run
  → appends ## Chain Awareness to suggestion.md

/uc-generate UC-011
  → generates architecture against UC-001 baseline (reads baseline: field)

/uc-shift UC-011 2
  → renames folders highest-to-lowest: 010→011 ... 002→003, 011→002
  → updates frontmatter, diff headers, usecases.md, touch.md subfolders
  → creates touch.md entries from enrich-report
  → asks: relabel diffs only OR full diff regeneration?
  → writes draft shift-plan.md → review → set status: approved → re-run

/uc-develop
  → implement the newly positioned UC-002 (and any others that are Approved)

(later, after UC-002 is Done)
/cr-start <name>        → for each cr-patch the enrich-report flagged
```

---

## Insert a UC mid-chain without renumbering (letter suffix)

Use when a small UC needs to go between two existing UCs without disturbing numbering.

```
/uc-insert UC-003b
  → guided suggestion session anchored at UC-003
  → writes suggestion.md (Draft) → set status: Approved → re-run
  → generates architecture, runs contract validator
  → impact analysis on downstream Approved UCs
  → optionally regenerates affected downstream UCs
  → adds UC-003b row to usecases.md
```

---

## Insert a retroactive spec (code already exists, spec chain needs it)

Use when code was written before the spec, and you need the chain to reflect it logically.

```
/uc-retrospec UC-003b
  → guided suggestion session
  → writes retrospec suggestion.md (Retroactive — never developed in current env)
  → generates full architecture artifacts
  → creates Bridge UC (e.g. UC-011) to apply delta to running codebase
  → optionally regenerates downstream diff files

  Review bridge UC suggestion, set status: Approved
/uc-generate UC-011     → generates bridge architecture
/uc-develop             → develops the bridge UC (idempotent in fresh-regen context)
```

---

## Patch a Done UC (small, no schema/API change)

Use for business-rule tweaks, new validations, UI copy, minor field additions.

```
/uc-patch UC-005
  → guided session: what changed, affected BRs, affected components
  → escalates to /uc-suggest if schema or API changes are needed
  → writes patch-suggestion.md (Draft) → set status: Approved → re-run
  → spawns developer agents, tester agents, one fix round if needed
  → commits with fix(UC-005): <title> [P1]
```

---

## Reconcile spec vs implementation (after Needs Human Review)

Use after /uc-develop produces Needs Human Review, or after a post-implementation audit.

```
/uc-reconcile UC-005
  → spawns backend-architect + frontend-architect scan (parallel)
  → classifies divergences: FIX_SPEC / FIX_CODE / NEEDS_PATCH / ACCEPTED
  → writes draft reconcile-report.md → review, reclassify → set status: approved → re-run
  → applies FIX_SPEC edits to ClassDiagram.md / FrontendState.md / testState.md
  → surfaces FIX_CODE items with pre-filled /uc-patch guidance
  → commits
```

---

## Analyze prep opportunities for a UC

Use after several UCs are done to understand what UC-001 could have designed differently.

```
/uc-prep UC-001
  → reads all architecture/*/001/touch.md files (created by /uc-generate)
  → filters to actionable items (no loose ends)
  → writes prep-report.md with concrete architect instructions

/uc-prep
  → runs the above for all UCs that have at least one touch.md entry
```

---

## Change request flow

Use when testing reveals a bug or gap that needs a scoped fix.

```
/cr-start fix-calendar-crash
  → creates branch cr/fix-calendar-crash
  → creates worktree at <git-root>/cr-fix-calendar-crash
  → writes stub .claude/architecture/CR-fix-calendar-crash/cr.md

  (work on the fix in the worktree)

/cr-capture fix-calendar-crash
  → reads git diff main...cr/fix-calendar-crash
  → maps changed files to owning UC domain
  → root-cause analysis + stage attribution (suggestion/architecture/implementation/testing)
  → writes targeted recommendations for each agent and uc-suggest
  → writes completed cr.md with status: pending-propagation

  (merge cr/fix-calendar-crash → main)

/cr-propagate
  → collects all CRs with status: pending-propagation
  → groups recommendations by target file
  → writes draft propagate-report.md → review → set status: approved → re-run
  → appends rules to agent Hard Rules sections and uc-suggest Past CR Lessons
  → marks CRs as propagated, commits

/cr-clean
  → requires propagate-report.md with status: complete
  → appends each CR's full record to past-crs.md (append-only, never overwrites)
  → deletes all CR-* folders listed in the report
  → deletes propagate-report.md
  → commits
```

---

## Command quick-reference

| Command | Purpose | Two-pass? |
|---|---|---|
| `/uc-suggest <UC>` | Create or revise a suggestion | No |
| `/uc-suggest <UC> <baseline-UC>` | Suggest with non-adjacent baseline | No |
| `/uc-generate <UC>` | Generate all architecture artifacts | No |
| `/uc-develop` | Implement all Approved UCs | No |
| `/uc-enrich <UC>` | Scan chain for concept mentions; enrich suggestion | Yes |
| `/uc-shift <UC> <position>` | Reposition UC + renumber chain | Yes |
| `/uc-insert <UC-NNNx>` | Insert mid-chain with letter suffix | Yes |
| `/uc-retrospec <UC-NNNx>` | Insert retroactive spec + bridge UC | Yes |
| `/uc-patch <UC>` | Small patch to a Done UC | Yes |
| `/uc-reconcile <UC>` | Reconcile spec vs implementation | Yes |
| `/uc-prep [UC]` | Analyze prep opportunities from touch.md entries | No |
| `/cr-start <name>` | Create CR branch, worktree, and stub | No |
| `/cr-capture [name]` | Analyze diff and write full CR analysis | No |
| `/cr-propagate` | Apply CR learnings to agent and suggest files | Yes |
| `/cr-clean` | Archive propagated CRs to past-crs.md and delete staging artefacts | No |

---

## Key concepts

**Two-pass commands** — produce a draft report, stop. You review and set `status: approved`, then re-run. Nothing destructive happens before approval.

**Cumulative files** — `ClassDiagram.md`, `openapi.yaml`, `FrontendState.md`, `selectors.yaml` always show the full state at the end of that UC. Never manually edited by shift or insert commands.

**Diff files** — `ClassDiagramDiff.md`, `openapiDiff.md`, etc. show only the delta. Regenerated or relabeled by shift/insert/retrospec commands.

**touch.md** — created by `/uc-generate` when a UC modifies a previous UC's domain. Lives at `<current-UC-folder>/<owner-UC-number>/touch.md`. Used by `/uc-prep` and `/uc-shift`.

**enrich-report.md** — output of `/uc-enrich`. Classifies cross-UC concept findings into awareness-brs, touch-md entries, cr-patches, and architecture-conflicts. Read by `/uc-shift` to pre-populate touch.md entries.

**prep-report.md** — output of `/uc-prep`. Lists actionable design decisions for a UC's next regeneration — no loose ends, structural improvements only.

**CR → propagate → clean loop** — change requests accumulate in `.claude/architecture/CR-*/`. Run `/cr-propagate` periodically (every 3–5 CRs) to distill learnings into agent rules, then `/cr-clean` to archive and remove staging artefacts.

**past-crs.md** — permanent append-only log at `.claude/architecture/past-crs.md`. Written by `/cr-clean`. Contains the full record of every archived CR: what changed, root cause, stage attribution, and which agent files received rules. Never edited after an entry is written.

**Folder naming** — `NNN-slug` (e.g. `002-toolbar`, `010-availability-calendar`). Commands resolve folders by globbing `NNN-*/`, with fallback to legacy `UC-NNN` format.
