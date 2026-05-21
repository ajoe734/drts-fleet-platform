# UI-HANDOFF-TN-PAGE-PASSENGERS-001-UNBLOCK-HISTORY-REPAIR Unblock History Repair

Last updated: 2026-05-21
Owner: Codex
Reviewer: Claude
Task: `UI-HANDOFF-TN-PAGE-PASSENGERS-001-UNBLOCK-HISTORY-REPAIR-UNBLOCK-HISTORY-REPAIR`
Parent: `UI-HANDOFF-TN-PAGE-PASSENGERS-001-UNBLOCK-HISTORY-REPAIR`

## Scope

Repair the unblock path for `UI-HANDOFF-TN-PAGE-PASSENGERS-001-UNBLOCK-HISTORY-REPAIR` without force-pushing shared history.

## Exact contamination

### 1. The Codex child repair branches were created from the wrong base

The two Codex-lane branches involved in this child task both still point at `origin/dev` instead of the already-pushed parent repair branch:

| branch | worktree | head | upstream | note |
| --- | --- | --- | --- | --- |
| `codex/ui-handoff-tn-page-passengers-001-unblock-history-repair` | `.artifacts/worktrees/auto/codex-ui-handoff-tn-page-passengers-001-unblock-history-repair` | `8424b7e0` | `origin/dev` | local placeholder branch; no parent repair commits |
| `codex/ui-handoff-tn-page-passengers-001-unblock-history-repair-unblock-history-repair` | `.artifacts/worktrees/auto/codex-ui-handoff-tn-page-passengers-001-unblock-history-repair-unblock-history-repair` | `8424b7e0` | `origin/dev` | current child worktree; inherited the same wrong base |
| `codex2/ui-handoff-tn-page-passengers-001-unblock-history-repair` | `.artifacts/worktrees/auto/codex2-ui-handoff-tn-page-passengers-001-unblock-history-repair` | `3a8276ab` | `origin/codex2/ui-handoff-tn-page-passengers-001-unblock-history-repair` | canonical parent repair branch with the real artifact and push evidence |

Because the Codex child branch starts from `8424b7e0`, it does not contain the parent repair commits:

- `485ba792` `wip(UI-HANDOFF-TN-PAGE-PASSENGERS-001-UNBLOCK-HISTORY-REPAIR): anchor repair packet`
- `3a8276ab` `UI-HANDOFF-TN-PAGE-PASSENGERS-001-UNBLOCK-HISTORY-REPAIR: add push evidence`

There is also no remote `origin/codex/ui-handoff-tn-page-passengers-001-unblock-history-repair`. The only pushed repair branch is the Codex2 lane.

### 2. The parent repair task is blocked by state regression, not missing git evidence

Canonical `ai-status.json` already records that the parent repair task has pushed closeout evidence on `origin/codex2/ui-handoff-tn-page-passengers-001-unblock-history-repair` at `3a8276ab`, but its task status is now:

- `status`: `blocked`
- `waiting_for`: `Codex`
- `next`: closeout evidence is ready, but machine truth was downgraded from `review_approved` to `in_progress` by owner `progress` at `2026-05-21T00:08:07Z`

The handoff log already preserves the successful repair review chain:

1. `2026-05-21T00:04:09Z` Codex2 handed the parent repair packet to Codex.
2. `2026-05-21T00:07:39Z` Codex reviewed it and confirmed the non-force repair path.
3. `2026-05-21T00:10:21Z` canonical machine truth recorded the parent as blocked only because the status had been downgraded after review approval.

So the parent is not missing branch data, commit evidence, or a push. The contamination is a control-plane state regression layered on top of a correct Codex2 repair branch.

### 3. The replay path is workflow repair, not history rewrite

The control-plane commands matter here:

1. `scripts/ai_status.py` `command_approve` only allows `review -> review_approved`.
2. The parent is no longer in `review`; it is `blocked`.
3. `scripts/ai_status.py` `command_handoff` does not require a prior status, only that the actor is the owner and the target matches the assigned reviewer.

That means the repair does not require force-pushing, rebasing, or replacing the Codex2 repair branch. The fix is to replay the parent task's owner->reviewer handoff on the already-pushed branch, then replay review approval and owner closeout.

## Non-destructive repair path

1. Preserve `origin/codex2/ui-handoff-tn-page-passengers-001-unblock-history-repair` at `3a8276ab` as the canonical parent repair branch.
2. Do not push a competing Codex-lane repair branch for the parent. This child branch exists only to document why the Codex lane was on the wrong base.
3. Resume the parent repair task with the existing pushed evidence, using the normal lifecycle:
   `AI_NAME=Codex2 scripts/ai-status.sh handoff UI-HANDOFF-TN-PAGE-PASSENGERS-001-UNBLOCK-HISTORY-REPAIR Codex "<replay the existing 3a8276ab closeout evidence>"`
