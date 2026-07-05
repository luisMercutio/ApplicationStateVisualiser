# .claude/ — the methodology hub

This directory is the **canonical, editable source of truth** for the Claude Code UC/BR methodology that drives application development. It lives in `.claude/` so Claude Code auto-discovers the agents and commands, **and** the ApplicationStateVisualiser serves these exact files (the "Agents & Commands" panel edits them directly — no copies, no build step).

```
.claude/
├─ agents/       Claude Code sub-agents (backend/frontend architect·developer·tester, contract-validator, br-synthesizer, …)
├─ commands/     Slash commands (/uc-suggest, /uc-generate, /uc-develop, /cr-*, /queue-*, /flows)
├─ schemas/      JSON Schemas for the structured artifacts the agents emit
├─ scripts/      Utility scripts (backfill-business-rules.mjs)
├─ CHEATSHEET.md
└─ settings.local.json   (Claude Code local settings — not part of the methodology)
```

## Using these agents in another project ("project B")

Claude Code only auto-discovers agents/commands from a project's own `.claude/` or from `~/.claude/`. It will **not** load them from an arbitrary sibling repo. So to use these in project B, you either:

- **Sync** them into `B/.claude/agents` + `B/.claude/commands` — the "Agents & Commands" panel's sync button, or `POST /api/sync-methodology`, or
- **Symlink** `B/.claude/agents → this repo's .claude/agents`, or
- install them user-globally under `~/.claude/`.

Keeping the canonical copy here means the agents stay versioned alongside the tool that visualises what they build.

## Business Rules as first-class data

`/uc-generate` (via the `br-synthesizer` agent) emits a `business-rules.json` in each UC folder, conforming to [`schemas/business-rules.schema.json`](schemas/business-rules.schema.json). Each Business Rule carries its specification, prerequisite `dependsOn` edges (the dependency net), and `touches` anchors that let the viewer cross-highlight the relevant parts of every other view. Node coordinates are stored separately by the viewer in `br-positions.json` so regeneration never overwrites hand-tuned layout.
