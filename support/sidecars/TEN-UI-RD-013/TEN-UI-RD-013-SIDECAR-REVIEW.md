# TEN-UI-RD-013 Sidecar Review Packet

This document is the support-only review packet for `TEN-UI-RD-013`
(`TN_CostCenter`). It does not change canonical truth. Its job is to give the
assigned sidecar reviewer (`Codex2`) one place to audit why the parent task is
now `done` in canonical machine truth after the 2026-05-18 reopen/review/
closeout cycle.

This packet intentionally distinguishes between:

- the historical blocker record from `2026-05-10`
- the first read-only shipment recorded in the `2026-05-14` closeout docs
- the later branch-local regression fix and closeout recorded in canonical
  machine truth on `2026-05-18`

Anchors used here:

- `/home/edna/workspace/drts-fleet-platform/ai-status.json`
- `/home/edna/workspace/drts-fleet-platform/ai-activity-log.jsonl`
- `docs/05-ui/tenant-console-parity-decisions-20260510.md`
- `docs/05-ui/tenant-console-redesign-closeout-20260514.md`
- branch `origin/codex2/ten-ui-rd-013`
- commits `1f1e776`, `d02ae3f`, `9f5397c`, and `edd8433`

## 1. Scope Boundary

In scope:

- summarize the parent task's canonical `done` snapshot
- map the accepted implementation surface to the branch and commits that
  actually contain the source delta
- preserve the historical blocker/shipment context so review is done against
  the right evidence chain
- hand off a reviewer-facing checklist for the sidecar task only

Out of scope:

- editing L1/L2 product truth
- editing runtime code, contracts, or tests
- changing the parent task row in `ai-status.json`
- re-deciding product semantics that were already accepted into machine truth

Current sidecar posture at packet draft time:

- task id: `TEN-UI-RD-013-SIDECAR-REVIEW`
- owner: `Codex`
- reviewer: `Codex2`
- status: `in_progress`
- helper kind: `review_packet`
- mutates canonical: `false`

## 2. Machine-Truth Snapshot

### 2.1 Parent row: `TEN-UI-RD-013`

Canonical `ai-status.json` currently records:

- status=`done`
- owner=`Codex2`
- reviewer=`Codex`
- phase=`Wave 3`
- depends_on=`TEN-UI-RD-001`
- last_update=`2026-05-18T07:28:32Z`
- commit_hash=`edd8433659c836fa9c7cf3bd9552901d47dd8533`
- commit_subject=`chore(TEN-UI-RD-013): finalize owner closeout`
- commit_agent=`Codex2`
- commit_reviewer=`Codex`
- push_remote=`origin`
- push_branch=`codex2/ten-ui-rd-013`
- push_ref=`origin/codex2/ten-ui-rd-013`
- push_commit=`edd8433659c836fa9c7cf3bd9552901d47dd8533`

Recorded `next` field:

> Owner closeout complete: task-scoped commit edd8433
> (chore(TEN-UI-RD-013): finalize owner closeout) is pushed to
> origin/codex2/ten-ui-rd-013. Reviewer-approved source change 9f5397c remains
> the shipped Cost Center fix: explicit cost_center.code conditions now outrank
> generic owner fallback, regression coverage is added in cost-center-summary
> tests, reviewer rerun passed tenant-console-web tsc/next build/vitest on
> detached verification worktree, and TN_CostCenter parity artifact stays
> aligned at packages/ui-web/src/tenant-cost-centers.stories.tsx
> anchor=costcenter.

### 2.2 This sidecar row: `TEN-UI-RD-013-SIDECAR-REVIEW`

Canonical `ai-status.json` currently records:

- owner=`Codex`
- reviewer=`Codex2`
- status=`in_progress`
- phase=`Wave 3`
- depends_on=`TEN-UI-RD-001`
- artifact=`support/sidecars/TEN-UI-RD-013/TEN-UI-RD-013-SIDECAR-REVIEW.md`
- helper_parent=`TEN-UI-RD-013`
- helper_kind=`review_packet`
- mutates_canonical=`false`
- auto_created_by=`supervisor-underutilization`

The current `next` field is the owner-start message recorded at
`2026-05-18T07:33:29Z`: refresh the review packet against canonical machine
truth because the parent is already `done` on `origin/codex2/ten-ui-rd-013`.

