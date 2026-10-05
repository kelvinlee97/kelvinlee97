#!/bin/sh
# Emits GitHub MCP auth headers from the gh CLI keyring token (no token stored in config).
printf '{"Authorization":"Bearer %s"}' "$(gh auth token)"
