# UI-HANDOFF-TN-PAGE-PASSENGERS-001 Unblock History Repair

Last updated: 2026-05-21
Owner: Codex2
Reviewer: Codex
Task: `UI-HANDOFF-TN-PAGE-PASSENGERS-001-UNBLOCK-HISTORY-REPAIR`
Parent: `UI-HANDOFF-TN-PAGE-PASSENGERS-001`

## Scope

Repair the unblock path for `UI-HANDOFF-TN-PAGE-PASSENGERS-001` without force-pushing shared history.

## Exact contamination

### 1. Parent branch split across two owner lanes

The same task id is currently represented by two different local worker branches and worktrees:

| branch | worktree | head | upstream | note |
| --- | --- | --- | --- | --- |
| `codex2/ui-handoff-tn-page-passengers-001` | `.artifacts/worktrees/auto/codex2-ui-handoff-tn-page-passengers-001` | `a6d26320` | `origin/codex2/ui-handoff-tn-page-passengers-001` at `7d317104` | expected owner lane from the dispatch brief; local head is ahead of remote by one commit |
| `codex/ui-handoff-tn-page-passengers-001` | `.artifacts/worktrees/auto/codex-ui-handoff-tn-page-passengers-001` | `af25856b` | `origin/codex/ui-handoff-tn-page-passengers-001` at `8424b7e0` | parallel local rewrite on a different owner lane; local head is not pushed |

This is not a fast-forward chain. `git merge-base a6d26320 af25856b` returns `8424b7e0`, so the `codex` lane rebuilt from `origin/dev` instead of continuing from the already-published `codex2` anchor at `7d317104`.

### 2. Parent blocker text over-claims a remote commit that does not exist

Canonical machine truth currently reports the parent blocker as:

> Passengers page is rebuilt and anchored in commit `af25856b` on `origin/codex/ui-handoff-tn-page-passengers-001`

That statement is false. The actual refs are:

- `origin/codex/ui-handoff-tn-page-passengers-001` -> `8424b7e0`
- `origin/codex2/ui-handoff-tn-page-passengers-001` -> `7d317104`
- local `codex/ui-handoff-tn-page-passengers-001` -> `af25856b`
- local `codex2/ui-handoff-tn-page-passengers-001` -> `a6d26320`

So the blocker text currently treats an unpublished local `codex` head as if it were the pushed remote truth.

### 3. Both repair branches existed, but neither carried repair evidence

Before this task started, both of these branches existed and both still pointed at `origin/dev` (`8424b7e0`):

- `codex/ui-handoff-tn-page-passengers-001-unblock-history-repair`
- `codex2/ui-handoff-tn-page-passengers-001-unblock-history-repair`

That left the unblock dispatch with no task-scoped artifact branch to cite, even though the parent had already accumulated conflicting owner-lane history.

## Non-destructive repair path

1. Treat `codex2/ui-handoff-tn-page-passengers-001` as the canonical parent continuation.
   Reason: the dispatch brief assigns the task to the `codex2` lane, and `origin/codex2/ui-handoff-tn-page-passengers-001` already contains the latest published parent anchor (`7d317104`).

2. Preserve the `codex/ui-handoff-tn-page-passengers-001` branch as an alternate local attempt.
   Do not force-push, reset, or rewrite it. If any hunk from `af25856b` is still needed, replay it onto the `codex2` parent branch with a normal additive commit.

3. Use this repair branch only for unblock evidence.
   The repair branch should document the contamination and the replay rule; it should not pretend to supersede either parent branch by history rewrite.

4. Correct the parent next step in machine truth after this repair closes.
   The unblocked next step is:
   `Resume UI-HANDOFF-TN-PAGE-PASSENGERS-001 on codex2/ui-handoff-tn-page-passengers-001; publish the owner-lane head a6d26320 (or an additive successor) with a normal push, then continue review from that codex2 branch. Ignore codex/ui-handoff-tn-page-passengers-001 unless a specific hunk needs to be cherry-picked.`

## Evidence

### Branch and remote refs

```text
$ git rev-parse origin/codex/ui-handoff-tn-page-passengers-001 origin/codex2/ui-handoff-tn-page-passengers-001 codex/ui-handoff-tn-page-passengers-001 codex2/ui-handoff-tn-page-passengers-001
8424b7e0ab7d7246474abbf4e54e3be366f75942
7d317104c21584cf41fecbee606f3eb1d8b26271
af25856ba76c9b04ea6ea42fbcbb2cd584fdeb2c
a6d26320b1c9229246b7d29fcbcabf4d75b6d8f4
```

### Divergence shape

```text
$ git merge-base 7d317104 a6d26320
7d317104c21584cf41fecbee606f3eb1d8b26271

$ git merge-base 7d317104 af25856b
8424b7e0ab7d7246474abbf4e54e3be366f75942

$ git merge-base a6d26320 af25856b
8424b7e0ab7d7246474abbf4e54e3be366f75942
```

### Duplicate worktrees

```text
$ git worktree list --porcelain | rg -n -C 2 'passengers'
worktree /home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex-ui-handoff-tn-page-passengers-001
HEAD af25856ba76c9b04ea6ea42fbcbb2cd584fdeb2c
branch refs/heads/codex/ui-handoff-tn-page-passengers-001

worktree /home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex-ui-handoff-tn-page-passengers-001-unblock-history-repair
HEAD 8424b7e0ab7d7246474abbf4e54e3be366f75942
branch refs/heads/codex/ui-handoff-tn-page-passengers-001-unblock-history-repair

worktree /home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex2-ui-handoff-tn-page-passengers-001
HEAD a6d26320b1c9229246b7d29fcbcabf4d75b6d8f4
branch refs/heads/codex2/ui-handoff-tn-page-passengers-001

worktree /home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex2-ui-handoff-tn-page-passengers-001-unblock-history-repair
HEAD 8424b7e0ab7d7246474abbf4e54e3be366f75942
branch refs/heads/codex2/ui-handoff-tn-page-passengers-001-unblock-history-repair
```

## Canonical changes from this repair task

- Added this repair artifact on the dedicated `codex2/ui-handoff-tn-page-passengers-001-unblock-history-repair` branch.
- Re-registered the parent and unblock task in canonical `ai-status.json` so the supervisor can track the fix in machine truth.
- Closeout will update the parent task to the concrete codex2-lane replay step above.

## PR status

No PR was open for this repair branch when the investigation started. Closeout should record the final branch push and PR state explicitly.
