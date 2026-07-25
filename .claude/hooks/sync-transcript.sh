#!/usr/bin/env bash
# Mirror this session's live conversation transcript into ONE central store in the
# main working tree, even when the session runs in a linked worktree (e.g. a per-BR
# "Submit with Claude" session). Fired by the Stop and SessionEnd hooks.
#
# Reads the hook payload (JSON on stdin), extracts transcript_path, and copies it to
#   <main-repo>/.claude/conversations/<prefix>__<session-uuid>.jsonl
# where <prefix> is this working tree's basename — the BR slug for a worktree, or
# the repo name for the main tree. The prefix lets the server map a session back to
# its transcript(s); the copy lands on the Windows fs so the (Windows) server reads
# it directly. The stored filename's UUID is the session id (claude --resume <uuid>).
#
# NOTE: this runs under `shell: bash`, which on Windows is git-bash — where `jq` is
# NOT installed and paths from a Windows-native claude arrive as `C:\...`. So we
# extract the field WITHOUT jq (node → python → sed fallback) and normalise any
# Windows path to a local one (cygpath/wslpath) before copying. Getting either of
# these wrong silently produced an EMPTY .claude/conversations/ — the whole reason
# the Sessions tab showed nothing. Keep it dependency-light and path-agnostic.
set -uo pipefail

input="$(cat)"

# Extract a top-level JSON string field without jq. node is always on PATH (claude
# itself is a node app); python and a sed unescape are belt-and-suspenders fallbacks.
json_field() {
  local field="$1"
  if command -v node >/dev/null 2>&1; then
    printf '%s' "$input" | node -e '
      let s=""; const f=process.argv[1];
      process.stdin.on("data",d=>s+=d).on("end",()=>{
        try { process.stdout.write(String(JSON.parse(s)[f] ?? "")); } catch (e) {}
      });' "$field"
  elif command -v python3 >/dev/null 2>&1; then
    printf '%s' "$input" | python3 -c 'import sys,json;
d=json.load(sys.stdin); sys.stdout.write(str(d.get(sys.argv[1],"")))' "$field"
  else
    # Last resort: pull the raw string and unescape \\ and \".
    printf '%s' "$input" \
      | sed -n "s/.*\"$field\"[[:space:]]*:[[:space:]]*\"\\([^\"]*\\)\".*/\\1/p" \
      | sed 's/\\\\/\\/g; s/\\"/"/g'
  fi
}

# Turn a possibly-Windows path (C:\… or C:/…) into a local path cp/test can use.
to_local() {
  case "$1" in
    [A-Za-z]:\\*|[A-Za-z]:/*)
      if command -v cygpath >/dev/null 2>&1; then cygpath -u "$1"
      elif command -v wslpath >/dev/null 2>&1; then wslpath -u "$1"
      else printf '%s' "$1"; fi ;;
    *) printf '%s' "$1" ;;
  esac
}

tp_raw="$(json_field transcript_path)"
[ -z "$tp_raw" ] && exit 0
tp="$(to_local "$tp_raw")"
[ -f "$tp" ] || exit 0

proj_raw="${CLAUDE_PROJECT_DIR:-$PWD}"
proj="$(to_local "$proj_raw")"

# The central store lives in the MAIN working tree. --git-common-dir points at the
# shared .git (the main repo's), whose parent is the main working tree.
common="$(git -C "$proj" rev-parse --path-format=absolute --git-common-dir 2>/dev/null || true)"
common="$(to_local "$common")"
case "$common" in
  /*|[A-Za-z]:*) main="$(dirname "$common")" ;;   # absolute → parent of .git
  *)             main="$proj" ;;                    # unavailable → this tree
esac

prefix="$(basename "$proj")"
dir="$main/.claude/conversations"
mkdir -p "$dir"
cp "$tp" "$dir/${prefix}__$(basename "$tp")"
exit 0
