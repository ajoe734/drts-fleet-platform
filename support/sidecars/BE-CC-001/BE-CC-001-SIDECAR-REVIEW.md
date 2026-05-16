# BE-CC-001 Review Packet & Evidence Summary

**Sidecar Kind:** `review_packet`
**Parent Task:** `BE-CC-001`
**Parent Owner / Reviewer:** `Codex` / `Codex2`
**Sidecar Owner / Reviewer:** `Codex2` / `Claude`
**Generated:** `2026-05-13` (UTC)
**Snapshot Basis:** `ai-status.json`, `ai-activity-log.jsonl`, `git show`, and `git log`
**Status:** `REVIEW SUPPORT ARTIFACT`

This packet refreshes the earlier stale BE-CC-001 sidecar after the parent
task moved from `review_approved` to `done` at `2026-05-13T05:42:04Z`.
It is support-only and does not modify canonical truth. Its job is to give the
reviewer one place to audit:

- the parent's recorded lifecycle through `done`
- the canonical closeout commit and push metadata
- the reopen fix around tenant-scoped cost-center uniqueness
- the post-closeout branch-tip drift that now exists after the recorded closeout

The most important reviewer caveat is that the recorded BE-CC-001 closeout is
commit `a7c1b9f3ccbc7e02cc6fae3dc2262d4c8b9656dd`, but the current branch tip is
already later at `a2e9607ad79d89393f3e94a73148c0a8b57fbac4`. That later commit
touches `tenant-partner.service.ts` and `tenant-partner.service.test.ts`, so the
reviewer must audit the parent closeout against `a7c1b9f3...` rather than HEAD
alone.

---

## 1. Scope Boundary

In scope:

- snapshot the parent row exactly as machine truth records it today
- summarize the canonical closeout commit, push evidence, and reopen-fix proof
- map the parent acceptance criteria to concrete files and commit contents
- record the later branch-tip drift so the reviewer does not accidentally
  review the wrong revision
- hand the packet to the assigned reviewer without changing the parent task

Out of scope:

- editing L1/L2 product truth
- editing `ai-status.json`, `current-work.md`, or `ai-activity-log.jsonl`
  except through official status commands
- changing the parent implementation files
- deciding whether the later branch-tip commit belongs in a follow-up task;
  this packet only records that the drift exists

---

## 2. Machine-Truth Snapshot

### 2.1 Sidecar row

`ai-status.json` currently records:

- id=`BE-CC-001-SIDECAR-REVIEW`
- owner=`Codex2`
- reviewer=`Claude`
- status=`review_approved`
- last_update=`2026-05-13T07:34:31Z`
- next=`Availability-first reassignment: Codex2 claimed BE-CC-001-SIDECAR-REVIEW while Codex was unavailable or occupied.`
- helper_parent=`BE-CC-001`
- helper_kind=`review_packet`
- mutates_canonical=`false`
- review_notes_zh confirms the packet matches the parent done snapshot at
  `a7c1b9f3...`, the reopen fix, the working-tree anchors, and the explicit
  `a2e9607...` drift warning

This packet has already cleared sidecar review, so the live sidecar status
should still be read from machine truth rather than assumed from this static
snapshot alone.

### 2.2 Parent row

`ai-status.json` currently records:

- id=`BE-CC-001`
- title=`Tenant Cost-Center Directory canonical contract`
- owner=`Codex`
- reviewer=`Codex2`
- status=`done`
- last_update=`2026-05-13T05:42:04Z`
- planning_ref=`docs/05-ui/tenant-canonical-contract-gaps-decision-packet-20260513.md`
- unblocks=`TEN-UI-RD-013`, `TEN-UI-RD-010`, `TEN-UI-RD-014`
- commit_hash=`a7c1b9f3ccbc7e02cc6fae3dc2262d4c8b9656dd`
- commit_subject=`feat(BE-CC-001): add tenant cost-center directory contract`
- commit_agent=`Codex`
- commit_reviewer=`Codex2`
- push_remote=`origin`
- push_branch=`feat/claude2-ui-redesign-foundation`
- push_ref=`origin/feat/claude2-ui-redesign-foundation`
- push_commit=`a7c1b9f3ccbc7e02cc6fae3dc2262d4c8b9656dd`

