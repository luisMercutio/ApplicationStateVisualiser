Reposition a UC to an earlier slot in the chain, renumbering all UCs between the target position and the source. Usage: `/uc-shift UC-011 2`

## What you are doing

You are moving a UC from its current position (e.g. UC-011) to an earlier position (e.g. UC-002), shifting every UC in between up by one. This is a documentation-only operation — source code is organized by feature name, not UC number, so no source files change. All architecture folder names, frontmatter, diff headers, usecases.md, and touch.md subfolders are updated.

**Preconditions before running this command:**
- The source UC has an Approved suggestion.md
- The source UC has generated architecture artifacts (ClassDiagram.md, openapi.yaml exist)
- Recommended: run `/uc-enrich $SOURCE-UC` first so touch.md entries are created from that analysis

---

## Step 0 — Parse arguments

$ARGUMENTS format: `<source-UC> <target-position>`
Examples: `UC-011 2`, `UC-011 002`, `011 2`

- **Source UC**: normalize to 3-digit number (e.g. `011`)
- **Target position**: normalize to 3-digit number (e.g. `002`)

If either is missing or malformed: abort with usage message.

Validate: source number must be greater than target number. If not: abort — "Target position must be earlier than the source UC. To move a UC forward, resequence manually."

---

## Step 1 — Re-entry detection

Check for `.claude/architecture/<source-folder>/shift-plan.md`:
- **Does not exist** → first run. Continue to Step 2.
- **Exists, `status: draft`** → remind the user:
  > `shift-plan.md` exists as draft. Review it, set `status: approved`, then re-run `/uc-shift $ARGUMENTS` to execute.
  Stop.
- **Exists, `status: approved`** → re-entry after approval. Skip to Step 5.

---

## Step 2 — Resolve all affected folders

Locate the source UC folder using the standard glob: `.claude/architecture/${source-number}-*/`, fallback legacy.

Collect all UC folders that will be renumbered — every UC with number N where `target-position ≤ N < source-number`:
- For each N in that range: glob `.claude/architecture/${N}-*/` or legacy fallback
- If any folder is not found: abort — "UC-${N} folder not found. Cannot shift without a complete chain."

Build the rename map (old-number → new-number):
- Each UC in range shifts up by 1: N → N+1
- Source UC moves down to target: source-number → target-position

Check whether any UC in the range has status `In Development`, `Testing`, or `Fixing Deprecations` in usecases.md. If any do: warn the user:
> UC-${N} is currently `${status}`. Renaming its folder while development is active may break agent paths. Proceed with caution — confirm to continue.

---

## Step 3 — Check for touch.md subfolder impacts

Scan all UC folders for touch.md subdirectories whose names fall in the renumbered range.

For example: if UC-006 has a `006-xxx/003/touch.md` and UC-003 is being renumbered to UC-004, that subfolder must become `004/`.

Build a list of all touch.md subfolders that need renaming as part of the shift.

---

## Step 4 — Write shift-plan.md and ask for confirmation

Write `<source-folder>/shift-plan.md`:

```markdown
---
source-uc: <source-number>
target-position: <target-position>
status: draft
created: <today YYYY-MM-DD>
---

# Shift Plan — UC-<source-number> → UC-<target-position>

## Rename Map

| Old folder | New folder | Status in chain |
|---|---|---|
| <old-NNN-slug> | <new-NNN-slug> | Done / Approved / etc. |
| ... | ... | ... |
| <source-folder> | <target-NNN-slug> | Approved (source) |

## Touch.md Subfolder Renames

| File | Old subfolder | New subfolder |
|---|---|---|
| <UC-folder>/touch.md parent | 003/ | 004/ |

## Diff treatment

[ ] Relabel headers only — update "UC-003 → UC-004" labels in diff files. Fast. Correct when
    the source UC introduces only new domain with no overlap with shifted UCs.
[ ] Full diff regeneration — re-run architects in diff-only mode for all shifted UCs. Slow but
    accurate if the source UC's baseline changes are meaningful to the shifted UCs' diffs.

## Enrich report

<If enrich-report.md exists and is complete:>
Touch.md entries from enrich-report: N entries queued
<If not:>
No enrich-report found — a lightweight scan will run during shift to find touch.md candidates.
```

Ask the user:
1. Which diff treatment do they want? (relabel / regenerate)
2. Confirm the rename map looks correct.

Tell them: set `status: approved` in shift-plan.md and re-run `/uc-shift $ARGUMENTS` to execute.

Stop until re-run.

---

## Step 5 — Execute the rename (re-entry after approval)

Read `shift-plan.md`. Confirm `status: approved`. Read the chosen diff treatment.

### 5a — Rename folders in reverse order

Process the rename map from **highest old-number to lowest** to avoid folder name collisions:

For each (old-folder → new-folder) pair, in descending old-number order:
1. Rename the folder: `mv old-folder new-folder` (or PowerShell equivalent: `Rename-Item`)
2. Inside the renamed folder, update `suggestion.md` frontmatter:
   - `uc:` field: update to new UC ID (e.g. `UC-006` → `UC-007`)
   - If `baseline:` field exists: the UC number it references does not change (the baseline UC is either below the shift range or is the source itself)
3. Update diff file headers: in `ClassDiagramDiff.md`, `openapiDiff.md`, `FrontendStateDiff.md`, `selectorsDiff.md`, `mockupsDiff.md`, `testStateDiff.md` — find and replace the old "prev-UC → this-UC" label with the new numbers.
4. Update `contract-validation.json`: replace `ucId` value with new UC ID.
5. Rename any touch.md subfolders inside this folder per the touch.md subfolder rename list from Step 3. Also update the `touching-uc` and `touched-uc` frontmatter fields inside each touch.md file.

