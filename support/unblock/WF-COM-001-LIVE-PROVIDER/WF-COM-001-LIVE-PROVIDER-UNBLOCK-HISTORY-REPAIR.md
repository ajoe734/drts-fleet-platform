# WF-COM-001-LIVE-PROVIDER History Repair

- Task: `WF-COM-001-LIVE-PROVIDER-UNBLOCK-HISTORY-REPAIR`
- Parent: `WF-COM-001-LIVE-PROVIDER`
- Owner: `Codex2`
- Reviewer: `Codex`
- Date: `2026-05-19`
- Status: `documented non-force repair path; parent next step corrected to external blockers only`

## Diagnosis

`WF-COM-001-LIVE-PROVIDER` is genuinely blocked on external CTI provider,
callback, filing, export, retention, and end-to-end evidence inputs. The
history contamination is not a missing product decision. It is:

1. stale branch-local machine-truth snapshots inside isolated worktrees, and
2. a later parent-side evidence commit that preserved one stale conclusion
   after the manual-unblock helper had already closed.

The exact stale conclusion is: `COM-BLUEPRINT-001` was recorded as "still in
progress" in the later parent blocker note even though canonical machine truth
had already moved it to `done` at `2026-05-19T16:10:25Z`.

## Exact contamination

### 1. Canonical machine truth had already advanced

Canonical machine truth lives at:

- root: `/home/edna/workspace/drts-fleet-platform`
- `ai-status.json` mtime: `2026-05-19 19:42:24 +0000`
- `current-work.md` mtime: `2026-05-19 19:42:06 +0000`
- `ai-activity-log.jsonl` mtime: `2026-05-19 19:42:39 +0000`

By the time this repair started, canonical truth already recorded:

- `COM-BLUEPRINT-001 status=done`
  - `last_update=2026-05-19T16:10:25Z`
  - `commit_hash=9373084c8c4608c3d264c24c85584707b1b4ecbf`
  - `push_ref=origin/codex2/com-blueprint-001`
- `WF-COM-001-LIVE-PROVIDER-UNBLOCK-MANUAL-UNBLOCK status=done`
  - helper closeout at `2026-05-19T16:55:15Z`
  - artifact anchored at `65c0584`
- `WF-COM-001-LIVE-PROVIDER status=blocked`
  - but with a newer blocker note at `2026-05-19T18:58:48Z`
  - that blocker note cited `7cb86c3`

### 2. Multiple isolated worktrees still carried the stale 15:56:57Z snapshot

Three related worktrees still carried branch-local tracked snapshots with
`ai-status.json updated_at=2026-05-19T15:56:57Z`:

- `/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex2-wf-com-001-live-provider`
- `/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex-wf-com-001-live-provider`
- `/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/claude2-wf-com-001-live-provider-unblock-manual-unblock`

Those local snapshots all still said:

- `COM-BLUEPRINT-001 status=in_progress`
- `WF-COM-001-LIVE-PROVIDER status=blocked`
  with `next="Held — see conflicts doc / external resources"`
- neither worktree-local snapshot contained a fresh synchronized view of the
  later parent evidence packet

This is the same machine-truth split seen in other history-repair tasks:
`scripts/ai-status.sh` writes through `AI_STATUS_ROOT` / `ORCH_STATUS_ROOT`,
while tracked copies inside isolated task worktrees remain older repo
snapshots unless explicitly refreshed.

### 3. The manual-unblock helper was correct, but a later parent commit drifted

The earlier helper branch:

- `origin/claude2/wf-com-001-live-provider-unblock-manual-unblock@65c0584`

correctly documented that:

- `COM-BLUEPRINT-001` was already `done`
- the remaining blocker set was `EXT-004-BLK-001..008` plus staging-host
  reachability
- the parent should stay blocked on those external inputs only

That helper then closed at `2026-05-19T16:55:15Z`, and the activity log shows
the corresponding `parent_resume` event with the correct external-only next
step wording.

### 4. Chair resumed the parent, then the later parent note reintroduced stale dependency state

`ai-activity-log.jsonl` shows the sequence:

- `2026-05-19T16:55:15Z`
  `WF-COM-001-LIVE-PROVIDER-UNBLOCK-MANUAL-UNBLOCK done`
- `2026-05-19T16:58:57Z`
  `chair_parent_resume_applied` moved `WF-COM-001-LIVE-PROVIDER` back to
  `todo`
- `2026-05-19T18:28:02Z`
  another chair resume pass again treated the helper as complete and the parent
  as resumable owner work
- `2026-05-19T18:57:40Z`
  `origin/codex/wf-com-001-live-provider@7cb86c3` added
  `support/sidecars/COM-LIVE-PROVIDER-20260519/COM-LIVE-PROVIDER-EVIDENCE.md`
