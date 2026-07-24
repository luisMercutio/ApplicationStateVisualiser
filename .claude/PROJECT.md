# ClaudeAgentsAsProject — Project Description

> This file is the on-disk copy of the project description. The source of truth is the
> **ClaudeAgentsAsProject** application record in the App State Visualiser store
> (`description` field). Keep the two in sync — when one changes, update the other.

ClaudeAgentsAsProject exists to **generate this repository's Claude Code configuration**
— its agents, hooks, and slash commands — from small, easily understandable, focused
**Business Rules**. Rather than hand-authoring the files under `.claude/`, each behaviour
is captured as a single enforceable BR; the files are the generated artifact of those
rules.

The BRs are deliberately **small**: each states the smallest part of a rule about how an
agent, command, or hook is supposed to act, so that a rule is easy to read, review, and
regenerate from. Rules are grouped into features (Epics): a foundation of cross-cutting
rules that apply to **all** agents, then the per-agent, per-command, and per-hook rules.

This project description is itself part of the contract: it **must always be loaded into
every agent's context before that agent acts** (BR-001), so every generated agent shares
the same understanding of what the project is for.
