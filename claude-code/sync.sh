#!/usr/bin/env bash
# Copy the live Claude Code setup (~/.claude) into this repo.
# Run it, review `git diff`, then commit. It never writes to ~/.claude.
# This repo is public: auto memory and EXCLUDE_SKILLS are never copied.
set -euo pipefail

REPO="$(cd "$(dirname "$0")" && pwd)"
SRC="$HOME/.claude"
C="$REPO/config"

# synced: managed by claude.ai. weread-skills: third-party, no license.
EXCLUDE_SKILLS="synced weread-skills"

# Start each sync from a clean tree so deleted items also disappear here.
rm -rf "$C"
mkdir -p "$C/output-styles" "$C/skills" "$C/mods" "$C/plugins"

# Core files
for f in CLAUDE.md settings.json settings.local.json statusline-command.sh github-mcp-headers.sh; do
  [ -f "$SRC/$f" ] && cp "$SRC/$f" "$C/$f"
done

# Output styles
cp "$SRC"/output-styles/*.md "$C/output-styles/" 2>/dev/null || true

# User skills. -L resolves symlinked skills.
for d in "$SRC"/skills/*; do
  name="$(basename "$d")"
  case " $EXCLUDE_SKILLS " in *" $name "*) continue ;; esac
  rsync -aL --exclude '.env*' --exclude '*.pem' --exclude '*.key' "$d/" "$C/skills/$name/"
done

# Mods (local plugins). The generated .claude-plugin/types dir is excluded.
for d in "$SRC"/mods/*/; do
  name="$(basename "$d")"
  rsync -a --exclude '.claude-plugin/types' --exclude '.DS_Store' --exclude 'node_modules' \
    --exclude '.env*' --exclude '*.pem' --exclude '*.key' "$d" "$C/mods/$name/"
done

# Plugin manifests: reference only, restore.sh does not write them back
cp "$SRC/plugins/installed_plugins.json" "$SRC/plugins/known_marketplaces.json" "$C/plugins/" 2>/dev/null || true

# MCP servers: only the mcpServers keys from ~/.claude.json, never the whole file.
# Values under "env" and "headers" are redacted, because they often hold tokens.
python3 - "$HOME/.claude.json" "$C/mcp-servers.json" <<'PY'
import json, sys
def clean(servers):
    out = {}
    for name, cfg in servers.items():
        cfg = dict(cfg)
        for k in ("env", "headers"):
            if isinstance(cfg.get(k), dict):
                cfg[k] = {key: "<REDACTED>" for key in cfg[k]}
        out[name] = cfg
    return out
d = json.load(open(sys.argv[1]))
out = {"user": clean(d.get("mcpServers", {})),
       "projects": {p: clean(v["mcpServers"]) for p, v in d.get("projects", {}).items() if v.get("mcpServers")}}
json.dump(out, open(sys.argv[2], "w"), indent=2)
open(sys.argv[2], "a").write("\n")
PY

# settings*.json: redact env values whose name looks like a credential
python3 - "$C"/settings*.json <<'PY'
import json, re, sys
pat = re.compile(r"KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL", re.I)
for f in sys.argv[1:]:
    d = json.load(open(f))
    env = d.get("env", {})
    if any(pat.search(k) for k in env):
        d["env"] = {k: ("<REDACTED>" if pat.search(k) else v) for k, v in env.items()}
        json.dump(d, open(f, "w"), indent=2)
        open(f, "a").write("\n")
PY

find "$C" -name .DS_Store -delete

# Secret scan: stop if anything looks like a credential
if grep -rInE '(gh[opsu]_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|xox[abp]-[A-Za-z0-9-]+|BEGIN [A-Z ]*PRIVATE KEY|Bearer [A-Za-z0-9._-]{20,})' "$C"; then
  echo "sync.sh: possible secret found above. Fix it before you commit." >&2
  exit 1
fi

echo "Synced into $C. Review with: git -C \"$REPO\" status"