## 3. Historical Context That Matters For Review

The reviewer should not read `TEN-UI-RD-013` as a simple one-pass task. The
meaning of the task evolved across three stages:

1. `2026-05-10` blocker record:
   `docs/05-ui/tenant-console-parity-decisions-20260510.md` documented
   `TEN-UI-RD-013` as blocked because tenant cost-center directory/quota/
   coverage/approval-rule contracts did not yet exist.
2. `2026-05-14` first shipment record:
   the same parity-decisions doc was later updated to say
   `TEN-UI-RD-013` shipped as a read-only directory on commit `921c456`
   (`origin/codex/be-cc-001-fu-seed`), and
   `docs/05-ui/tenant-console-redesign-closeout-20260514.md` records the
   route/story artifacts and reviewer approval at `2026-05-14T03:16:30Z`.
3. `2026-05-18` canonical closeout recovery:
   machine truth now binds the parent task to branch
   `origin/codex2/ten-ui-rd-013`, where a later approval-summary regression was
   reviewed, fixed, approved, and then closed out through `edd8433`.

This packet is about stage 3 without losing the stage-1/stage-2 provenance.

## 4. Parent Lifecycle On 2026-05-18

Reconstructed from `ai-activity-log.jsonl` entries scoped to
`TEN-UI-RD-013`:

| Event | Timestamp UTC | Agent | What changed |
| --- | --- | --- | --- |
| `progress` | `2026-05-18T06:50:55Z` | `Codex2` | Re-validated backend contract coverage and existing UI branch state. |
| `reopen` | `2026-05-18T06:55:50Z` | `Codex2` | Reopened after `BE-CC-001` made the old blocker stale. |
| `handoff` | `2026-05-18T06:56:30Z` | `Codex2` | Handed `1f1e776` to reviewer `Codex` with acceptance reruns: contracts build, ui-tokens build, tenant-console-web typecheck/build/test, ui-web build-storybook. |
| `reopen` | `2026-05-18T07:02:09Z` | `Codex` | Review failed on approval-summary scoping. |
| `reopen` | `2026-05-18T07:17:52Z` | `Codex2` | Reopened again after adding regression-fix commit `9f5397c`. |
| `handoff` | `2026-05-18T07:18:53Z` | `Codex2` | Sent the fix back for review with typecheck/build/test reruns. |
| `review_approved` | `2026-05-18T07:25:29Z` | `Codex` | Approved `9f5397c` after detached-worktree verification. |
| `done` | `2026-05-18T07:28:32Z` | `Codex2` | Finalized closeout with task-scoped commit `edd8433` pushed to `origin/codex2/ten-ui-rd-013`. |

Two review facts matter most:

- the accepted source fix is `9f5397c`, not `edd8433`
- `edd8433` is the canonical closeout commit recorded in machine truth

## 5. Branch And Commit Topology

Parent branch log relative to `dev`:

- `1f1e776` `wip(TEN-UI-RD-013): cost-center governance surface`
- `d02ae3f` `TEN-UI-RD-013: count generic owner approval rules`
- `9f5397c` `TEN-UI-RD-013: respect explicit cost-center rule scoping`
- `edd8433` `chore(TEN-UI-RD-013): finalize owner closeout`

Important reviewer caveat:

- `git diff-tree --no-commit-id --name-only -r edd8433` is empty
- `edd8433` adds no new source files beyond the already-approved branch state
- source audit should therefore focus on `1f1e776`, `d02ae3f`, and `9f5397c`
- `git branch -a --contains 1f1e776`, `9f5397c`, and `edd8433` all report
  `codex2/ten-ui-rd-013` and `origin/codex2/ten-ui-rd-013`

Aggregate branch delta from the branch base (`772499f`) through the approved
source tip (`9f5397c`) is:

| Path | Diff vs branch base | Role |
| --- | --- | --- |
| `apps/tenant-console-web/app/cost-centers/page.tsx` | `+451 / -54` | read-only TN_CostCenter route |
| `apps/tenant-console-web/app/cost-centers/summary.ts` | `+76` | approval-summary scoping helper |
| `apps/tenant-console-web/tests/unit/cost-center-summary.test.ts` | `+125` | regression coverage |
| `packages/ui-web/src/tenant-cost-centers.stories.tsx` | `+310` | side-by-side parity story |
| `packages/ui-web/src/tenant-story-support.tsx` | `+1` | story support hook-up |

