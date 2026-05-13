# BE-LOAD-001 Sidecar Acceptance Packet

**Sidecar Kind:** `acceptance_packet`
**Parent Task:** `BE-LOAD-001` — Tenant quota concurrent reservation load test
**Parent Owner:** `Codex`
**Parent Reviewer:** `Codex2`
**Sidecar Owner:** `Claude2`
**Sidecar Reviewer:** `Codex`
**Generated:** `2026-05-13` (UTC, packet rev1)
**Snapshot anchor (parent `last_update`):** `2026-05-13T17:23:30Z`
**Snapshot anchor (sidecar `last_update`):** `2026-05-13T17:29:42Z`
**Status:** `ACCEPTANCE SUPPORT ARTIFACT` — support-only; does not modify
canonical truth, runtime behavior, contract surface, or the parent task's
implementation files.

This packet is a reviewer-facing companion to `BE-LOAD-001`. The parent
task is the canonical load-test slice that lives downstream of
`BE-QUOTA-001` (now `done` at commit
`73b53eedd0c7c96549b36a6fe813c6acb870bbb1`). The work itself is a
**single new test file** — `apps/api/tests/load/tenant-quota-concurrent-reserve.test.ts` —
that exercises the `reserveTenantQuota` flow under real contention
against a `bookingCountLimit=1` / `amountMinorLimit=100` policy and
proves the `SELECT ... FOR UPDATE` discipline shipped under
`BE-QUOTA-001` actually serialises concurrent reservers cleanly.

This packet pins the planning anchor, the upstream machine-truth
dependency on `BE-QUOTA-001`, the acceptance checklist the reviewer
should walk against the in-flight working-tree test, the contention
discipline expected of the test double, and the **commit-evidence
hazard** that the file is currently untracked in the working tree (no
canonical commit landed yet at packet generation time).

**Current-state caveat.** Every owner / reviewer / status / commit /
timestamp value below is the snapshot read out of `ai-status.json` at
the timestamps anchored in the header. The lifecycle fields move
quickly. Any reviewer reading this packet must first re-read
`ai-status.json` for the live values and treat the live values as
authoritative if they have drifted from the snapshots below. This
packet is not a substitute for machine truth.

Transient lifecycle truth (`status`, `next`, `last_update`,
`commit_hash`, `push_*` fields, reviewer messages) remains authoritative
only in `ai-status.json` and `ai-activity-log.jsonl`. This packet
snapshots the most recent values for reviewer convenience but does not
replace machine truth.

---

## 1. Scope Boundary

In scope:

- restate the parent acceptance bar as a concrete reviewer checklist
  keyed to the parent task entry in `ai-status.json → BE-LOAD-001`
  (acceptance list) and to the working-tree test file
  `apps/api/tests/load/tenant-quota-concurrent-reserve.test.ts`
- pin the hard upstream machine-truth dependency on `BE-QUOTA-001`
  (now `done`, commit `73b53ee`) and the contract surface the test
  consumes
- record the contention discipline the test double must enforce so the
  `SELECT ... FOR UPDATE` requirement is **actually proven** — not just
  unit-asserted at the application layer
- record the vitest-include surface (`tests/load/**/*.test.ts` in the
  repo-root `vitest.config.ts`) so the reviewer knows the test is
  resolvable from `pnpm --filter @drts/api test`
- record the **commit-evidence hazard**: the test file is untracked in
  the working tree at packet generation time and must be tracked and
  committed under the parent task's canonical implementation
  commit-evidence rule before parent `done` can be claimed
- frame the downstream consumers (`BE-APR-001`, in-progress at packet
  generation) so the reviewer understands why proving the race-safe
  ledger now matters for the approval-workflow slice that depends on
  the same reservation primitive

Out of scope:

- editing L1/L2 product truth, the parent task entry in
  `ai-status.json`, or any working-tree implementation files
  (`packages/contracts/src/index.ts`,
  `apps/api/src/modules/tenant-partner/tenant-partner.service.ts`,
  `apps/api/src/modules/tenant-partner/tenant-quota-ledger.ts`,
  `apps/api/src/modules/tenant-partner/tenant-partner.repository.ts`,
  the load-test file itself)
- producing the parent slice's canonical implementation, typecheck, or
  test runs; this sidecar only frames the acceptance bar
