# Claude Code config

My personal Claude Code setup: global instructions, settings, skills, output styles, a mod, the plugin list, and MCP servers.

## Layout

```
claude-code/
├── sync.sh                     # ~/.claude -> config/
├── restore.sh                  # config/ -> ~/.claude
└── config/
    ├── CLAUDE.md               # global instructions
    ├── settings.json           # permissions, plugins, autoMode, status line
    ├── settings.local.json     # local overrides
    ├── statusline-command.sh   # status line script
    ├── github-mcp-headers.sh   # gh-mcp auth headers from the gh keyring
    ├── mcp-servers.json        # mcpServers from ~/.claude.json (env/headers redacted)
    ├── output-styles/          # Visual Bilingual, Bilingual
    ├── skills/                 # user skills
    ├── mods/token-weather/     # local plugin: context and rate-limit band
    └── plugins/                # installed plugins and marketplaces (reference)
```

## Workflow

```mermaid
flowchart LR
  A[~/.claude] -- sync.sh --> B[claude-code/config]
  B -- git commit + push --> C[GitHub]
  C -- git clone --> D[new machine]
  D -- restore.sh --> E[~/.claude]
```

### Back up

```bash
claude-code/sync.sh     # copy the live setup into config/, then scan for secrets
git diff                # review
git commit -am "Sync Claude Code config" && git push
```

`sync.sh` never writes to `~/.claude`. It redacts MCP `env`/`headers` values and credential-like `env` values in settings. It stops if the secret scan finds a match.

### Restore

```bash
git clone https://github.com/kelvinlee97/kelvinlee97 ~/code/kelvinlee97
~/code/kelvinlee97/claude-code/restore.sh
```

`restore.sh` moves each existing target to `<target>.bak-<timestamp>` before it copies the new file. It then prints the manual steps for plugins and MCP servers.

## Not in this repo

This repo is public, so these items are not copied:

| Item | Reason |
|---|---|
| Auto memory (`projects/*/memory`) | private project notes |
| `weread-skills` | third-party skill with no license |
| `skills/synced/` | claude.ai syncs these skills automatically |
| Plugin cache and marketplaces | `/plugin install` downloads them again |
| `blast-radius` plugin | third-party, from `anthropics/claude-code-playground` |
| Transcripts, `history.jsonl`, `security/`, `telemetry/` | private runtime state |
| Full `~/.claude.json` | account and OAuth state |

## Notes

- `settings.json` and `mcp-servers.json` contain absolute paths under `/Users/kelvin`. Edit them if the home directory differs.
- The `claude-code-playground-mods` marketplace needs a clone of `anthropics/claude-code-playground` at `~/code/claude-code-playground`.