4. After that handoff is replayed, Codex can immediately re-approve the same parent repair packet:
   `AI_NAME=Codex scripts/ai-status.sh approve UI-HANDOFF-TN-PAGE-PASSENGERS-001-UNBLOCK-HISTORY-REPAIR "<review pass against 3a8276ab>"`
5. Once the parent returns to `review_approved`, Codex2 can finalize it without new history:
   `AI_NAME=Codex2 COMMIT_HASH=3a8276ab7e9602597f11cdd5f103100bcb3dd054 COMMIT_SUBJECT="UI-HANDOFF-TN-PAGE-PASSENGERS-001-UNBLOCK-HISTORY-REPAIR: add push evidence" PUSH_REMOTE=origin PUSH_BRANCH=codex2/ui-handoff-tn-page-passengers-001-unblock-history-repair scripts/ai-status.sh done UI-HANDOFF-TN-PAGE-PASSENGERS-001-UNBLOCK-HISTORY-REPAIR "<closeout message>"`
6. The parent repair task's own helper-parent resolution should then return `UI-HANDOFF-TN-PAGE-PASSENGERS-001` to the documented Codex2 lane replay step: resume on `codex2/ui-handoff-tn-page-passengers-001` and publish `a6d26320` or an additive successor with a normal push.

## Evidence

### Branch and remote refs

```text
$ git branch -vv | rg 'ui-handoff-tn-page-passengers-001-unblock-history-repair'
+ codex/ui-handoff-tn-page-passengers-001-unblock-history-repair                        8424b7e0 (...) [origin/dev] UI-HANDOFF-PB-PAGE-TRIPS-001: anchor canvas trips page (#223)
* codex/ui-handoff-tn-page-passengers-001-unblock-history-repair-unblock-history-repair 8424b7e0 [origin/dev] UI-HANDOFF-PB-PAGE-TRIPS-001: anchor canvas trips page (#223)
+ codex2/ui-handoff-tn-page-passengers-001-unblock-history-repair                       3a8276ab (...) [origin/codex2/ui-handoff-tn-page-passengers-001-unblock-history-repair] UI-HANDOFF-TN-PAGE-PASSENGERS-001-UNBLOCK-HISTORY-REPAIR: add push evidence

$ git ls-remote --heads origin 'codex/ui-handoff-tn-page-passengers-001-unblock-history-repair' 'codex2/ui-handoff-tn-page-passengers-001-unblock-history-repair'
3a8276ab7e9602597f11cdd5f103100bcb3dd054	refs/heads/codex2/ui-handoff-tn-page-passengers-001-unblock-history-repair
```

### Parent repair commits missing from the Codex child base

```text
$ git log --oneline 8424b7e0..3a8276ab
3a8276ab UI-HANDOFF-TN-PAGE-PASSENGERS-001-UNBLOCK-HISTORY-REPAIR: add push evidence
485ba792 wip(UI-HANDOFF-TN-PAGE-PASSENGERS-001-UNBLOCK-HISTORY-REPAIR): anchor repair packet
```

### Canonical machine-truth state

```text
Parent task entry:
- status: blocked
- waiting_for: Codex
- next: Closeout evidence is ready for done (commit 3a8276ab pushed to origin/codex2/ui-handoff-tn-page-passengers-001-unblock-history-repair), but machine truth was downgraded from review_approved to in_progress by owner progress at 2026-05-21T00:08:07Z.

Canonical history for the same task:
- 2026-05-21T00:04:09Z Codex2 -> Codex handoff with repair packet at 3a8276ab
- 2026-05-21T00:07:39Z Codex review pass recorded against 3a8276ab
- 2026-05-21T00:10:21Z blocker recorded because the state had regressed after review approval
```

## Canonical changes from this repair task

1. Added this child repair artifact on the dedicated `codex/ui-handoff-tn-page-passengers-001-unblock-history-repair-unblock-history-repair` branch.
2. Advanced `UI-HANDOFF-TN-PAGE-PASSENGERS-001-UNBLOCK-HISTORY-REPAIR-UNBLOCK-HISTORY-REPAIR` to `in_progress` in canonical machine truth.
3. Updated the parent task's canonical `next` field to the concrete replay path: owner replays `handoff` on the existing Codex2 repair branch, reviewer replays `approve`, owner replays `done`.

## Closeout evidence

- Commit: `20c9d5b05011d672b3543b2039c1446835d1d354` `wip(UI-HANDOFF-TN-PAGE-PASSENGERS-001-UNBLOCK-HISTORY-REPAIR-UNBLOCK-HISTORY-REPAIR): anchor wrong-base repair packet`
- Push: `origin/codex/ui-handoff-tn-page-passengers-001-unblock-history-repair-unblock-history-repair`
- PR status: `gh pr list --head codex/ui-handoff-tn-page-passengers-001-unblock-history-repair-unblock-history-repair --json number,state,url,headRefName,baseRefName` returned `[]`
