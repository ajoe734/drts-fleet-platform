# SR-LIVE-MAP-C114-COVERAGE-20260930 history audit and recovery path

Owner: Codex. Reviewer: Claude2. Audit date: 2026-09-30 UTC.
Helper: `SR-LIVE-MAP-C114-COVERAGE-20260930-UNBLOCK-HISTORY-REPAIR`.
Parent: `SR-LIVE-MAP-C114-COVERAGE-20260930`.

## Finding: no history contamination; reviewer rework remains blocked

The parent has already merged through [PR #2228](https://github.com/ajoe734/drts-fleet-platform/pull/2228).
Its three commits have valid task trailers, all twelve changed files belong to
the parent's declared write scopes, and their contents equal the squash merge.
There is no divergent local/published candidate to rewrite or foreign patch to
remove. The remaining blocker is the requested Claude2 reopen for **F-WIRE**,
followed by owner implementation and the four live acceptance gates.

The current release's `blocked_task_triage_kind()` searches status prose for
history keywords. Calling that actual function on the parent task slice returned
`history_repair`, with matching markers `branch` and `worktree`. The parent's
latest message discusses a deleted remote branch and a local evidence worktree;
those words do not establish contamination. This reproduces the classification,
not an assertion about an unobserved chairman decision. No classifier code is
changed by this helper.

## Exact branch, worktree and commit evidence

| Item                       | Observed result                                                                                                                             |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Assigned helper branch     | `codex/sr-live-map-c114-coverage-20260930-unblock-history-repair`, initially clean at `01f516f48663366df9f717b389e307726eac0edf`            |
| Assigned cwd               | `/home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex-sr-live-map-c114-coverage-20260930-unblock-history-repair`       |
| Original parent candidate  | `ef18713bc63f773ae347d7979ff3b5ca70df7886`, generation `cd802508bd7e467cb136e5d58b088704`                                                   |
| Parent local branch        | `codex/sr-live-map-c114-coverage-20260930` still points to the original candidate                                                           |
| Parent remote-tracking ref | `origin/codex/sr-live-map-c114-coverage-20260930` still points to the original candidate; it is stale, not proof of a live remote branch    |
| Actual remote branch       | `git ls-remote --heads origin codex/sr-live-map-c114-coverage-20260930` returned no row, exit 0                                             |
| Preserved GitHub PR ref    | `refs/pull/2228/head` still resolves remotely to the original candidate                                                                     |
| Parent worktree            | No registered worktree currently checks out the parent branch; do not depend on the earlier worker's untracked evidence directory           |
| Merge                      | `01f516f48663366df9f717b389e307726eac0edf`, PR state MERGED, merged at `2026-09-30T03:09:07Z`; merge is reachable from fetched `origin/dev` |
| Source base                | `64b47218ddd1f0c001a1526f1598251857a4d9fd`                                                                                                  |
| Three parent commits       | `c440a12a6bad9e3f73cfba8bcb003f0574069b93`, `b1babc8f01e6903c5d6e7f82e98f73c289991c2e`, `ef18713bc63f773ae347d7979ff3b5ca70df7886`          |

The twelve source-base-to-candidate paths are the workflow, browser spec/config,
six parent evidence/runner files, and three unit-test files. The audit checked
each against `write_scopes`, then compared every file between candidate and
merge with `git diff --exit-code`: exit 0, no difference. The only whole-tree
difference between candidate and merge is the separately integrated
`docs/04-uat/system-remediation-20260906/SR-LIVE-MAP-001.md` from PR #2226.

`git merge-tree --write-tree ef18713bc63f773ae347d7979ff3b5ca70df7886
01f516f48663366df9f717b389e307726eac0edf` exited 0 and produced tree
`eea6bdb9439b859e248407439be2ede31901e4ce`, exactly the merge commit's tree.
This is a rehearsal; it did not move a branch, HEAD, index or worktree.

Read-only GitHub checks independently confirmed the original candidate's
[CI](https://github.com/ajoe734/drts-fleet-platform/actions/runs/36661338512)
and [integration CI](https://github.com/ajoe734/drts-fleet-platform/actions/runs/36661338636)
are completed/success. The same-candidate
[hosted map run](https://github.com/ajoe734/drts-fleet-platform/actions/runs/36661347551)
is completed/failure. The parent's canonical audit reports missing
`DRTS_LIVE_MAP_DEPLOYED_SHA` and skipped provider/coverage/browser evidence;
this helper rechecked run identity/conclusion, not the old downloaded artifacts.
CI success does not resolve any live acceptance gate.

## Unresolved product finding and repair boundary

The parent-owned artifact remains
`tests/e2e/system-remediation/sr-live-map-001/C114-COVERAGE.md`.
After reviewer reopen, the original owner must append the repair and regression
evidence there, retaining the old candidate and review provenance.

- **F-WIRE:** `apps/api/src/app.module.ts` registers the global
  `SnakeCaseInterceptor` from `apps/api/src/common/snake-case.interceptor.ts`.
  It serializes `actorType`/`actorId` as `actor_type`/`actor_id` recursively.
  In `tests/e2e/system-remediation/sr-live-map-001/coverage-runner.ts`, `request()`
  only casts `response.json()` and `api()` returns `result.data` unchanged;
  `runCoverage()` then requires `session.identity.actorType === "driver_user"`.
  A legitimate serialized session therefore fails the first session assertion.
  Registry, tracking, acknowledgement and decision fields have the same boundary.
- The fixture in
  `tests/unit/system-remediation/sr-live-map-001/coverage-runner.test.ts` returns
  camelCase objects directly. Parent worker receipts record an offline minimal
  reproduction with the actual interceptor and `runCoverage`: snake_case fails
  after one fake request; the camelCase control reaches the second request.
  This helper verifies the precise static path; it does not claim to have rerun
  that prior dynamic probe or recovered the absent parent `.local` files.
- Repair API-response normalization at the API boundary only. Google's
  `formatted_address` and the evidence files' snake_case schema must retain
  their contracts. Exercise real serializer output, positive flow and existing
  isolation/authorization/deployment/redirect rejection cases.
- **Hosted session provisioning:** the merged map workflow still consumes two
  long-lived session secrets. The parent's current `integration_notes` supersede
  that artifact's old provisioning advice: use existing `DEV_WIF_PROVIDER` and
  `DEV_WIF_SERVICE_ACCOUNT`, `id-token: write`, and masked short-lived sessions
  minted inside hosted Actions following the operational acceptance pattern in
  `.github/workflows/deploy-dev.yml`. Do not add worker-written secrets or request
  long-lived tokens. The original owner must implement this under parent scope.
- Supervisor must recheck deployed SHA, API origin, isolated driver and resource
  allowlist prerequisites before running the repaired candidate. The parent
  snapshot reports missing configuration; this helper neither provisions it nor
  claims that snapshot is a fresh inventory of repository variables.

There is one recorded independent approval for the old candidate, followed by
owner findings. This is not evidence of two consecutive independent rejections;
the repeated-rework rule is not falsely invoked.

## Non-destructive continuation

1. Supervisor routes **Claude2** to formally reopen F-WIRE on the parent,
   preserving old candidate/review/CI/merge provenance. A history helper's
   completion must not substitute for that reviewer action.
2. Only after reopen, Supervisor restores the parent's isolated worktree using
   the existing local parent branch. Recheck registered worktrees and live remote
   refs first. Do not switch the canonical root or reset/rebase the retained
   published candidate. Preserve both local and remote heads if they differ.
3. Original owner Codex fetches and, if synchronization is needed for the new
   candidate, merges `origin/dev` in that parent worktree. The pinned rehearsal
   above is clean; it is not a guarantee for a later moving trunk. Resolve and
   verify any new conflicts. Restore the deleted remote branch only with a
   normal push of the retained history and new commits. No force push, amend,
   stash, cherry-pick of already merged implementation, or branch deletion.
4. Owner repairs F-WIRE and hosted WIF session setup in the original scopes,
   anchors changes, runs appropriate regression checks, then uses a new PR to
   `dev` and exact-SHA handoff to Claude2. A new candidate needs new review/CI.
5. Run authorized hosted acceptance only after prerequisites are ready. Retain
   all four required keys: `service_area_live_decisions_for_real_taiwan_addresses`,
   `location_freshness_live_states`, `browser_map_render_live`, and
   `authorization_gate_and_allowed_targets_enforced`. None passes in this helper.

## Parent update blocked by the dispatch guard

The current release CLI rejected both necessary state operations, with exit 1:

- Helper `assign` with `TASK_METADATA_JSON`: `Dispatched workers must use their
assigned task lifecycle commands`.
- Parent `note`: `Dispatched worker cannot mutate a different task`.

The actual guard is `TaskBoardCommandExecutor._guard_worker_command()` in
`tools/development-orchestrator/control_plane/usecases/task_board_commands.py`.
This attempt is dispatched as helper owner. Its role/task/run identity was kept
intact; no alternative state writer, identity change, or direct JSON edit was
used. The helper's own `progress` successfully records the required Supervisor
action. **The parent update and helper disposition are pending, not completed.**

Before this helper may be handed off/merged, Supervisor must use the designated
release CLI in its own authorized operator context to `assign` the helper with
the existing Codex/Claude2 roles and these `TASK_METADATA_JSON` fields:

```json
{
  "resolved_parent_status": "blocked",
  "resolved_parent_waiting_for": "Claude2",
  "resolved_parent_next": "History audit found no contamination. Route Claude2 to formally reopen F-WIRE on ef18713bc63f773ae347d7979ff3b5ca70df7886 (PR 2228; merge 01f516f48663366df9f717b389e307726eac0edf). Then original owner Codex repairs API-only wire normalization with real serializer regressions and hosted WIF short-lived sessions per integration_notes in the preserved parent history. Four hosted live acceptance gates remain pending. See support/unblock/SR-LIVE-MAP-C114-COVERAGE-20260930/SR-LIVE-MAP-C114-COVERAGE-20260930-UNBLOCK-HISTORY-REPAIR.md."
}
```

Supervisor must also issue parent `note` with that concrete next step, preserving
its candidate evidence and `blocked`/`Claude2` disposition. Re-read current state
first: if Claude2 has already reopened, do not overwrite newer progress with
this snapshot. Do not manufacture `resolved_parent_at`; the eventual helper
merge transaction owns it. A read-only call to `parent_resume_blocker()` with a
simulated completed helper and the proposed disposition returns
`helper keeps parent blocked`.

Until those operations are confirmed, this delivery stays a **draft PR**, with
no candidate handoff. Otherwise helper merge defaults could incorrectly resume
the parent. The helper report can be reviewed without unlocking parent work.

## Verification ledger

| Finding / acceptance                 | Source and observed result                                                                                                                      | Verification / evidence                                                                                          | Remaining limitation                                                                     |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Identify exact contamination         | No foreign patch or divergent retained candidate; stale remote-tracking ref distinguished from actual remote; keyword classification reproduced | Read-only audit: 16 command receipts, 12 scoped files identical, three trailers valid, actual release classifier | No history rewrite is warranted; parent F-WIRE remains                                   |
| Non-destructive repair path          | Original published candidate preserved; pinned merge rehearsal yields the exact integrated tree                                                 | `git merge-tree --write-tree` exit 0; `git diff --exit-code` exit 0                                              | Parent merge/implementation starts only after reviewer reopen; later trunk needs recheck |
| Task-scoped commit/push/PR           | Only this helper artifact is changed; assigned helper branch retained                                                                           | Publication record below and helper status receipt                                                               | Draft until parent disposition is safely recorded; no handoff or merge claim             |
| Update parent with next step         | Concrete reviewer/owner/hosted sequence documented and helper progress written                                                                  | Release CLI parent note and metadata attempts both rejected, exit 1; own progress exit 0                         | Supervisor must execute the two guarded state operations; acceptance incomplete          |
| F-WIRE and all four parent live keys | Exact serializer/consumer mismatch confirmed statically; same old SHA CI success and hosted run failure independently read                      | Original candidate and PR #2228; linked CI/live runs; original parent artifact                                   | No new product regression/live run; no parent acceptance recorded                        |

Machine-specific receipts are under `.local/c114-history-repair/` in the assigned
helper cwd. Final audit command: `AI_NAME=Codex python3
.local/c114-history-repair/audit.py`, exit 0, Python 3.12.3 / Git 2.43.0.
An initial audit assertion incorrectly equated absent remote branch with absent
local refs; it was corrected after direct ref inspection before this pass.

- Audit script SHA256: `81135be0a1af294228b2347e8e2837cb0378742fbee95fa614c1b395ae55fd8f`.
- Audit JSON SHA256: `b9d555f41567d49c6a0af2b97153fe23e151fce208e55651d8eae472b0e2442a`.
- Metadata rejection log SHA256: `4178fd72f010a3e97e25d6f726a8f4986331de00ad484a29357427b5454fc302`.
- Parent-note rejection log SHA256: `a3ac5ec3769e0151db21bcc01fe75474c64c1e032be685ce80bab4e29f37b097`.

These logs are supporting local evidence, not durable delivery or live
acceptance. The conclusions and reproducible Git commands are preserved here.
This documentation-only helper does not start VM services, browsers, containers,
or E2E servers; product/runtime tests are not applicable to its file change.

## Publication

- Anchor `d9fdb6990e0526ea5fbdbc6d32f84182b2e0b272` contains only this report and
  the required Codex / task / Claude2 trailers. Normal non-force push succeeded.
- [Draft PR #2231](https://github.com/ajoe734/drts-fleet-platform/pull/2231)
  targets `dev` from the assigned helper branch. This appended publication
  record is a separate commit, preserving the published anchor unchanged.
- Local documentation checks passed: `check_canonical_consistency.py --ci`
  (zero findings), `check_commit_trailers.py`, `git diff --check`, and scoped
  `pnpm exec prettier --check` (Prettier 3.8.2 / Node 22.23.2). The comparison
  base is `01f516f48663366df9f717b389e307726eac0edf`. Final-HEAD rerun receipts,
  normal push, remote/PR head equality and hosted CI outcomes are recorded in
  the helper's canonical status before yielding; no background check is claimed
  passed.
- The helper remains blocked on Supervisor's two state operations above. No
  `handoff`, `approve`, `done`, merge or parent acceptance is claimed. Once the
  state prerequisite is resolved, the owner can verify the unchanged final
  `CANDIDATE_SHA=$(git rev-parse HEAD)` and branch against PR #2231, then hand off
  that exact candidate to Claude2 through the designated release CLI.