- `2026-05-19T18:58:48Z`
  the parent was moved back to `blocked`, but the blocker message now said:
  `COM-BLUEPRINT-001 is still in progress and does not itself activate the provider`

That last sentence is the post-helper commit drift. It preserved the stale
15:56:57Z worktree snapshot inside the newer parent-side branch activity,
even though canonical truth had already closed `COM-BLUEPRINT-001`.

### 5. The contaminated commit is historically valid but stale as unblock guidance

`7cb86c3` should not be deleted or force-pushed away. It is a legitimate
task-scoped parent evidence commit. The contamination is narrower:

- the sidecar packet itself is useful and should remain in history
- the blocker note attached to the parent at `2026-05-19T18:58:48Z` preserved
  stale dependency state

So the repair is documentary and additive, not destructive.

## Non-force repair path

Do not rewrite any published branch.

Use this additive repair chain instead:

1. Treat the canonical root behind `scripts/ai-status.sh` as authoritative for
   task state, not the tracked `ai-status.json` / `current-work.md` copies
   inside isolated worktrees.
2. Preserve the existing historical branches:
   - `origin/claude2/wf-com-001-live-provider-unblock-manual-unblock@65c0584`
   - `origin/codex/wf-com-001-live-provider@7cb86c3`
3. Interpret `65c0584` as the authoritative helper diagnosis for the unblock
   path because it used the up-to-date dependency state and closed with the
   correct external-only next-step wording.
4. Interpret `7cb86c3` as a useful parent evidence anchor whose dependency
   sentence must be superseded:
   - keep the artifact path
     `support/sidecars/COM-LIVE-PROVIDER-20260519/COM-LIVE-PROVIDER-EVIDENCE.md`
   - discard only the stale clause claiming `COM-BLUEPRINT-001` remained
     `in_progress`
5. Record this repair note on the isolated task branch
   `codex2/wf-com-001-live-provider-unblock-history-repair` so shared history
   stays intact and future closeout can cite one explicit non-force correction.

No force-push, rebase of published helper branches, or commit deletion is
required.

## Canonical parent next step

The parent should remain `blocked`, but only on the real external blockers.

Corrected parent next step:

1. Keep `support/sidecars/COM-LIVE-PROVIDER-20260519/COM-LIVE-PROVIDER-EVIDENCE.md`
   as the current parent evidence anchor from `7cb86c3`.
2. Keep `COM-BLUEPRINT-001` treated as `done`; do not use it as a blocker
   anymore.
3. Wait for `EXT-004-BLK-001..008` plus reachable staging-host activation:
   - CTI provider or approved stub environment
   - callback contract approval
   - webhook security controls
   - staging callback run evidence
   - filing scheduler activation
   - recording index export activation
   - retention / signed-download / legal-hold sign-off
   - end-to-end `E2E-003` live or staging packet
4. Once those inputs exist, rerun the parent from the existing sidecar path and
   update the release-gate row from `PASS (sandbox evidence)` to live-staging
   evidence.

Recommended machine-truth wording for the parent:

> Await CTI provider (or approved stub) environment, callback contract,
> webhook security controls, staging callback evidence, filing scheduler +
> recording index export activation, retention / signed-download /
> legal-hold sign-off, and the E2E-003 live or staging packet
> (`EXT-004-BLK-001..008`). COM-BLUEPRINT-001 is already done; the remaining
> blocker is external activation and evidence collection only.

## Why this unblocks the history path

- It identifies the exact contamination:
  stale worktree-local machine truth plus a post-helper parent blocker note
  that reused the stale dependency conclusion.
- It preserves both published branches and their evidence payloads.
- It gives the parent one corrected next-step interpretation without
  pretending the external CTI blocker is resolved.
- It converts the blocker from "confusing commit history" to a concrete,
  auditable parent state: external CTI activation only.

## Evidence checked

- canonical machine truth:
  - `/home/edna/workspace/drts-fleet-platform/ai-status.json`
  - `/home/edna/workspace/drts-fleet-platform/current-work.md`
  - `/home/edna/workspace/drts-fleet-platform/ai-activity-log.jsonl`
- stale worktree snapshots:
  - `codex2-wf-com-001-live-provider`
  - `codex-wf-com-001-live-provider`
  - `claude2-wf-com-001-live-provider-unblock-manual-unblock`
- task-scoped commits:
  - `9373084` `closeout(COM-BLUEPRINT-001): finalize CTI recording filing blueprint`
  - `65c0584` `WF-COM-001-LIVE-PROVIDER-UNBLOCK-MANUAL-UNBLOCK: document live CTI provider hold`
  - `7cb86c3` `wip(WF-COM-001-LIVE-PROVIDER): anchor hold-state evidence`
