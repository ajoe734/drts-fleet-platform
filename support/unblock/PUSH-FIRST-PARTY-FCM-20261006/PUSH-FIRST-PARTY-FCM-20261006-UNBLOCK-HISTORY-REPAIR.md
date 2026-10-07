# PUSH-FIRST-PARTY-FCM-20261006 — history and unblock evidence

Owner: Codex. Reviewer: Codex2. Inspection date: 2026-10-07 UTC.

The auto-generated history-repair classification does not match the current
parent blocker. No local/published divergence was found. The delivered FCM
candidate is already merged; its remaining blocker is a reproduced recipient
eligibility/relevance race during metadata-token acquisition. This helper
documents a non-destructive continuation; it does not repair product code or
grant privacy acceptance.

**Delivery hold:** the parent update required by this helper's fourth acceptance
item is not written. The release CLI rejected the cross-task `note` with exit 1,
`Dispatched worker cannot mutate a different task`. Supervisor must record the
parent note and the helper's blocked-parent resolution metadata before this
helper is handed off or merged. A draft PR preserves the report meanwhile.

## 1. Exact history inventory

`git fetch origin` completed successfully. Inspection base and helper initial
HEAD: `b81c9f096da71330db9714a5c6c2691d85fb680d` (`origin/dev`).

| Branch suffix (under the named lane) | Local and origin SHA | Published disposition |
| --- | --- | --- |
| `claude2/push-first-party-fcm-20261006` | `d3ccba40cfcb84381f5407ac4108be02bab9415c` | [PR #2404](https://github.com/ajoe734/drts-fleet-platform/pull/2404), open, historical alternative |
| `gemini2/push-first-party-fcm-20261006` | `325532631e277b2f641ab3ed76632d334bd42313` | [PR #2406](https://github.com/ajoe734/drts-fleet-platform/pull/2406), open, rejected predecessor |
| `codex/push-first-party-fcm-20261006` | `a10e0b23032a2ae1176f59f02660dedd25dd7fdf` | [PR #2408](https://github.com/ajoe734/drts-fleet-platform/pull/2408), merged 2026-10-07T14:13:53Z |
| `pi/push-first-party-fcm-20261006` | `3272b83b1aefdd64030ba77d229fd3787d287315` | No PR found for this head; published partial checkpoint |

For each branch, `git rev-list --left-right --count <branch>...origin/<branch>`
returned `0 0` (exit 0). These separate alternatives must not be mistaken for
local/remote divergence on the authoritative Codex branch. Codex versus Pi is
`4 1`; Pi's commit explicitly says it preserves an incomplete contribution after
Supervisor reassignment and is **not** a delivered candidate.

The active parent machine record selects Codex candidate
`a10e0b23032a2ae1176f59f02660dedd25dd7fdf`, generation
`efb6f6512b62434e8e1ca6dc13ba548e`, reviewed at that same SHA, merge commit
`5c09db37f1824b6565a7546280c8b6fadabd6450`. The merge commit is an ancestor of
the inspected `origin/dev` (exit 0). The rejected Gemini2 head is an ancestor
of the Codex candidate (exit 0), followed by these four preserved commits:

- `fb7d7fcf442f9b51bf31a3f5f6bf7446b45fe2b7`: finding ledger anchor.
- `fa2cb5591499dc1d5775616cde80b4552caf7206`: provider/transport repair anchor.
- `b85fd261fde3b6686e2d240e138415aeb8700a6d`: fenced storage/recipient repair anchor.
- `a10e0b23032a2ae1176f59f02660dedd25dd7fdf`: regression/evidence closeout.

`git worktree list --porcelain` finds only this helper worktree and the locked,
clean Pi worktree `.local/pi-first-party-fcm-20261007` for these FCM branches.
No worktree currently checks out the authoritative parent Codex branch. Its
local and remote refs still preserve the candidate. The helper's assigned
worktree started clean and stays on
`codex/push-first-party-fcm-20261006-unblock-history-repair`.

The stale open PRs create selection ambiguity, not demonstrated contamination
of the merged code. Do not merge them or cherry-pick the Pi checkpoint as a
repair. Their refs, PRs and worktrees were left untouched by this helper.

## 2. Actual blocker and exact reproduction

The parent remains `blocked`, `waiting_for: Codex2`; its 14:21:04Z note withholds
acceptance and requests adjudication of the metadata-await defect. Dependency
`PUSH-CHANNEL-ROUTER-20261006` is `done`, with merge
`f270fdbafd82ecdc12598fa86739ee5845345966`; dependency routing is not the blocker.

Production call path at the candidate and inspected dev base:

- `FirstPartyNotificationTransport.send`,
  `apps/api/src/modules/multi-taxi/first-party-notification.transport.ts:259–274`,
  checks relevance, resolves the captured device token, then calls the provider.
- `FcmFirstPartyPushProvider.send`,
  `apps/api/src/modules/multi-taxi/fcm-push.provider.ts:58–83`, awaits
  `tokens.accessToken(signal)` and then POSTs, checking TTL but not current
  recipient eligibility/relevance after that await.
- `git diff --name-only <candidate> origin/dev` for the multi-taxi and registry
  source directories, FCM tests and V0108 returned no paths. The defect is not
  caused by later trunk modifications to those files.

The original finding ledger remains at
`docs/04-uat/passenger-push-channel-20261006/PUSH-FIRST-PARTY-FCM-20261006.md`.
It preserves repeated F1–F13 reviews, rejected candidates and repair boundaries.
This helper does not overwrite its frozen candidate evidence. After formal
reopen, append this precise late-I/O finding there, adjacent to F3/F10, without
discarding prior regression obligations.

Reproduction reused the existing read-only production-source probe:
`.local/full-system-completion-20261007/round2/probe-owner-before-io.cjs` in the
canonical repository. Both extracted production source files compare byte for
byte with this worktree (`cmp`, exit 0 for each). To stay in the assigned
worktree, a local copy changes only the probe's `root = process.cwd()` to the
canonical repository's absolute path. It runs the unchanged provider and
transport logic, with synthetic database, metadata and fetch boundaries.

Command: `node .local/push-fcm-history-repair/probe-owner-before-io.cjs`.
Result: exit 0; full output at
`.local/push-fcm-history-repair/probe-result.json` in this helper worktree.

| Single mutation inside `accessToken` | State at mocked POST | Observed / expected |
| --- | --- | --- |
| Device revoked | `deviceActive=false`, order active | 1 mocked FCM POST and accepted receipt / 0 POSTs |
| Order cancelled | device active, `orderStatus=cancelled` | 1 mocked FCM POST and accepted receipt / 0 POSTs |

The probe's exit 0 means successful reproduction, **not** passing privacy
acceptance. Actual network calls: zero. Its output retains the original
`b85fd261f` source label; byte comparison and candidate-to-dev source comparison
establish applicability to `a10e0b230` and the inspected dev base as well.

GitHub PR #2408 reports completed successful checks for the old candidate,
including `Smoke acceptance` and `ci-integ` (integration run `37632590659`,
CI run `37632590616`). This helper read check metadata, not the entire logs,
and did not rerun those workflows. Those green checks do not cover this new
reproduction and cannot discharge it.

## 3. Non-destructive parent continuation

1. Supervisor records the note and containment metadata in section 4. Keep the
   parent blocked for Codex2 adjudication; do not record either outstanding
   acceptance key, enable FCM or dispatch dependent PG QA from this helper.
2. Codex2 formally adjudicates/reopens the original parent task with the above
   production call path and minimal reproduction. Supervisor routes its owner
   back to an isolated parent worktree, reusing the existing Codex branch at
   `a10e0b230...`. Provisioning a missing worktree must attach that existing
   branch; it must not recreate or reset it from dev or use the Pi worktree.
3. Only after reopen, inspect fresh remote/PR/candidate state. If synchronization
   is needed, merge `origin/dev` in that parent worktree, resolve conflicts and
   verify. Preserve both published histories; never rebase, amend, reset or
   force-push them. This helper neither needs nor performs a parent merge.
4. Repair the provider/transport boundary: after metadata acquisition and
   before FCM POST, revalidate captured active device/hash/passenger/app,
   current claim fence/lease and event relevance. Preserve typed terminal
   failures through the provider catch, shared deadline/TTL and semantics for
   devices already accepted. A callback is the proposed bounded interface;
   the original owner chooses the concrete implementation within task scope.
5. Run production transport-plus-provider tests with **one mutation per case**
   during the metadata await: revoked and cancelled each yield zero POSTs;
   unchanged recipient still sends and accepts. Add relevant hash/owner/fence,
   deadline/TTL and previously accepted-device regressions, then rerun the
   affected suites from the existing UAT ledger. Formal-schema hosted PG
   evidence remains separate; no product/PG/browser servers on this VM.
6. Ordinary push and a new PR/candidate/review/CI cycle are required because
   #2408 is already merged. Preserve the old SHA/generation/merge as history;
   do not relabel old CI or merge evidence as applying to the repair.

## 4. Supervisor action required before helper handoff/merge

The dispatched helper owner tried the canonical release CLI's `note` on the
parent. The command failed before mutation. The parent's `next` has therefore
**not** been updated by this helper. The release implementation
`control_plane/usecases/task_board_commands.py`,
`TaskBoardCommandExecutor._guard_worker_command`, rejects mutations whose task
ID differs from `ORCH_DISPATCH_TASK_ID`. Do not remove dispatch environment
variables, impersonate Supervisor, or write status JSON directly to bypass it.

There is an additional concrete lifecycle hazard: release `ai_status.py`
`apply_unblock_parent_resolution` defaults a completed helper's parent to
`todo` unless `resolved_parent_status` says otherwise. Merely describing the
remaining defect in this Markdown or a handoff message is insufficient.
`command_handoff` does not ingest `TASK_METADATA_JSON`; `command_assign` does.

An actual Supervisor session must use the dispatch-specified release CLI to:

1. Write a parent `note`: history audit found no local/origin divergence;
   candidate `a10e0b230...` merged via #2408 / `5c09db37...`; preserve
   containment waiting for Codex2 to adjudicate/reopen the metadata-await
   revoke/cancel defect; then follow section 3 with the original owner.
2. Preserve this helper's owner/reviewer and set metadata through `assign`
   using `TASK_METADATA_JSON` with:

   ```json
   {
     "resolved_parent_status": "blocked",
     "resolved_parent_waiting_for": "Codex2",
     "resolved_parent_next": "History audit found no published/local divergence. Preserve candidate a10e0b23032a2ae1176f59f02660dedd25dd7fdf, PR #2408 and merge 5c09db37f1824b6565a7546280c8b6fadabd6450. Codex2 must adjudicate/reopen the reproduced revoke/cancel during metadata-await defect; original owner then repairs late eligibility/relevance checks, adds zero-POST and positive regressions, and publishes a new candidate with fresh review/CI. No privacy acceptance or dependent PG QA yet. See support/unblock/PUSH-FIRST-PARTY-FCM-20261006/PUSH-FIRST-PARTY-FCM-20261006-UNBLOCK-HISTORY-REPAIR.md."
   }
   ```

   Command shape: `AI_NAME=Supervisor TASK_METADATA_JSON='<JSON above>'
   <release ai-status.sh> assign
   PUSH-FIRST-PARTY-FCM-20261006-UNBLOCK-HISTORY-REPAIR Codex Codex2`.
   Do not invent `resolved_parent_at`; the actual resolution transaction owns it.
3. Resume this helper for its owner to confirm the parent note and metadata,
   make the draft PR ready, and hand off the verified local/origin/PR head to
   Codex2. The parent itself remains blocked pending its own adjudication.

These are Supervisor instructions, not commands executed by this worker. Until
their machine-truth receipts exist, this helper stays blocked and its draft PR
must not merge. This avoids claiming acceptance item 4 passed or accidentally
resuming a parent with a demonstrated privacy defect.

## 5. Acceptance and verification ledger

| Finding / acceptance | Source and change | Reproduction / result | Evidence and limits |
| --- | --- | --- | --- |
| Identify exact contamination | Section 1; git refs, worktree inventory, parent task and PR #2408 | All four local/origin pairs `0 0`; rejected head preserved; merge ancestor of dev; no contamination found | Read-only git/gh checks exit 0. Open stale PRs distinguished from selected candidate. |
| Non-destructive repair path | Sections 2–3; production `send` methods | Both single-mutation races reproduced; product fix remains outstanding | `cmp` and node exit 0; synthetic IO only, no live or PG acceptance. No history mutation. |
| Canonical commit/push/PR evidence | This helper artifact only | Task-scoped commit and normal push; draft PR while containment coordination is pending | Exact delivery SHA and PR recorded in helper machine-truth progress/blocker; no candidate handoff yet. |
| Parent concrete next step | Section 4; release dispatch guard and resolution handler | Parent `note` attempt exit 1; NOT SATISFIED | Supervisor parent note and metadata receipts required before handoff/merge. |
| Content/format verification | This artifact; existing source references | `git diff --check` and repository commit-trailer check required before publication | Documentation-only change; product regression rerun not applicable. The diagnostic probe confirms the existing defect, not a fix. |

No deployment, secrets, real FCM messages, local development servers, browser
servers or Docker infrastructure were started. No other task worktree or
published branch was changed. Machine-specific reproduction files stay under
this worktree's `.local/push-fcm-history-repair/`.