- mutating or "absorbing" the parent task; the parent must still
  complete its own canonical closeout (`done` with commit + push
  evidence under the canonical implementation commit-evidence rule)
- redesigning the contention-test approach away from the in-memory
  double — the parent owner has already chosen the in-memory
  `ContendedQuotaRepository` shape and this packet only records the
  contention assertions the reviewer should look for
- expanding into the sibling slice `BE-APR-001` (approval workflow)
  which has its own owner / reviewer lanes in `ai-status.json`

---

## 2. Machine Truth Anchors

### 2.1 Sidecar (this task) — `ai-status.json → BE-LOAD-001-SIDECAR-ACCEPTANCE`

- id=`BE-LOAD-001-SIDECAR-ACCEPTANCE`
- title=`Prepare BE-LOAD-001 acceptance packet and dependency map`
- owner=`Claude2`
- reviewer=`Codex`
- phase=`Wave 3 Contract Unblockers`
- depends_on=`[BE-QUOTA-001]`
- task_class=`sidecar`
- helper_parent=`BE-LOAD-001`
- helper_kind=`acceptance_packet`
- mutates_canonical=`false`
- auto_generated=`true`
- auto_created_by=`supervisor-underutilization`
- artifacts=`support/sidecars/BE-LOAD-001/BE-LOAD-001-SIDECAR-ACCEPTANCE.md`
- acceptance=
  - `Create support artifacts only`
  - `Do not edit canonical truth`
  - `Hand off the packet to the assigned reviewer`
- live lifecycle fields (`status`, `next`, `last_update`) deferred to
  `ai-status.json`

### 2.2 Parent — `ai-status.json → BE-LOAD-001` (snapshot at packet rev1, `last_update=2026-05-13T17:23:30Z`)

- id=`BE-LOAD-001`
- title=`Tenant quota concurrent reservation load test`
- summary_zh=`Quota 並發競爭壓力測試：模擬 10 個同時 reserveTenantQuota
對同一個剩 1 unit 的額度，驗證 SELECT FOR UPDATE / 原子 reserve 在真實
競爭下只放行一筆並乾淨回 QUOTA_INSUFFICIENT_AT_COMMIT 給其他 9 筆，
無 ledger 髒資料、無計數器漂移、無 lock timeout。`
- phase=`Wave 3 Contract Unblockers`
- owner=`Codex`
- reviewer=`Codex2`
- status=`in_progress` (snapshot; reviewer must re-read live)
- depends_on=`[BE-QUOTA-001]` (now `done`, commit `73b53ee`)
- planning_ref=`docs/03-runbooks/tenant-governance-wave-execution-packet-20260513.md`
- mutates_canonical=`true`
- artifacts (declared in `ai-status.json`):
  - `apps/api/tests/load/tenant-quota-concurrent-reserve.test.ts` (new
    file; **untracked in working tree at packet generation time**)
- acceptance (declared in `ai-status.json`, 9 bullets — see §5 for the
  reviewer-walk against the working-tree test):
  - new `apps/api/tests/load/tenant-quota-concurrent-reserve.test.ts`
    (new file / new directory if not exist)
  - spawn 10 concurrent reserve calls against a quota with
    `bookingCountLimit=1` + `currentUsed=0`
  - exactly one winner; other 9 throw `QUOTA_INSUFFICIENT_AT_COMMIT`
  - ledger has exactly 1 reserve entry (no orphan / dup writes)
  - monthly snapshot `bookingCountReserved == 1` (no double-count)
  - repeat with `amount_minor` dimension, 10 concurrent reserves of
    100 minor against `amountMinorLimit=100`
  - repeat with mixed scope (tenant `hard_block` + cost-center
    `warn_only`) — tenant block wins
  - test runs `< 30 seconds`, no external service (in-memory or test
    PG)
  - `pnpm --filter @drts/api test` passes including the new file
- `next` (verbatim from `ai-status.json` at snapshot):
  > Inspecting current concurrent quota reserve load test and wiring
  > real contention coverage.
- no `commit_hash` / `commit_subject` / `push_remote` / `push_branch`
  recorded yet — parent has not produced a canonical commit (see §6
  commit-evidence hazard).

### 2.3 Hard upstream dependency — `BE-QUOTA-001`

