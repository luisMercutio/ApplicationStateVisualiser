#!/usr/bin/env bash
# Mirror this session's live conversation transcript into ONE central store in the
# main working tree, even when the session runs in a linked worktree (e.g. a per-BR
# "Submit with Claude" session). Fired by the Stop and SessionEnd hooks.
#
# Reads the hook payload (JSON on stdin), extracts transcript_path, and copies it to
#   <main-repo>/.claude/conversations/<prefix>__<session-uuid>.jsonl
# where <prefix> is this working tree's basename — the BR slug for a worktree, or
# the repo name for the main tree. The prefix lets the server map a session
# (claude-<slug>) back to its transcript(s); the copy lands on the Windows fs so the
# (Windows) server can read it directly.
set -euo pipefail

input="$(cat)"
tp="$(printf '%s' "$input" | jq -r '.transcript_path // empty')"
[ -z "$tp" ] && exit 0
[ -f "$tp" ] || exit 0

proj="${CLAUDE_PROJECT_DIR:-$PWD}"

# The central store lives in the MAIN working tree. --git-common-dir points at the
# shared .git (the main repo's), whose parent is the main working tree.
common="$(git -C "$proj" rev-parse --path-format=absolute --git-common-dir 2>/dev/null || true)"
case "$common" in
  /*|[A-Za-z]:*) main="$(dirname "$common")" ;;   # absolute → parent of .git
  *)             main="$proj" ;;                    # unavailable → this tree
esac

prefix="$(basename "$proj")"
dir="$main/.claude/conversations"
mkdir -p "$dir"
cp "$tp" "$dir/${prefix}__$(basename "$tp")"
exit 0
