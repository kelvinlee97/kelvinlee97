#!/bin/bash
# Claude Code status line. Order: model, effort, dir, git branch.
# Context and rate limits live in the Token Weather band (~/.claude/mods/token-weather).
# Each segment is omitted when its field is missing from the stdin JSON.
input=$(cat)
j() { echo "$input" | jq -r "$1 // empty" 2>/dev/null; }

model=$(j '.model.display_name')
effort=$(j '.effort.level')
dir=$(j '.workspace.current_dir')
[ -n "$dir" ] || dir="$PWD"

DIM=$'\033[2m'; RESET=$'\033[0m'; CYAN=$'\033[1;36m'; MAGENTA=$'\033[1;35m'
RED=$'\033[31m'
SEP="${DIM} │ ${RESET}"

segs=()
[ -n "$model" ] && segs+=("${DIM}${model}${RESET}")
[ -n "$effort" ] && segs+=("${DIM}${effort}${RESET}")

# directory: ~ contraction, last 3 components
d="$dir"; case "$d" in "$HOME") d="~" ;; "$HOME"/*) d="~/${d#"$HOME"/}" ;; esac
IFS='/' read -r -a parts <<< "$d"
n=${#parts[@]}; if [ "$n" -gt 4 ]; then d="…/${parts[n-3]}/${parts[n-2]}/${parts[n-1]}"; fi
segs+=("${CYAN}${d}${RESET}")

# git branch (+ dirty marker), skipping optional locks
if git -C "$dir" --no-optional-locks rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  branch=$(git -C "$dir" --no-optional-locks branch --show-current 2>/dev/null)
  [ -z "$branch" ] && branch=$(git -C "$dir" --no-optional-locks rev-parse --short HEAD 2>/dev/null)
  if [ -n "$branch" ]; then
    dirty=""
    [ -n "$(git -C "$dir" --no-optional-locks status --porcelain 2>/dev/null)" ] && dirty="${RED} [!]${RESET}"
    segs+=("${MAGENTA} ${branch}${RESET}${dirty}")
  fi
fi

out=""
for s in "${segs[@]}"; do out="${out:+${out}${SEP}}${s}"; done
printf '%s\n' "$out"
exit 0
