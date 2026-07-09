Apply learnings from completed change requests back into the Epic pipeline. Usage: `/cr-propagate`

## What you are doing

You are reading all CRs with `status: pending-propagation`, grouping their recommendations by target file, and proposing exact edits to agent `.md` files and the `epic-suggest` command. Because bad rules permanently degrade every future Epic, you never auto-apply — you first produce a `propagate-report.md` for human review, then apply only after explicit approval.

---

## Step 1 — Re-entry detection

Check for `.claude/architecture/propagate-report.md`.

- **Does not exist** → first run. Continue to Step 2.
- **Exists, `status: draft`** → remind the user:
  > `propagate-report.md` is still draft. Review the proposed changes, edit any you disagree with, set frontmatter `status: approved`, then re-run `/cr-propagate` to apply them.
  Stop.
- **Exists, `status: approved`** → re-entry after approval. Skip to Step 6.

---

## Step 2 — Collect pending CRs

Glob `.claude/architecture/CR-*/cr.md`. Read each file.

Collect only those with `status: pending-propagation`. If none found:
> No CRs with status `pending-propagation` found. Nothing to propagate.
Stop.

List the CRs found: id, related-epics, stage-attributed-to.

---

## Step 3 — Group recommendations by target

From each CR's Recommendations section, extract the non-"None" items per target. Group across all CRs:

```
epic-suggest          : [list of checklist questions from all CRs]
backend-architect     : [list of rules from all CRs]
frontend-architect    : [list of rules from all CRs]
backend-developer     : [list of rules from all CRs]
frontend-developer    : [list of rules from all CRs]
backend-tester        : [list of rules from all CRs]
frontend-tester       : [list of rules from all CRs]
```

Deduplicate within each group: if two CRs produced the same or nearly identical recommendation, keep one and note the merge.

---

## Step 4 — Read current target file state

For each group that has at least one item, read the current content of the target file:

| Target | File |
|---|---|
| `epic-suggest` | `.claude/commands/epic-suggest.md` |
| `backend-architect` | `.claude/agents/backend-architect.md` |
| `frontend-architect` | `.claude/agents/frontend-architect.md` |
| `backend-developer` | `.claude/agents/backend-developer.md` |
| `frontend-developer` | `.claude/agents/frontend-developer.md` |
| `backend-tester` | `.claude/agents/backend-tester.md` |
| `frontend-tester` | `.claude/agents/frontend-tester.md` |

For each agent file, locate the existing **`## Hard Rules`** section (or the closest equivalent section at the end of the file).

For `epic-suggest.md`, locate a **`## Past CR Lessons`** section — create it at the end if it does not exist.

---

## Step 5 — Write propagate-report.md

Write `.claude/architecture/propagate-report.md`:

```markdown
---
status: draft
generated: <today YYYY-MM-DD>
source-crs: [CR-<name1>, CR-<name2>, ...]
---

# Propagate Report

> Review each proposed change below. Edit any you disagree with.
> Set frontmatter `status: approved` when ready, then re-run `/cr-propagate`.

## Summary

| Target file | Items to add | Source CRs |
|---|---|---|
| epic-suggest.md | N | CR-xxx, CR-yyy |
| backend-architect.md | N | CR-xxx |
| ... | | |

---

## epic-suggest.md — Past CR Lessons section

**Action:** Add to (or create) the `## Past CR Lessons` section at the end of `.claude/commands/epic-suggest.md`.

**Proposed addition:**
```
## Past CR Lessons

The following questions were derived from change requests. Ask these during the suggestion
session when the Epic touches the relevant domain:

- **Booking / time-range entities:** Ask whether two records for the same entity can overlap
  in time. If yes, specify the conflict-resolution rule as a BR.
  _(source: CR-booking-overlap-guard)_

- **User-facing error messages:** Ask whether each error state has a specified user-facing
  message or if the frontend should derive one from status codes.
  _(source: CR-better-error-messages)_
```

**Conflicts with existing content:** None | <describe any overlap with existing text>

---

## backend-architect.md — Hard Rules additions

**Action:** Append to the `## Hard Rules` section in `.claude/agents/backend-architect.md`.

**Proposed addition:**
```
- When designing any entity that represents a time range (start date + end date or start + duration),
  add a DB-level constraint or unique index that prevents overlapping rows for the same parent entity.
  Document the constraint in ClassDiagram.md as a note on the entity.
  _(source: CR-booking-overlap-guard)_
```

**Conflicts with existing content:** None | <describe any overlap>

---

## <repeat for each target with items>

---

## Discarded (duplicates or contradictions)

| Source CR | Original recommendation | Reason discarded |
|---|---|---|
| CR-xxx | "Always use optimistic locking" | Contradicts existing rule: "Use pessimistic locking for concurrent writes" |
```

---

## Step 6 — Apply changes (re-entry after approval)

Read `.claude/architecture/propagate-report.md`. Confirm `status: approved`. If not, remind the user to set it.

For each target section in the report where action is "Add":

1. Read the current target file.
2. Locate the target section (`## Hard Rules` for agents, `## Past CR Lessons` for epic-suggest).
3. If `## Past CR Lessons` does not exist in `epic-suggest.md`, append it at the very end.
4. Append the proposed text to the section. Preserve all existing content — never remove or reorder existing rules.
5. Write the updated file.

After all edits are applied:

Update each source CR's `cr.md` frontmatter: `status: propagated`, add `propagated: <today YYYY-MM-DD>`.

Update `.claude/architecture/propagate-report.md` frontmatter: `status: complete`, add `completed: <today YYYY-MM-DD>`.

---

## Step 7 — Commit

```bash
git add .claude/agents/ .claude/commands/epic-suggest.md .claude/architecture/
git commit -m "refactor(pipeline): propagate CR learnings to agent rules [cr-propagate]"
```

Include the source CR list in the commit body:
```
Sources: CR-<name1>, CR-<name2>, ...
```

---

## Step 8 — Report to the user

```
## Propagate Complete

### Changes applied
| Target file | Items added |
|---|---|
| epic-suggest.md | N (Past CR Lessons section) |
| backend-architect.md | N (Hard Rules) |
| ... | |

### CRs marked propagated
- CR-<name1>
- CR-<name2>

### Next steps
- Review the updated agent files to confirm the additions read naturally in context.
- The next /epic-generate run will use the updated agent rules automatically.
- Run /cr-propagate again after future CRs accumulate.
```

---

## Hard rules for this command

- Never remove or reorder existing rules in agent files. Only append.
- Never apply changes without a `status: approved` propagate-report.md.
- If a proposed rule directly contradicts an existing rule, list it as a conflict in the report — do not add it. The user must resolve the contradiction manually.
- One propagate-report.md exists at a time. If one exists with `status: complete`, archive it as `propagate-report-<date>.md` before writing a new one.
