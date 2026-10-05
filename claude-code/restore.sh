#!/usr/bin/env bash
# Restore this repo's Claude Code setup into ~/.claude on a new machine.
# Each existing target is moved to <target>.bak-<timestamp> before it is replaced.
set -euo pipefail

REPO="$(cd "$(dirname "$0")" && pwd)"
C="$REPO/config"
DST="$HOME/.claude"
TS="$(date +%Y%m%d-%H%M%S)"

put() { # put <src> <dst>
  local src="$1" dst="$2"
  mkdir -p "$(dirname "$dst")"
  if [ -e "$dst" ] || [ -L "$dst" ]; then mv "$dst" "$dst.bak-$TS"; fi
  cp -R "$src" "$dst"
  echo "restored $dst"
}

for f in CLAUDE.md settings.json settings.local.json statusline-command.sh github-mcp-headers.sh; do
  [ -f "$C/$f" ] && put "$C/$f" "$DST/$f"
done
chmod +x "$DST/statusline-command.sh" "$DST/github-mcp-headers.sh" 2>/dev/null || true

shopt -s nullglob
for f in "$C"/output-styles/*.md; do put "$f" "$DST/output-styles/$(basename "$f")"; done
for d in "$C"/skills/*/;  do put "${d%/}" "$DST/skills/$(basename "$d")"; done
for d in "$C"/mods/*/;    do put "${d%/}" "$DST/mods/$(basename "$d")"; done

cat <<EOF

Manual steps (Claude Code manages these files, so this script does not write them):

1. Plugins - run inside Claude Code:
EOF
python3 - "$C/plugins/known_marketplaces.json" "$C/plugins/installed_plugins.json" <<'PY'
import json, sys
mk = json.load(open(sys.argv[1]))
for name, v in mk.items():
    s = v["source"]
    src = s.get("repo") or s.get("path")
    print(f"   /plugin marketplace add {src}    # {name}")
for p in json.load(open(sys.argv[2]))["plugins"]:
    print(f"   /plugin install {p}")
PY
cat <<EOF

2. MCP servers - merge the "user" block of config/mcp-servers.json into the
   "mcpServers" key of ~/.claude.json (and each "projects" entry into
   projects["<path>"].mcpServers). Then run: claude mcp list

3. Absolute paths: settings.json and mcp-servers.json use /Users/kelvin/...
   Edit them if your home directory differs.
EOF