Recorded `next` field:

> Owner finalized approved tenant cost-center directory contract using commit
> a7c1b9f3ccbc7e02cc6fae3dc2262d4c8b9656dd on
> origin/feat/claude2-ui-redesign-foundation. Scope covers the canonical
> cost-center record/query/command exports, tenant-partner list/detail/upsert/
> disable API surface, repository persistence on ON CONFLICT (tenant_id, code),
> api-client methods, parity-decision update, and regression coverage allowing
> duplicate cost-center codes across different tenants.

### 2.3 Parent lifecycle chain

The parent's authoritative lifecycle in `ai-activity-log.jsonl` is:

| Event             | Timestamp UTC          | Agent    | Note                                                                                             |
| ----------------- | ---------------------- | -------- | ------------------------------------------------------------------------------------------------ |
| `assign`          | `2026-05-13T05:10:25Z` | `Codex`  | Assigned to `Codex` with reviewer `Codex2`.                                                      |
| `start`           | `2026-05-13T05:11:41Z` | `Codex`  | Began cost-center contract/API/client work.                                                      |
| `progress`        | `2026-05-13T05:13:49Z` | `Codex`  | Inspecting contract gaps and implementing API/client surface.                                    |
| `handoff`         | `2026-05-13T05:23:40Z` | `Codex`  | First implementation handoff after typecheck/test/api-client typecheck.                          |
| `reopen`          | `2026-05-13T05:28:53Z` | `Codex2` | Review found an erroneous cross-tenant uniqueness guard in `upsertCostCenter`.                   |
| `progress`        | `2026-05-13T05:31:13Z` | `Codex`  | Removing the guard and adding regression coverage.                                               |
| `handoff`         | `2026-05-13T05:32:43Z` | `Codex`  | Second handoff after the fix.                                                                    |
| `review_approved` | `2026-05-13T05:35:50Z` | `Codex2` | Confirmed lookup is scoped by `(tenantId, code)` and duplicate codes across tenants are allowed. |
| `done`            | `2026-05-13T05:42:04Z` | `Codex`  | Recorded canonical closeout commit/push evidence for `a7c1b9f3...`.                              |

### 2.4 Sidecar lifecycle relevant to this refresh

The sidecar's own audit trail explains why this rewrite was needed and how it
reached owner closeout:

| Event                       | Timestamp UTC          | Agent          | Note                                                                                                                       |
| --------------------------- | ---------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `progress`                  | `2026-05-13T05:43:23Z` | `Claude`       | Refreshed the older packet to a `review_approved` snapshot.                                                                |
| `handoff`                   | `2026-05-13T05:43:44Z` | `Claude`       | Handed the packet to `Codex` for review.                                                                                   |
| `reopen`                    | `2026-05-13T07:06:23Z` | `Codex`        | Packet was stale because the parent had already moved to `done` at `05:42:04Z`.                                            |
| `task_proactive_rebalanced` | `2026-05-13T07:07:15Z` | `Orchestrator` | Availability-first reassignment moved owner from `Claude` to `Codex` and reviewer from `Codex` to `Claude`.                |
| `start`                     | `2026-05-13T07:12:20Z` | `Codex`        | Started this done-state refresh.                                                                                           |
| `handoff`                   | `2026-05-13T07:20:35Z` | `Codex`        | Handed the refreshed done-state packet to `Claude`.                                                                        |
| `review_approved`           | `2026-05-13T07:34:31Z` | `Claude`       | Confirmed the packet matches the parent done snapshot, reopen fix, anchor lines, and explicit post-closeout drift warning. |
| `task_proactive_rebalanced` | `2026-05-13T07:37:54Z` | `Orchestrator` | Availability-first reassignment moved owner from `Codex` to `Codex2` for owner closeout while keeping reviewer `Claude`.   |

