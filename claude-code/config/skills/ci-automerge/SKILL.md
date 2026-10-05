---
name: ci-automerge
description: Monitor CI and auto-merge a PR that this session opened. Use right after git push or after opening a PR (gh pr create). Covers CI monitoring, auto-fix on failure, merge-condition checks, and merge notification.
---

# CI monitoring and auto-merge

- After each push or new PR, monitor CI automatically. Do not ask me "Did CI pass?" or "Should I check CI?".
- After you open a PR: use ccd_pr `get_status` to check if the PR is bound. If it is not bound, call `bind_pr`. Then call `set_monitor` (auto_fix: true, address_comments: true, with the PR URL) to enable auto-fix on failure. If the ccd_pr tools are not available (for example, in a CLI-only session), skip this step and use only the Monitor and `gh` steps below.
- The built-in monitor wakes only on CI failure, merge conflict, or review comment. It does not wake when CI passes. Thus, also start a Monitor (timeout_ms at the maximum, 1800000): every 30 s, run `gh pr checks <PR> --json name,bucket`. When no check is pending, print the result and exit. If the Monitor times out before that, start it again.
- On CI failure: read the logs, fix the problem, push, and start the Monitor again. Continue until all checks pass or until I must decide (requirement change, missing permission, or 3 failed fix attempts in a row).
- When all checks pass, merge automatically (I gave explicit authorization). Do not ask me again:
  - First, confirm these conditions: not a draft, no merge conflict, no "changes requested" review, mergeable (ccd_pr `get_status`; if not available, `gh pr view --json isDraft,mergeable,reviewDecision`).
  - If all conditions are true, use ccd_pr `set_auto_merge`. If that tool is not available or the repository does not support auto-merge, use `gh pr merge --squash --delete-branch`.
  - If a condition is false (conflict, required review not approved, blocked by branch protection), do not force the merge. Use PushNotification to tell me where it is blocked.
  - Apply these rules only to PRs that this session opened. Do not merge PRs from other people.
  - After the merge, use PushNotification to tell me, with the PR link.
- Never use `--admin` or any other method that bypasses branch protection. A permission deny rule also blocks `gh pr merge … --admin`.