- id=`BE-QUOTA-001`
- title=`Tenant Quota / Usage Read-Model + atomic ledger`
- owner=`Codex`
- reviewer=`Codex2`
- status=`done`
- mutates_canonical=`true`
- commit_hash=`73b53eedd0c7c96549b36a6fe813c6acb870bbb1`
- commit_subject=`fix(BE-QUOTA-001): add quota persistence migration and DB-path coverage`
- push_remote=`origin`
- push_branch=`feat/claude2-ui-redesign-foundation`
- the published surface that `BE-LOAD-001` exercises is the
  `TenantPartnerService.reserveTenantQuota(input)` method (the new
  `tenant-quota-ledger.ts` file plus the persistence contract on
  `tenant-partner.repository.ts`), the audit-emitting service-layer
  upsert `upsertTenantQuotaPolicy`, and the published summary helpers
  `getTenantQuotaSummary` / `getCostCenterQuotaSummary` /
  `listTenantQuotaLedger`. All of those are imported by the load test
  via the service entry point, not the repository entry point.
- the persistence-side V0023 migration shipped with the same commit
  switches quota policy/snapshot upserts to null-aware partial-index
  conflict targets and covers the SQL-backed reservation path so
  `reserveTenantQuota` honours caller transactions and hard-blocks
  before persistence on locked over-limit snapshots. The load test does
  not exercise the SQL path — it uses an in-memory
  `ContendedQuotaRepository` double — but it does exercise the
  service-layer `SELECT FOR UPDATE` discipline by routing every
  reserver through the same `withTransaction` / `lockRows` /
  `loadQuotaPoliciesForUpdate` / `loadQuotaMonthlySnapshotsForUpdate`
  sequence.

### 2.4 Sibling Wave 3 Contract Unblockers (informational, snapshot at packet rev1)