---

## 3. Canonical Closeout Evidence

### 3.1 Recorded closeout commit

- commit=`a7c1b9f3ccbc7e02cc6fae3dc2262d4c8b9656dd`
- subject=`feat(BE-CC-001): add tenant cost-center directory contract`
- recorded owner=`Codex`
- recorded reviewer=`Codex2`
- recorded push target=`origin/feat/claude2-ui-redesign-foundation`

`git show --format='%H%n%s%n%n%b' --no-patch a7c1b9f3...` confirms the task
trailers:

- `LLM-Agent: Codex`
- `Task-ID: BE-CC-001`
- `Reviewer: Codex2`
- `Verification: pnpm --filter @drts/api typecheck; pnpm --filter @drts/api test; pnpm --filter @drts/api-client typecheck; git diff --check -- ...`

`git branch -r --contains a7c1b9f3...` confirms the closeout commit is present
on `origin/feat/claude2-ui-redesign-foundation`.

### 3.2 Commit stat summary

`git show --stat --format=fuller a7c1b9f3...` reports:

| File                                                               | Stat       |
| ------------------------------------------------------------------ | ---------- |
| `apps/api/src/modules/tenant-partner/tenant-partner.controller.ts` | `+80 / -1` |
| `apps/api/src/modules/tenant-partner/tenant-partner.repository.ts` | `+50`      |
| `apps/api/src/modules/tenant-partner/tenant-partner.service.ts`    | `+308`     |
| `apps/api/tests/unit/tenant-partner.service.test.ts`               | `+154`     |
| `docs/05-ui/tenant-console-parity-decisions-20260510.md`           | `+16`      |
| `packages/api-client/src/index.ts`                                 | `+47`      |
| `packages/contracts/src/index.ts`                                  | `+36`      |

Total: `7 files changed, 690 insertions(+), 1 deletion(-)`.

---

## 4. Acceptance-to-Evidence Map

### 4.1 Contract exports

`packages/contracts/src/index.ts` adds the canonical directory surfaces:

- `TenantCostCenterRecord` at current working-tree anchor line `1023`
- `ListTenantCostCentersQuery`
- `UpsertTenantCostCenterCommand`
- `DisableTenantCostCenterCommand`
- JSDoc cross-reference on booking `costCenter` fields at lines `1577` and `1611`

### 4.2 Tenant API surface

`apps/api/src/modules/tenant-partner/tenant-partner.controller.ts` exposes:

- `GET /tenant/cost-centers` at current anchor line `339`
- `GET /tenant/cost-centers/:code` at line `365`
- `POST /tenant/cost-centers` at line `380`
- `POST /tenant/cost-centers/disable` at line `396`

### 4.3 Service-layer behavior

The closeout commit adds:

- `listCostCenters`
- `getCostCenter`
- `upsertCostCenter`
- `disableCostCenter`
- seed bootstrap, audit summary, cloning, and code normalization helpers

Current working-tree anchors place the parent methods at:

- `listCostCenters` around line `1236`
- `getCostCenter` around line `1259`
- `upsertCostCenter` around line `1280`
- `disableCostCenter` around line `1383`

The reopen fix accepted at `review_approved` is the parent invariant the reviewer
must audit:

- `upsertCostCenter` looks up an existing record by `(tenantId, code)` only
- repository persistence remains `ON CONFLICT (tenant_id, code)`
- there is no `existingOwnedByOtherTenant` sentinel in the closeout path

### 4.4 Repository persistence

`apps/api/src/modules/tenant-partner/tenant-partner.repository.ts` adds:

