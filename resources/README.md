# resources/ — the methodology hub

This folder is the **canonical, editable source of truth** for the Claude Code UC/BR methodology that drives application development. The ApplicationStateVisualiser both *edits* these files (in the frontend) and *visualises* the artifacts they produce in a target project.

```
resources/
├─ agents/     Claude Code sub-agents (backend/frontend architect·developer·tester, contract-validator, br-synthesizer, …)
├─ commands/   Slash commands (/uc-suggest, /uc-generate, /uc-develop, /cr-*, …)
├─ schemas/    JSON Schemas for the structured artifacts the agents emit
└─ CHEATSHEET.md
```

## Using these agents in another project ("project B")

Claude Code only auto-discovers agents/commands from a project's own `.claude/` or from `~/.claude/`. It will **not** load them from an arbitrary sibling repo. So to use these in project B, you either:

- **Sync** them into `B/.claude/agents` + `B/.claude/commands` (see the planned "Push methodology to project B" action), or
- **Symlink** `B/.claude/agents → this repo's resources/agents`, or
- install them user-globally under `~/.claude/`.

Keeping the canonical copy here means the agents stay versioned alongside the tool that visualises what they build.

## Business Rules as first-class data

`/uc-generate` (via the `br-synthesizer` agent) emits a `business-rules.json` in each UC folder, conforming to [`schemas/business-rules.schema.json`](schemas/business-rules.schema.json). Each Business Rule carries its specification, prerequisite `dependsOn` edges (the dependency net), and `touches` anchors that let the viewer cross-highlight the relevant parts of every other view. Node coordinates are stored separately by the viewer in `br-positions.json` so regeneration never overwrites hand-tuned layout.