| Sibling task   | Status        | Owner / Reviewer    | Depends on                    | Relevance to `BE-LOAD-001`                                                                                                                                                                                                             |
| -------------- | ------------- | ------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BE-CC-001`    | `done`        | `Codex` / `Codex2`  | —                             | Transitive dependency through `BE-QUOTA-001`. Cost-center directory is the key the cost-center-scoped policy attaches to. Shipped under commit `a7c1b9f`.                                                                              |
| `BE-QUOTA-001` | `done`        | `Codex` / `Codex2`  | `BE-CC-001`                   | Direct hard dependency. Publishes `reserveTenantQuota` and the policy / ledger / snapshot surface this load test consumes. Shipped under commit `73b53ee`.                                                                             |
| `BE-RULE-001`  | `done`        | `Claude` / `Codex2` | `BE-CC-001`                   | Sibling Wave 3 slice. Does not consume the load-test surface. Shipped under commit `c0f533c`.                                                                                                                                          |
| `BE-APR-001`   | `in_progress` | `Codex` / `Codex2`  | `BE-RULE-001`, `BE-QUOTA-001` | Downstream consumer. Approval-workflow `createApprovalRequest` calls `reserveTenantQuota` inside the booking-write transaction. Proving the race-safe semantics now (under `BE-LOAD-001`) reduces approval-flow regression risk later. |

`BE-LOAD-001` does not block `BE-APR-001` in machine truth — the
approval slice is already `in_progress`. But landing this load test
before `BE-APR-001` reaches `done` gives the approval reviewer a
defended invariant ("no race-condition in `reserveTenantQuota`") to
lean on instead of having to re-prove it inside the approval test
matrix.

### 2.5 Authoritative supporting documents

- `docs/03-runbooks/tenant-governance-wave-execution-packet-20260513.md`
  is the canonical planning anchor for the whole tenant-governance
  wave. Section 4.3 contains the full `BE-QUOTA-001` spec including
  the `reserveTenantQuota(tx, input)` pseudo-code with the 7-step
  `SELECT FOR UPDATE` flow. The load test in `BE-LOAD-001` is the
  empirical proof that that flow holds under contention.
- `support/sidecars/BE-QUOTA-001/BE-QUOTA-001-SIDECAR-ACCEPTANCE.md`
  is the sibling acceptance packet for the upstream slice. It records
  the contract surface, the audit-event shape, and the in-flight
  reconciliation hazard the parent owner of `BE-QUOTA-001` addressed
  before reaching `done`. It is historical context for this packet and
  may help the `BE-LOAD-001` reviewer understand the rev2-vs-rev3
  contract-shape evolution.
- `packages/contracts/src/index.ts` (frozen at `BE-QUOTA-001` `done`)
  defines `TenantQuotaLedgerEntry`, `TenantQuotaPolicyRecord`,
  `TenantQuotaUsage`, `TenantQuotaEnforcementMode`, and the
  `QUOTA_INSUFFICIENT_AT_COMMIT` error-code surface the load test
  asserts against.
- `apps/api/src/modules/tenant-partner/tenant-quota-ledger.ts`
  publishes the `toTenantQuotaPeriodKey` helper the load test imports
  to derive the Asia/Taipei monthly period key from
  `RESERVATION_WINDOW_START`.
- `vitest.config.ts` (repo root) declares
  `include = ["tests/unit/**/*.test.ts", "tests/load/**/*.test.ts"]`.
  When `pnpm --filter @drts/api test` runs from `apps/api/`, vitest
  walks up to the root config and resolves those globs against the
  package cwd, so the new file under `apps/api/tests/load/` is
  discoverable.

---

## 3. Contention Discipline Anchors

The parent task's most important non-bullet acceptance bar is
**"verify SELECT FOR UPDATE / atomic reserve in real contention only
admits one"**. A test that just calls `reserveTenantQuota` ten times
sequentially or fakes serialisation at the application layer does NOT
prove this. The working-tree test addresses this by:

- driving 10 reservers through a single `TenantPartnerService` instance
  (`createService()` wires one repository double to one service) so
  every reserver hits the same `withTransaction` boundary
- forcing every reserver to wait at a `createReleaseGate()` until all
  10 are queued, so the `Promise.allSettled` race starts simultaneously
- routing every `loadQuotaPoliciesForUpdate` / `loadQuotaMonthlySnapshotsForUpdate`
  call through `lockRows` → `acquireLock`, which models row-level
  locks keyed by `policy:tenantId:costCenterCode:period` and
  `snapshot:tenantId:costCenterCode:period:periodKey` (sorted before
  acquisition to avoid deadlocks)
- recording contention stats (`transactionCount`,
  `maxConcurrentTransactions`, `lockWaitCount`) and asserting
  `expectRealContention()` at the end of every scenario:
  - `transactionCount === CONCURRENCY` (`10`) — all 10 reservers
    actually entered `withTransaction`
  - `maxConcurrentTransactions === CONCURRENCY` (`10`) — they were
    concurrent, not serialised by the caller
  - `lockWaitCount >= CONCURRENCY - 1` (`9`) — at least 9 reservers
    actually queued on a held lock, not bypassed it

Reviewer should not accept the test if `expectRealContention` is
weakened, removed, or replaced by a less stringent assertion. The
parent owner has wired this gate intentionally so that an in-memory
double cannot "cheat" the contention proof.

The lock-key ordering (alphabetical sort in `lockRows`) is deliberate:
it removes the lock-order non-determinism that would otherwise let a
reserver acquire `snapshot:` before `policy:` (or vice versa) and
deadlock with another reserver going the other way. The reviewer
should preserve this invariant — if the double's `lockRows` is rewritten
to acquire in input order, the test becomes deadlock-prone under
higher CONCURRENCY.

---

## 4. Test Surface Summary

The single working-tree file
`apps/api/tests/load/tenant-quota-concurrent-reserve.test.ts` declares:

- `CONCURRENCY = 10`
- `TENANT_ID = "tenant-demo-001"`
- `COST_CENTER_CODE = "CC-FIN-04"`
- `RESERVATION_WINDOW_START = "2026-05-13T10:00:00.000Z"`
- `PERIOD_KEY` derived via `toTenantQuotaPeriodKey(RESERVATION_WINDOW_START)`

It exposes a single `describe("tenant quota concurrent reserve load")`
block with three `it()` scenarios:

1. **`lets exactly one caller claim the last booking-count unit`**
   - policy: `bookingCountLimit=1`, `amountMinorLimit=null`,
     `enforcementMode="hard_block"`, `currency="TWD"`
   - asserts: 1 fulfilled, 9 rejected with
     `QUOTA_INSUFFICIENT_AT_COMMIT`; ledger has 1 entry; monthly
     snapshot `bookingCountReserved=1`; summary `bookingCountReserved=1`
   - covers acceptance bullets 2–5 + 8
2. **`lets exactly one caller reserve the final amount_minor capacity`**
   - policy: `bookingCountLimit=null`, `amountMinorLimit=100`,
     `enforcementMode="hard_block"`, `currency="TWD"`
   - all 10 reservers ask for `estimatedAmountMinor=100`,
     `currency="TWD"`
   - asserts: 1 fulfilled, 9 rejected with
     `QUOTA_INSUFFICIENT_AT_COMMIT` and `details.dimension="amount_minor"`;
     ledger has 2 entries (1 `booking_count` + 1 `amount_minor` for
     the same winner); monthly snapshot
     `bookingCountReserved=1, amountMinorReserved=100`
   - covers acceptance bullet 6
3. **`prefers the tenant hard block over a cost-center warn-only policy`**
   - tenant policy: `bookingCountLimit=1`, `hard_block`
   - cost-center policy: `bookingCountLimit=1`, `warn_only`,
     `costCenterCode=CC-FIN-04`
   - all 10 reservers attach `costCenterCode=CC-FIN-04`
   - asserts: 1 fulfilled, 9 rejected with `details.costCenterCode=null`
     (the rejection is attributed to the **tenant** scope, not the
     cost-center scope); ledger has 2 entries (`booking_count`
     at both scopes for the winner); tenant summary
     `bookingCountReserved=1`; cost-center summary
     `enforcementMode="warn_only"`, `bookingCountReserved=1`
   - covers acceptance bullet 7

Each scenario ends with `expectRealContention(repository)` as the
contention proof gate.

---

## 5. Acceptance Walk for the Reviewer

The reviewer should walk these in order against the working-tree test
file at parent handoff time:

| #   | Acceptance bullet (verbatim from `ai-status.json → BE-LOAD-001`)                                                  | Where to verify                                                                                                                                                                                              | Notes for reviewer                                                                                                                                                                                                                                                                     |
| --- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 新增 `apps/api/tests/load/tenant-quota-concurrent-reserve.test.ts` (新檔案 / 新目錄 if not exist)                 | `git ls-files apps/api/tests/load/` and `git log --oneline -1 -- apps/api/tests/load/tenant-quota-concurrent-reserve.test.ts`                                                                                | At packet generation time the file exists in the working tree but is **untracked**. Reviewer must verify the parent task's canonical commit tracks it (see §6 commit-evidence hazard).                                                                                                 |
| 2   | Spawn 10 concurrent reserve calls against a quota with `bookingCountLimit=1` + `currentUsed=0` (1 unit remaining) | `apps/api/tests/load/tenant-quota-concurrent-reserve.test.ts` scenario 1 (`lets exactly one caller claim the last booking-count unit`); `CONCURRENCY = 10` constant                                          | `runConcurrentReserves` queues 10 reservers behind a single `createReleaseGate()` then resolves it once — all 10 contend on the same `withTransaction` boundary.                                                                                                                       |
| 3   | Assert exactly one wins; the other 9 throw `QUOTA_INSUFFICIENT_AT_COMMIT`                                         | scenario 1 — `expect(winners).toHaveLength(1)` and `expect(quotaErrors).toHaveLength(9)`; `extractQuotaErrors` asserts each rejection is an `ApiRequestError` with `code === "QUOTA_INSUFFICIENT_AT_COMMIT"` | The error-code assertion is inside the helper, not the scenario body, so reviewer must read `extractQuotaErrors` to confirm. The helper does both `instanceof ApiRequestError` and the `response.error.code` check.                                                                    |
| 4   | Assert ledger has exactly 1 reserve entry (no orphan / dup writes)                                                | scenario 1 — `expect(serviceLedger).toHaveLength(1)`, `expect(repositoryState.quotaLedger).toHaveLength(1)`, `expect(uniqueBookingIds(repositoryState.quotaLedger)).toEqual([winnerBookingId])`              | Reviewer must confirm both the **service-layer** view (`listTenantQuotaLedger`) and the **repository-layer** view (`repository.getState().quotaLedger`) agree. A divergence would indicate orphan writes on the rollback path.                                                         |
| 5   | Assert monthly snapshot `bookingCountReserved == 1` (no double-count)                                             | scenario 1 — `expect(repositoryState.quotaMonthlySnapshots).toEqual([expect.objectContaining({ usage: expect.objectContaining({ bookingCountReserved: 1 }) })])`; `summary.usage.bookingCountReserved === 1` | The repository-side snapshot is a single record (not an array of length 10) — that is the no-double-count proof. The summary call routes through `getTenantQuotaSummary` so both the persistence-side and service-side views agree.                                                    |
| 6   | Repeat with `amount_minor` dimension and 10 concurrent reserves of 100 minor against `limit=100`                  | scenario 2 (`lets exactly one caller reserve the final amount_minor capacity`)                                                                                                                               | The policy intentionally leaves `bookingCountLimit=null` so only the `amount_minor` axis can block. Reviewer should verify the rejection `details.dimension === "amount_minor"` (asserted in scenario 2). Ledger length is 2, not 1, because the winner records both axes.             |
| 7   | Repeat with mixed scope (tenant policy `hard_block` + cost-center policy `warn_only`) — tenant block wins         | scenario 3 (`prefers the tenant hard block over a cost-center warn-only policy`)                                                                                                                             | Reviewer should verify the rejection `details.costCenterCode === null` (9 rejections, all attributed to the **tenant** scope). This proves the scope-precedence rule — a warn-only cost-center policy does not soften a hard-block tenant policy.                                      |
| 8   | Test runs in `< 30 seconds` and uses no external service (in-memory or test PG)                                   | `ContendedQuotaRepository` class in the test file; no `pg` / network / fs handles                                                                                                                            | The double is fully in-memory. Reviewer should spot-check that no fixture spins up a Postgres container, no `pg.Client`, no fetch, no fs writes. Wall-clock budget should be a few hundred ms at most — the contention is microtask-scheduled.                                         |
| 9   | `pnpm --filter @drts/api test` passes including new file                                                          | `pnpm --filter @drts/api test` from repo root (or `apps/api/`); confirm the run picks up `tests/load/tenant-quota-concurrent-reserve.test.ts`                                                                | Vitest resolves `test.include = ["tests/unit/**/*.test.ts", "tests/load/**/*.test.ts"]` against the package cwd, so the new file under `apps/api/tests/load/` is discoverable. Reviewer should also confirm the previously-passing 30-file / 327-test count from `BE-QUOTA-001` grows. |

Additional reviewer-side checks the bullet list does not call out
explicitly but the contention discipline requires:

- `expectRealContention(repository)` is called at the end of every
  scenario (it lives in the test file, not the production code) — it
  asserts `transactionCount === 10`, `maxConcurrentTransactions === 10`,
  and `lockWaitCount >= 9`. If a scenario is later weakened to remove
  this gate, the contention proof is gone.
- The `withTransaction` boundary in the double **must commit** all
  staged ledger entries and monthly snapshots only on success and
  **must release locks** in `finally` regardless of outcome (the
  working-tree double does both). Reviewer should spot-check that
  the test does not silently bypass the rollback path on the loser
  side — losers throw before `persistQuotaReservation`, so the
  pending maps stay empty and `commitTransaction` is a no-op for them.
- All three scenarios use the **same** `RESERVATION_WINDOW_START`, so
  they land in the same Asia/Taipei monthly period. This is what makes
  the snapshot-uniqueness assertion meaningful (a different period key
  would split the monthly snapshot into two and trivially satisfy
  "length 1").

---

## 6. Commit-Evidence Hazard

The parent task `BE-LOAD-001` has `mutates_canonical=true`, so under
the canonical implementation commit-evidence rule its `done` requires:

- a local git commit
- `COMMIT_HASH` and `COMMIT_SUBJECT` provided to `scripts/ai-status.sh done`
- commit subject includes the task id (e.g. `test(BE-LOAD-001): ...`)
- commit body trailers:
  - `LLM-Agent: Codex`
  - `Task-ID: BE-LOAD-001`
  - `Reviewer: Codex2`
- a normal non-force push with `PUSH_REMOTE` and `PUSH_BRANCH`

At packet generation time (`2026-05-13T17:30Z`):

- the test file exists in the working tree at
  `apps/api/tests/load/tenant-quota-concurrent-reserve.test.ts`
- `git status` reports the file as **untracked** under
  `apps/api/tests/load/`
- `git ls-files apps/api/tests/load/` returns **empty**
- `git log -- apps/api/tests/load/` returns **no commits**
- no `commit_hash` / `commit_subject` / `push_*` fields appear on the
  `BE-LOAD-001` row in `ai-status.json`

This is consistent with the parent task being `in_progress`, but the
reviewer must verify at handoff time that:

1. the new directory `apps/api/tests/load/` and the new file
   `apps/api/tests/load/tenant-quota-concurrent-reserve.test.ts` are
   both tracked under the parent's canonical commit
2. the commit body carries the three required trailers above
3. the push lands on `feat/claude2-ui-redesign-foundation` (the active
   working branch) without `--force`
4. the canonical implementation rule is fully honoured before
   `ai-status.sh done BE-LOAD-001` is invoked

If the parent owner handoff arrives with the file still untracked, the
reviewer should `reopen` and not `approve`. There is no sidecar /
`NO_COMMIT_REQUIRED` exemption available for `BE-LOAD-001` itself —
that flag is reserved for support-only artifacts like this packet, not
for canonical test slices that the wave depends on.

---

## 7. Downstream Risk Map

`BE-LOAD-001` does not unblock or formally depend on anything other
than `BE-QUOTA-001`, but its empirical proof of race-safety is load-
bearing for two downstream concerns:

- **`BE-APR-001` (approval workflow)** is in-progress at packet
  generation. Its `createApprovalRequest` flow calls
  `reserveTenantQuota` inside the booking-write transaction and folds
  the result into a `TenantApprovalEvaluationResult`. If `BE-LOAD-001`
  later flushes out a race condition in `reserveTenantQuota`, the
  approval-flow tests would need to be re-derived under the same
  contention model. Landing `BE-LOAD-001` first gives the approval
  reviewer a defended invariant.
- **Future migration to a real PG harness.** The current double is
  in-memory but mirrors the `loadQuotaPoliciesForUpdate` /
  `loadQuotaMonthlySnapshotsForUpdate` / `persistQuotaReservation`
  shape of the repository interface. If a follow-up slice wires a
  real PG container into `apps/api/tests/load/`, the scenarios should
  port over without API changes — the contract surface used here
  (`reserveTenantQuota`, the policy upsert, the summary helpers) is
  the same surface the production path uses. This is not in scope for
  `BE-LOAD-001` but is the natural next-step for any tenant-governance
  hardening wave that wants real-DB contention coverage.

The reviewer should not let either concern expand the scope of
`BE-LOAD-001` itself. The parent owner has scoped the slice to the
in-memory contention proof; the SQL-path coverage is already shipped
under `BE-QUOTA-001` commit `73b53ee` (its commit message explicitly
says it "covers the SQL-backed reservation path so `reserveTenantQuota`
honors caller transactions and hard-blocks before persistence on
locked over-limit snapshots").

---

## 8. Reviewer Handoff Checklist

When the parent task handoff lands in the reviewer queue
(`AI_NAME=Codex2 scripts/ai-status.sh approve BE-LOAD-001 ...` or
`reopen`), the reviewer should:

1. re-read `ai-status.json → BE-LOAD-001` for live `status`,
   `commit_hash`, `commit_subject`, `push_remote`, `push_branch`
2. confirm the commit referenced by `commit_hash` exists locally
   and that it tracks `apps/api/tests/load/tenant-quota-concurrent-reserve.test.ts`
3. walk §5 acceptance table top-to-bottom against the file at that
   commit (not the working-tree HEAD if they have drifted)
4. spot-check the contention discipline in §3 — especially
   `expectRealContention` and the lock-key sort in `lockRows`
5. run `pnpm --filter @drts/api test` and confirm the load file is
   picked up by vitest's `tests/load/**/*.test.ts` glob, and that the
   total-tests count grew over the `BE-QUOTA-001`-time baseline
6. if everything holds, `approve` with a brief review note pointing at
   the contention proof and the three scenarios
7. if any check fails, `reopen` or `blocker` with a specific cite
   (file + line + which acceptance bullet)

This packet does not modify `ai-status.json` and does not represent
machine truth. Reviewer must always defer to the live `ai-status.json`
and `ai-activity-log.jsonl` values.