`git diff --stat 772499f..9f5397c -- <five paths above>` reports
`963 insertions(+), 54 deletions(-)` across those five files.

## 6. Implementation Surface That Review Should Audit

### 6.1 Route page

`git show 9f5397c:apps/tenant-console-web/app/cost-centers/page.tsx` shows the
read-only route surface:

- lines `132-182`: `loadCostCentersData()` uses `Promise.allSettled` for
  `listCostCenters`, `getTenantCostCenterCoverageReport`, and
  `listApprovalRules({ activeOnly: true })`, then fetches per-row quota through
  `getTenantCostCenterQuota(costCenter.code)`
- lines `286-297`: each row derives `approvalSummary` through
  `summarizeApprovalRulesForCostCenter(costCenter.code, approvalRules)`
- lines `310-413`: seven-column directory table
  (`CODE`, `NAME`, `OWNER`, `QUOTA`, `USED`, `APPROVAL`, `STATE`)
- lines `424-429`: `CalloutPanel` surfaces partial-load failures instead of
  inventing fallback mutations
- lines `466-568`: coverage snapshot, unresolved booking samples, and final
  directory table stay read-only

This lines up with the `2026-05-14` closeout doc, which describes the route as
the read-only directory-plus-governance composition of the published
cost-center contracts.

### 6.2 Approval-summary helper

`git show 9f5397c:apps/tenant-console-web/app/cost-centers/summary.ts` is the
accepted summary helper:

- lines `7-18`: `conditionReferencesCostCenter()` matches scalar condition
  values for `cost_center.code`
- lines `24-34`: `approverReferencesCostCenter()` treats
  `cost_center_owner` with omitted `costCenterCode` as generic/default owner
  routing, which is what `d02ae3f` added
- lines `43-59`: explicit `cost_center.code` conditions now take precedence
  over the generic owner fallback, which is the accepted `9f5397c` fix
- lines `62-75`: final return exposes `totalCount`, `strictCount`, and
  `ownerApprovalCount`

This is the exact logic the reviewer approved at `2026-05-18T07:25:29Z`.

### 6.3 Regression tests

`git show 9f5397c:apps/tenant-console-web/tests/unit/cost-center-summary.test.ts`
anchors the accepted regression coverage:

- lines `21-36`: generic owner approvers count for each cost-center row
- lines `38-75`: explicit owner scoping and unrelated tenant rules stay
  separated
- lines `77-100`: generic owner approvers do not overmatch an explicit
  condition for another cost center
- lines `102-124`: condition-only rules still count when they explicitly scope
  the row

These tests are the concrete evidence for the reviewer note that the fix
prevents rules for one cost center from leaking into another row.

### 6.4 Parity story

`git show 9f5397c:packages/ui-web/src/tenant-cost-centers.stories.tsx` anchors
the parity surface:

- lines `23-255`: `CostCentersBuiltView()` renders the built read-only
  directory/governance view
- line `71`: explicitly calls out the seven-column `TN_CostCenter` artboard
- lines `291-292`: docs description says the Canvas panel embeds
  `Tenant Console.html#costcenter`
- lines `301-308`: exported `CostCenters` story renders `StoryChrome` with
  `anchor="costcenter"`

The parent `review_approved` message explicitly says this parity artifact
remains aligned after the summary fix.

### 6.5 Navigation state

Current branch state also contains the tenant navigation entry at
`git show 9f5397c:apps/tenant-console-web/lib/navigation.ts` lines `72-77`:

- key=`costcenter`
- href=`/cost-centers`
- label=`成本中心`

That aligns with the historical `2026-05-14` closeout note describing the
`Directory -> Cost centers` entry.

## 7. Acceptance Evidence Mapping

The parent acceptance in machine truth remains:

1. `pnpm --filter @drts/tenant-console-web typecheck / build / test`
2. `Storybook 對照對應 TN_* artboard`
3. `若 backend contract 缺，開 blocker 回 discussion_planning，不偷擴 contract`

Mapped evidence:

