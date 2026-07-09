# Epic / Business-Rule Methodology — conventions (authoritative)

This project's spec pipeline is organised around **Epics** and **Business Rules (BRs)**,
not Use Cases. This file is the single source of truth for the terminology, the
size heuristic that decides Epic-vs-BR, and the command names. Every agent and
command file must follow it.

## Core model

- A **Business Rule (BR)** is the **atomic unit** of specification and work. One BR
  is one enforceable statement the application must satisfy, testable on its own.
- An **Epic** groups a cohesive set of Business Rules that together deliver one
  capability. An Epic owns a folder `.claude/architecture/<NNN>-<slug>/` and its
  cumulative artifacts (schema, API, store, selectors, mockups, tests).
- The **epic chain** is tracked in `.claude/architecture/epics.md` (`EPIC-001 … EPIC-NNN`,
  each with a status). This replaces the old `usecases.md`.
- Business Rules are identified `BR-###` and live in each Epic's `business-rules.json`
  (schema `.claude/schemas/business-rules.schema.json`), whose root carries `epic`
  (e.g. `EPIC-009`) and whose rules carry `epic` + `seq` + `dependsOn` + `touches`.

## Terminology mapping (apply everywhere)

| Old (Use Case) | New (Epic) |
|---|---|
| Use Case / UC | Epic |
| `UC-NNN` | `EPIC-NNN` |
| `usecases.md` | `epics.md` |
| "the UC" (a unit of work) | "the Epic" |
| `business-rules.json` field `uc` | `epic` |
| `business-rules.json` field `relatedUc` | `relatedEpic` |
| a UC's folder | an Epic's folder (path shape unchanged: `<NNN>-<slug>/`) |

The **atomic unit shifts from the Use Case to the Business Rule**: an Epic is now
explicitly a *container of BRs*, and small changes are expressed as a **single BR**
added to an existing Epic rather than a whole new unit.

## The size heuristic — Epic (large) vs single BR (small)

Creation commands **classify the change by size first**, then branch:

**Create a new EPIC (large path)** when the change:
- introduces a new cohesive capability, AND
- needs **new scaffolding** — a new entity/table, a new endpoint group, a new NgRx
  slice, or a new route/page — OR
- decomposes into **≥ 3 Business Rules**, OR
- has cross-cutting UI (a new view/panel) or a new external integration.

**Add a single BUSINESS RULE (small path)** when the change:
- fits inside an **existing Epic**, AND
- introduces **no new** entity/table/endpoint-group/slice/route, AND
- is expressible as **1 (occasionally 2)** enforceable BR(s) — e.g. a new validation,
  a workflow tweak, a UI-copy or routing rule, a permission refinement.

If a "small" change starts to require new scaffolding or spills past two BRs,
**escalate to the Epic path**. When genuinely on the fence, prefer the BR path and
let it escalate — a BR is cheap to promote, an Epic is expensive to unwind.

## Command names (skills)

The pipeline commands are named `epic-*` and `br-*`. The old `uc-*` names are kept
as **thin shim files** that forward to the new command, so existing invocations and
muscle memory keep working.

| New command | Was | Role |
|---|---|---|
| `/epic-suggest <EPIC> [baseline]` | `uc-suggest` | Guided suggestion. **Classifies size first** and recommends the Epic path or the single-BR path. |
| `/epic-generate <EPIC>` | `uc-generate` | Large path: generate all architecture artifacts + `business-rules.json` for an Epic. |
| `/br-add <EPIC>` | *(new)* | Small path: add one Business Rule to an existing Epic (append to `business-rules.json`, minimal artifact touch). |
| `/epic-develop` | `uc-develop` | Implement every Approved Epic (backend + frontend + tests). |
| `/epic-enrich <EPIC>` | `uc-enrich` | Chain-awareness scan + append. |
| `/epic-shift <EPIC> <pos>` | `uc-shift` | Reposition an Epic in the chain. |
| `/epic-insert <EPIC-NNNx>` | `uc-insert` | Insert an Epic mid-chain. |
| `/epic-retrospec <EPIC-NNNx>` | `uc-retrospec` | Retroactive spec for existing code + bridge Epic. |
| `/epic-patch <EPIC>` | `uc-patch` | Small change to a Done Epic. Prefer `/br-add` when it is purely a new rule. |
| `/epic-reconcile <EPIC>` | `uc-reconcile` | Diff spec vs implementation, apply spec fixes. |
| `/epic-prep [EPIC]` | `uc-prep` | Cross-Epic preparation opportunities (read-mostly). |
| `/epic-status [EPIC]` | `uc-status` | Read-only status of the chain / one Epic. |
| `/epic-cleanup <EPIC>` | `uc-cleanup` | Merge an Epic's branch, remove its worktree + branch. |

Unchanged command families (content updated to Epic/BR terms, names kept):
`cr-start`, `cr-capture`, `cr-propagate`, `cr-clean` (Change Request loop);
`queue-add`, `queue-refine`, `queue-plan`, `queue-run`, `queue-judge` (Work Queue);
`flows` (workflow guide).

## Shim file shape

Each old `uc-*.md` becomes a one-line-purpose shim whose body is:

> This command was renamed. **Use `/epic-<x>` instead** — it does exactly what
> `/uc-<x>` used to do, in the Epic/BR methodology. Read `.claude/commands/epic-<x>.md`
> and follow it with the same `$ARGUMENTS`.

Keep the shim's first line (the skill description) short and mention the rename.

## Storage note (for agents that mention where BRs live)

Business Rules and Epics are also persisted per-application in each registered
application's **own database** (`epics` + `business_rules` tables); the master store
holds only the connection registry and the methodology files. The file-based
`business-rules.json` remains the spec artifact the pipeline generates; the database
is the running application's live copy that the visualiser reads/edits per active
connection. Keep both in mind but do not conflate them.