- `TenantPartnerState.costCenters`
- persisted `costCenters` changes
- readback from `core.phase1_tenant_cost_centers`
- write path with `ON CONFLICT (tenant_id, code)`

Useful current anchors:

- `costCenters` state line `94`
- persisted changes field line `109`
- deserialization line `300`

### 4.5 Tests

`apps/api/tests/unit/tenant-partner.service.test.ts` carries three parent-facing
test additions:

- list/upsert/disable lifecycle coverage
- repository round-trip persistence coverage
- duplicate cost-center codes across different tenants

The reopened regression case still exists at current working-tree anchor line
`840` with the exact test name:

- `allows duplicate cost-center codes across different tenants`

### 4.6 API client and parity doc

`packages/api-client/src/index.ts` exposes:

- `listCostCenters` at current anchor `1246`
- `getCostCenter` at `1267`
- `upsertCostCenter` at `1273`
- `disableCostCenter` at `1281`

`docs/05-ui/tenant-console-parity-decisions-20260510.md` now begins with the
`2026-05-13 Implementation Update` section at line `3`, recording the new
contract types, routes, and the unblock note for `TEN-UI-RD-013`.

### 4.7 Verification evidence recorded by the parent

The parent's recorded verification set is:

- `pnpm --filter @drts/api typecheck`
- `pnpm --filter @drts/api test`
- `pnpm --filter @drts/api-client typecheck`
- `git diff --check -- packages/contracts/src/index.ts packages/api-client/src/index.ts docs/05-ui/tenant-console-parity-decisions-20260510.md apps/api/src/modules/tenant-partner/ apps/api/tests/unit/tenant-partner.service.test.ts`

This sidecar did not rerun those commands; it records the existing closeout
evidence and commit metadata.

---

## 5. Post-Closeout Drift Since the Recorded Done Commit

This is the critical review trap.

`git log --oneline a7c1b9f3..HEAD -- apps/api/src/modules/tenant-partner/tenant-partner.service.ts apps/api/tests/unit/tenant-partner.service.test.ts`
shows one later branch-tip commit:

- `a2e9607 feat(BE-CC-001): validate booking costCenter against tenant directory + followup spec packet`

`git diff --stat a7c1b9f3... -- apps/api/src/modules/tenant-partner/tenant-partner.service.ts apps/api/tests/unit/tenant-partner.service.test.ts`
shows the branch-tip delta beyond the recorded closeout:

- `tenant-partner.service.ts`: `+55`
- `tenant-partner.service.test.ts`: `+105`

That later commit adds:

- `TenantPartnerService.validateBookingCostCenter(...)` at current anchor line
  `1434`
- two new validation-focused tests beginning at current anchor line `873`
- additional owned-mobility + follow-up decision-packet work outside the parent
  closeout snapshot

Important interpretation:

- machine truth still records `BE-CC-001` as done on `a7c1b9f3...`
- branch tip `a2e9607...` is newer and contains extra behavior
- therefore the reviewer should treat `a7c1b9f3...` as the parent closeout
  target, and treat `a2e9607...` only as later drift that must not be confused
  with the recorded done-state packet

Files that do **not** drift relative to the recorded closeout commit:

- `packages/contracts/src/index.ts`
- `packages/api-client/src/index.ts`
- `docs/05-ui/tenant-console-parity-decisions-20260510.md`
- `apps/api/src/modules/tenant-partner/tenant-partner.controller.ts`
- `apps/api/src/modules/tenant-partner/tenant-partner.repository.ts`

---

## 6. Reviewer Checklist

Reviewer `Claude` should verify:

- `ai-status.json` still records parent `BE-CC-001` as `done` with commit
  `a7c1b9f3ccbc7e02cc6fae3dc2262d4c8b9656dd` and push target
  `origin/feat/claude2-ui-redesign-foundation`
- `git branch -r --contains a7c1b9f3...` still includes
  `origin/feat/claude2-ui-redesign-foundation`