After all renames complete, verify each expected new folder exists before proceeding.

### 5b — Update usecases.md

Read `.claude/architecture/usecases.md`. Update every UC ID in the table that falls in the renumbered range. Preserve all other fields (title, status, updated date). Reorder rows if needed to maintain numeric order. Write the file.

---

## Step 6 — Create touch.md entries

**If enrich-report.md exists and is complete:**
Read the `## Touch.md Queue` section. For each entry, create the touch.md file at `<shifted-uc-folder>/<target-position>/touch.md` using the standard touch.md format from uc-generate Step 5.5c. Use the source UC's title and the shifted UC's title from their suggestion.md files.

**If no enrich-report exists:**
Run a lightweight concept scan: read the source UC's suggestion.md to extract key terms (same as uc-enrich Step 2). Scan all shifted UC suggestion.md and ComponentInventory.md files for matches. For each meaningful match, create a `touch-md` classified entry and write a touch.md file. Do not create awareness-br or cr-patch entries — those require the fuller enrich-report analysis.

---

## Step 7 — Diff treatment

Read the chosen diff treatment from shift-plan.md.

### Relabel only

For each shifted UC, the diff files already have correct content — the delta each UC introduces hasn't changed. Only the predecessor label is wrong. Update the heading in each diff file:

- In `ClassDiagramDiff.md`: find line like `# Class Diagram Diff — UC-003 → UC-004` and replace with new numbers.
- Same for `openapiDiff.md`, `FrontendStateDiff.md`, `selectorsDiff.md`, `mockupsDiff.md`, `testStateDiff.md`.

### Full diff regeneration

For each shifted UC in ascending new-number order, spawn both architect agents in diff-only mode (same as uc-retrospec Step 9 pattern):

**backend-architect prompt:**
```
Diff-only regeneration for <new-UC-ID> (shifted from <old-UC-ID>).

The cumulative state is CORRECT — do NOT change ClassDiagram.md or openapi.yaml.
Only regenerate the diff files to reflect the new predecessor.

New previous ClassDiagram : .claude/architecture/<new-prev-folder>/ClassDiagram.md
New previous openapi      : .claude/architecture/<new-prev-folder>/openapi.yaml
Current ClassDiagram      : .claude/architecture/<new-UC-folder>/ClassDiagram.md  [READ ONLY]
Current openapi           : .claude/architecture/<new-UC-folder>/openapi.yaml     [READ ONLY]

Output to: .claude/architecture/<new-UC-folder>/
Produce ONLY: ClassDiagramDiff.md, openapiDiff.md
```

**frontend-architect prompt:**
```
Diff-only regeneration for <new-UC-ID> (shifted from <old-UC-ID>).

The cumulative state is CORRECT — do NOT change FrontendState.md or selectors.yaml.

New previous FrontendState : .claude/architecture/<new-prev-folder>/FrontendState.md
New previous selectors     : .claude/architecture/<new-prev-folder>/selectors.yaml
Current FrontendState      : .claude/architecture/<new-UC-folder>/FrontendState.md  [READ ONLY]
Current selectors          : .claude/architecture/<new-UC-folder>/selectors.yaml    [READ ONLY]

Output to: .claude/architecture/<new-UC-folder>/
Produce ONLY: FrontendStateDiff.md, selectorsDiff.md, mockupsDiff.md
```

Spawn both in parallel. Wait for completion before proceeding to the next UC in the chain.
The predecessor for each UC is the just-processed previous UC.

---

## Step 8 — Update shift-plan.md and commit

Update `shift-plan.md` frontmatter: `status: complete`, add `completed: <today YYYY-MM-DD>`.

Stage all changed files:
```bash
git add .claude/architecture/
git commit -m "refactor(chain): shift UC-<source-number> to position <target-position> [uc-shift]"
```

Include in the commit body:
```
Renamed: <old-002> → <new-003>, <old-003> → <new-004>, ..., <source> → <new-002>
Touch.md entries created: N
Diff treatment: relabel | regeneration
```

---

## Step 9 — Report to the user

```
## Shift Complete — UC-<source-number> → UC-<target-position>

### Folders renamed
<list: old-name → new-name, one per line>

### Touch.md entries created
<list: <shifted-uc-folder>/<target-position>/touch.md — <one-line summary>>
<or "None created — no enrich-report and no concept matches found">

### Diff treatment
Relabel only | Full regeneration for N UCs

### Pending actions from enrich report
<If enrich-report had cr-patch entries:>
CR-patches to create after toolbar is developed:
  - UC-<NNN> (<new-number>): <what to patch> → run /cr-start <name>

<If enrich-report had architecture-conflict entries:>
Architecture conflicts to reconcile after toolbar is developed:
  - UC-<NNN> (<new-number>): <conflict> → run /uc-reconcile <new-UC-ID>

### Next steps
1. Run /uc-generate <new-target-UC-ID> if you haven't already
   (or it's already done — the architecture was generated against UC-001 baseline)
2. Run /uc-develop <new-target-UC-ID> when ready to implement the toolbar
3. Address CR-patches and architecture conflicts after the toolbar is in place
```

---

## Hard rules

- Folders are always renamed **highest to lowest** to prevent collision.
- Cumulative files (`ClassDiagram.md`, `openapi.yaml`, `FrontendState.md`, `selectors.yaml`) are **never modified** — only diff files and labels change.
- The `suggestion.md` `baseline:` field is never changed by this command — it remains whatever was set at suggestion time.
- If any rename step fails, stop immediately and report the failure with the current state of the chain. Do not attempt to continue partial renames.