| Acceptance item | Evidence |
| --- | --- |
| tenant-console-web typecheck / build / test | Owner handoff at `2026-05-18T06:56:30Z` recorded PASS; final fix handoff at `2026-05-18T07:18:53Z` recorded PASS again; reviewer rerun at `2026-05-18T07:25:29Z` passed on detached worktree with `tsc --noEmit`, `next build`, and `vitest run`. |
| Storybook parity vs `TN_CostCenter` | Owner handoff at `2026-05-18T06:56:30Z` recorded `pnpm --filter @drts/ui-web build-storybook` PASS; reviewer approval at `2026-05-18T07:25:29Z` states the parity artifact remained aligned at `packages/ui-web/src/tenant-cost-centers.stories.tsx` `anchor=costcenter`. |
| do not invent missing contract | Historical blocker was reopened only after the contract set was accepted (`BE-CC-001` and companion docs); the route remains explicitly read-only in both the `2026-05-14` closeout doc and the current page/story copy. |

## 8. Reviewer Checklist For `Codex2`

### A. Machine truth still matches this packet

- [ ] `ai-status.json` still records parent `TEN-UI-RD-013` as `done` under
      owner `Codex2`, reviewer `Codex`, commit `edd8433`, push
      `origin/codex2/ten-ui-rd-013`.
- [ ] `ai-status.json` still records this sidecar as owner `Codex`, reviewer
      `Codex2`, helper kind `review_packet`, mutates canonical `false`.
- [ ] The parent `next` field still points at `9f5397c` as the approved source
      fix and `edd8433` as the closeout commit.

### B. Review the correct revision

- [ ] Do not audit parent source by looking at `edd8433` alone; it is a
      metadata-only closeout commit with no further tree delta.
- [ ] Audit the route/story/test surface on `origin/codex2/ten-ui-rd-013`,
      especially commits `1f1e776`, `d02ae3f`, and `9f5397c`.
- [ ] If this sidecar worktree does not contain the parent source files
      directly, use `git show 9f5397c:<path>` or inspect the branch ref rather
      than assuming the support branch working tree equals the shipped surface.

### C. Spot-check the accepted fix

- [ ] `summary.ts` line range `43-59` gives explicit `cost_center.code`
      conditions precedence over generic owner fallback.
- [ ] `summary.ts` line range `24-34` still allows omitted
      `costCenterCode` for generic/default owner routing.
- [ ] The regression test at lines `77-100` proves a rule scoped to another
      cost center does not leak into the current row summary.

### D. Spot-check the read-only route/parity contract

- [ ] `page.tsx` still uses `Promise.allSettled` and `CalloutPanel` for partial
      failures rather than inventing editor commands.
- [ ] The directory table still renders the seven `TN_CostCenter` columns.
- [ ] `tenant-cost-centers.stories.tsx` still exports the side-by-side story
      with `anchor="costcenter"` and the Canvas reference to
      `Tenant Console.html#costcenter`.

### E. Sidecar hygiene

- [ ] The only task-scoped content file for this sidecar is this markdown
      packet under `support/sidecars/TEN-UI-RD-013/`.
- [ ] All state transitions for this sidecar are done through
      `scripts/ai-status.sh` / `python3 scripts/ai_status.py`, never by
      editing canonical machine-truth files directly.

## 9. Reviewer Handoff Notes

1. This sidecar exists because the first owner lane (`Claude2`) failed before
   reaching a terminal status at `2026-05-18T07:29:42Z`; ownership was then
   availability-rebalanced to `Codex` at `2026-05-18T07:30:30Z`.
2. The parent task is already `done`. This packet should therefore be reviewed
   as a post-closeout evidence summary, not as a pre-implementation brief.
3. The historical docs are not noise. They explain why a task that was once
   blocked on missing contract later shows up as shipped on two different
   branches/epochs (`921c456` in the 2026-05-14 closeout docs, then the
   2026-05-18 canonical closeout branch at `origin/codex2/ten-ui-rd-013`).
4. If the reviewer finds drift between machine truth and the branch/commit
   evidence cited here, reopen this sidecar rather than silently editing the
   packet to fit stale assumptions.
5. This is a support-only review packet. If the reviewer approves it, owner
   closeout may use `NO_COMMIT_REQUIRED=1` per `AI_COLLABORATION_GUIDE.md`
   because the task is a non-canonical sidecar artifact.
