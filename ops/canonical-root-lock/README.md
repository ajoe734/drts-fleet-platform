# Canonical workspace root branch lock

Defends the canonical workspace root
(`/home/edna/workspace/drts-fleet-platform`) against workers that
accidentally run `git switch` or `git checkout` there instead of inside
their assigned isolated worktree.

## Why this defense exists

The orchestrator's contract: supervisor dispatches each worker into an
isolated worktree under `.artifacts/worktrees/auto/<lane>-<task>`. The
worker is supposed to switch branches and commit *there*, never on the
canonical root. The canonical root is the single source of truth for
machine-readable state (`ai-status.json`, `state.json`, dashboards),
and its branch determines which tasks the supervisor can see.

When a worker breaks the contract and `git switch`-es on the canonical
root, the dashboard appears to "lose" tasks — they were registered on
the previous branch but the new branch doesn't have them. The 2026-05-26
incident lost visibility of 90 UI-implementation tasks for several
hours after the wave-dispatch branch was silently replaced with a
sibling ops branch on the canonical root.

## Two layers

### Layer 1 — audit (`.husky/post-checkout`)

Runs after every branch checkout. If the checkout happened in the
canonical root (not in any worktree), records:
- timestamp
- previous and new branch + sha
- caller process chain (PID + command) up the parent tree

Output: `.orchestrator/logs/canonical-root-checkouts.jsonl` + a stderr
WARN that the operator sees in their terminal *and* that any worker
process responsible for the switch sees in its captured output.

This layer cannot block the switch — git has no pre-checkout hook —
but it makes the drift impossible to miss after the fact.

### Layer 2 — periodic watchdog (`scripts/canonical-root-watchdog.py`)

systemd `--user` timer fires every 60 seconds, runs the watchdog. The
watchdog:

1. Reads the canonical root's current branch.
2. Compares against an allow list (defaults `main` + `dev`, augmented
   via `ORCH_CANONICAL_BRANCH` env from
   `~/.config/drts/canonical-root.env`).
3. If drifted, logs to `.orchestrator/logs/canonical-root-watchdog.jsonl`
   and exits non-zero — `systemctl --user status
   drts-canonical-root-watch` then surfaces the drift to the operator.

### Optional Layer 3 — enforce

`canonical-root-watchdog.py --enforce` auto-`git switch`-es back to the
expected branch (default `dev`, env-overridable via
`ORCH_CANONICAL_EXPECTED`) IF the working tree is clean. Refuses to
act on a dirty tree to avoid clobbering uncommitted work. Wire this
into the timer's `ExecStart` once observe mode has confirmed the allow
list is correctly maintained.

## Install

```
scripts/install-canonical-root-watch-systemd.sh
```

Idempotent. Seeds `~/.config/drts/canonical-root.env` with the current
branch so the watchdog doesn't fire false-positives immediately on a
sprint-branch checkout. The husky hook activates automatically on next
`pnpm install` (husky rebuilds hooks on every install).

## Maintaining the allow list

When you intentionally park the canonical root on a non-default branch
(e.g., during a wave dispatch like `claude/ui-impl-wave-dispatch-202605`),
edit the env file:

```
$EDITOR ~/.config/drts/canonical-root.env
# ORCH_CANONICAL_BRANCH=claude/ui-impl-wave-dispatch-202605
systemctl --user restart drts-canonical-root-watch.timer
```

When the wave concludes and you switch back to `dev`, remove the
branch from the env file so accidental future re-parks are detected.

## Incident response

If `systemctl --user status drts-canonical-root-watch` shows red,
or `scripts/health.sh` reports canonical root drift:

1. `git -C /home/edna/workspace/drts-fleet-platform status` — check if
   the working tree has uncommitted work that was meant for a different
   branch.
2. `tail -10 .orchestrator/logs/canonical-root-checkouts.jsonl` — find
   the offending switch event and its `caller_chain` to identify the
   worker process.
3. Recover by switching canonical root back to the expected branch
   (`git switch dev` or the active wave branch). Commit any
   uncommitted work to the correct worker branch first if relevant.
4. Investigate the offending worker — its task brief should have made
   it use a worktree, not the canonical root.