- the closeout commit contains the canonical contract exports, tenant cost-center
  controller routes, repository persistence, api-client methods, parity note,
  and the duplicate-code regression test
- the reopen fix is present in the closeout commit:
  `upsertCostCenter` scopes existing-record lookup to `(tenantId, code)` and
  does not reject another tenant's code
- this packet explicitly distinguishes the recorded done commit `a7c1b9f3...`
  from the later branch-tip commit `a2e9607...`
- this sidecar remains support-only and does not edit canonical truth

Suggested audit commands:

```bash
git show --stat --format=fuller a7c1b9f3ccbc7e02cc6fae3dc2262d4c8b9656dd --
git branch -r --contains a7c1b9f3ccbc7e02cc6fae3dc2262d4c8b9656dd
git show a7c1b9f3ccbc7e02cc6fae3dc2262d4c8b9656dd:apps/api/src/modules/tenant-partner/tenant-partner.service.ts | rg "upsertCostCenter|existingOwnedByOtherTenant"
git show a7c1b9f3ccbc7e02cc6fae3dc2262d4c8b9656dd:apps/api/tests/unit/tenant-partner.service.test.ts | rg "allows duplicate cost-center codes across different tenants"
git log --oneline a7c1b9f3ccbc7e02cc6fae3dc2262d4c8b9656dd..HEAD -- apps/api/src/modules/tenant-partner/tenant-partner.service.ts apps/api/tests/unit/tenant-partner.service.test.ts
```

---

## 7. Handoff Notes

This packet has already passed sidecar review and is ready for owner closeout.

Historical reviewer actions:

- pass:
  `AI_NAME=Claude scripts/ai-status.sh approve BE-CC-001-SIDECAR-REVIEW "<review conclusion>"`
- fail:
  `AI_NAME=Claude scripts/ai-status.sh reopen BE-CC-001-SIDECAR-REVIEW "<what is stale or incorrect>"`
- blocked:
  `AI_NAME=Claude scripts/ai-status.sh blocker BE-CC-001-SIDECAR-REVIEW "<external blocker>"`

Sidecar closeout remains support-only. The sidecar reviewer should judge whether
this packet now matches machine truth for the parent's recorded `done` state and
whether the branch-tip drift warning is sufficiently explicit for future audits.

---

## 8. Refresh Evidence For This Packet

Commands used during this refresh:

- `sed -n '16880,17140p' ai-status.json`
- `rg -n '"task_id": "BE-CC-001"' ai-activity-log.jsonl | tail -n 20`
- `rg -n '"task_id": "BE-CC-001-SIDECAR-REVIEW"' ai-activity-log.jsonl | tail -n 20`
- `git show --stat --format=fuller a7c1b9f3ccbc7e02cc6fae3dc2262d4c8b9656dd --`
- `git show --format='%H%n%s%n%n%b' --no-patch a7c1b9f3ccbc7e02cc6fae3dc2262d4c8b9656dd`
- `git branch -r --contains a7c1b9f3ccbc7e02cc6fae3dc2262d4c8b9656dd`
- `git diff --stat a7c1b9f3ccbc7e02cc6fae3dc2262d4c8b9656dd -- apps/api/src/modules/tenant-partner/tenant-partner.service.ts apps/api/tests/unit/tenant-partner.service.test.ts`
- `git log --oneline --decorate --no-merges a7c1b9f3ccbc7e02cc6fae3dc2262d4c8b9656dd..HEAD -- apps/api/src/modules/tenant-partner/tenant-partner.service.ts apps/api/tests/unit/tenant-partner.service.test.ts`
- `git show --stat --format=fuller a2e9607 --`
- targeted `rg -n` lookups on contracts, controller, repository, service,
  tests, api-client, and parity-doc anchors

No canonical truth files were edited to create this packet. Only this support
artifact is in scope.
