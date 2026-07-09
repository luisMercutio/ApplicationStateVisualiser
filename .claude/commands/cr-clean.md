Archive completed change requests: append each CR's record to `past-crs.md`, delete the CR folders, and delete the propagate report.

## What you are doing

After `cr-propagate` has finished (rules are already in agent files), this command archives the evidence, then removes the staging artefacts so the workspace stays clean. The **only** file written is `.claude/architecture/past-crs.md` — you append to it, never overwrite it.

---

## Step 1 — Find a complete propagate report

Glob `.claude/architecture/propagate-report.md`.

- **Does not exist** → stop:
  > No propagate-report.md found. Run `/cr-propagate` first and let it complete.
- **Exists, `status: draft`** → stop:
  > propagate-report.md is still draft. Finish the propagation flow (`/cr-propagate`) before cleaning up.
- **Exists, `status: approved`** → stop:
  > propagate-report.md is approved but not yet applied. Re-run `/cr-propagate` to apply it first.
- **Exists, `status: complete`** → continue.

Read the full propagate-report. Extract:
- `source-crs` list from frontmatter
- The **Summary** table (target file → items added)
- Each target-file section's **Proposed addition** text (the rules that were appended)

---

## Step 2 — Read each source CR

For each CR ID in `source-crs`:

Glob `.claude/architecture/<CR-ID>/cr.md`. If the file is missing, note it as already deleted and skip it — do not stop.

Read the cr.md. Collect:
- `cr-id`, `related-epics`, `stage-attributed-to`, `captured`, `propagated` from frontmatter
- **What changed** section body
- **Root cause** section body
- **Stage attribution** section body

---

## Step 3 — Build the past-crs.md entry for each CR

For each CR, compose this block:

```markdown
---

## <cr-id>

| | |
|---|---|
| **Related Epics** | <related-epics> |
| **Stage attributed to** | <stage-attributed-to> |
| **Captured** | <captured> |
| **Propagated** | <propagated> |

### What changed

<what-changed body>

### Root cause

<root-cause body>

### Stage attribution

<stage-attribution body>

### Rules propagated to

<for each target in the propagate-report Summary table that lists this CR as a source:>
- `<target-file>` — <section name> (<N> item(s))
```

---

## Step 4 — Extend past-crs.md

Glob `.claude/architecture/past-crs.md`.

- **Does not exist** → create it with this header, then append the entries:

```markdown
# Past Change Requests

A running log of all change requests that have been propagated into agent rules.
Entries are append-only — never edited after being written.

```

- **Exists** → open it and append the new entries at the end. Do not modify any existing content.

Write one entry block (from Step 3) per CR, in the order they appear in `source-crs`.

---

## Step 5 — Delete the CR folders

For each CR ID in `source-crs` where the folder `.claude/architecture/<CR-ID>/` exists:

Delete the folder and all its contents.

Use:
```bash
rm -rf .claude/architecture/<CR-ID>/
```

---

## Step 6 — Delete the propagate report

Delete `.claude/architecture/propagate-report.md`.

---

## Step 7 — Commit

```bash
git add .claude/architecture/past-crs.md
git add -u .claude/architecture/
git commit -m "chore(pipeline): archive CRs to past-crs.md and clean workspace [cr-clean]"
```

Include the archived CR IDs in the commit body:
```
Archived: CR-<name1>, CR-<name2>, ...
```

---

## Step 8 — Report to the user

```
## Clean Complete

### Archived to past-crs.md
<list of CR IDs appended>

### Deleted
<list of CR folders removed>
- propagate-report.md

### Next steps
- past-crs.md is the permanent record — the individual CR folders are gone.
- Run /cr-propagate after future CRs accumulate, then /cr-clean to archive them.
```

---

## Hard rules

- Never overwrite or reorder content in `past-crs.md`. Only append.
- Never run Step 5 or Step 6 unless Step 4 completed without error.
- If `past-crs.md` write fails for any reason, stop — do not delete anything.
- Only process CRs listed in the propagate-report's `source-crs`. Never delete a CR folder that is not in that list.
