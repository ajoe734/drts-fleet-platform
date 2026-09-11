# SR-PUSH-DURABILITY-20260911 — Durable Push Claims, Receipt Persistence, Error Propagation

Owner：Claude2；Reviewer：Claude。日期：2026-09-11 UTC。

## 1. 版本與追溯 (Version & Traceability)

- **工作分支 (Branch)**：`claude/sr-push-durability-20260911`
- **工作樹目錄 (Worktree)**：`/home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/claude2-sr-push-durability-20260911`
- **基準 SHA (Base SHA)**：`e2e17cb8d0465f203d788b2301476abb75b811a8` (`git merge-base HEAD origin/dev`; the `SR-RECOVERY-CONTRACTS-20260911` merge that reserved the `V0098`–`V0100` migration allocations)
- **候選 SHA (Candidate SHA)**：`8350f8387e1ef09a9b8d90731d177535319e554e`
- **規劃參照 (Planning Reference)**：`docs/04-uat/system-remediation-20260906/source/capabilities.json`
- **路由依據 (Routing authority)**：`support/unblock/SR-PUSH-001/SR-PUSH-001-UNBLOCK-PLANNING-DECISION.md`
- **相依 (Dependencies)**：`SR-RECOVERY-CONTRACTS-20260911`, `UV-EXEC-006`, `UV-EXEC-013`, `UV-EXEC-016`, `SR-BOOKING-VERIFY`, `SR-DISPATCH-SCHEDULER-001` — all present at base SHA (merge-base is a descendant of each)
- **合約權威 (Contract authority)**：`packages/contracts/src/passenger-push-delivery.ts` (provider-neutral claim/lease/fence + receipt types, delivered by `SR-RECOVERY-CONTRACTS-20260911`)
- **Migration 配額權威 (Migration allocation authority)**：`docs/04-uat/system-remediation-20260906/schema-allocation.json`, `additional_allocations[1]` (`task_id: SR-RECOVERY-CONTRACTS-20260911, version: V0099, migration_filename: V0099__sr_passenger_push_delivery.sql`)

**Filename note**: the task brief's `artifacts` list names
`infra/migrations/V0099__sr_passenger_push_delivery_claims.sql`. The
authoritative reservation in `schema-allocation.json` (written by the
upstream contracts task and collision-checked against
`infra/migrations/` at allocation time) names the file
`V0099__sr_passenger_push_delivery.sql` (no `_claims` suffix). This
migration follows the allocation record, not the brief's paraphrase, since
the allocation file is the collision-checked source of truth for migration
numbering across concurrent tasks.

---

## 2. 交付範圍 (What was actually built)

### 2.1 Migration (`infra/migrations/V0099__sr_passenger_push_delivery.sql`, new)

Two tables per the `V0099` allocation entry:

- `ops.phase1_push_delivery_claims`: one live-claim row per
  `outbox_id` (PK, FK to `ops.consumer_notification_outbox`), with
  `fence_token` incremented on every successful (re)claim and
  `lease_expires_at` bounding how long a stalled worker can hold a row
  before another worker may reclaim it.
- `ops.phase1_push_delivery_receipts`: append-only receipts keyed by a
  server-derived `dedupe_key` (`UNIQUE`, `= outboxId:fenceToken`), with
  `provider_ack_state` and `device_delivery_state` kept as independent
  columns — no code path may set `device_delivery_state = 'delivered'` as a
  side effect of a provider ack.

**Documented deviation from the allocation text**: the allocation
describes `tenant_id` columns "copied from the outbox at claim/receipt
time," but `ops.consumer_notification_outbox`
(`V0056__multi_taxi_runtime_compliance_closure.sql`) and its
`ConsumerNotificationOutboxRecord` contract carry no `tenant_id` — the
multi-taxi domain has no tenant concept today (its own masked-call audit
log records `tenantId: null`). Both new tables omit `tenant_id` rather than
fabricate one; a future tenant-aware push pipeline can add it. Recorded
directly in the migration file's header comment.

### 2.2 Repository (`apps/api/src/modules/multi-taxi/multi-taxi.repository.ts`)

Three new methods, each a no-op passthrough when
`!this.isEnabled()` (preserving the module's existing degraded-DB
behavior):

- `claimPushDeliveryRow(outboxId, passengerSubjectRef, workerId,
  leaseSeconds)`: a single `INSERT ... ON CONFLICT (outbox_id) DO UPDATE
  ... WHERE claim_state != 'claimed' OR lease_expires_at < now() RETURNING
  fence_token`. Zero rows returned means an unexpired lease is held
  elsewhere — the caller gets `{ claimed: false }` and must not send.
- `releasePushDeliveryClaim(outboxId, fenceToken)`: best-effort release
  gated by the caller's own `fenceToken`, so a worker whose lease was
  already reclaimed cannot release someone else's claim.
- `recordPushDeliveryOutcome(input)`: one transaction —
  `SELECT fence_token ... FOR UPDATE` (rejects with `{ recorded: false,
  reason: "fence_lost" }` and rolls back if the fence moved on),
  `INSERT ... receipts ... ON CONFLICT (dedupe_key) DO NOTHING RETURNING
  receipt_id` (empty return ⇒ `replayed: true`, i.e. this is a retried
  write for an attempt already recorded), the existing outbox status
  update, and the claim release — commit or rollback together. A mid-write
  DB error rolls back and rethrows rather than being swallowed.

### 2.3 Service (`apps/api/src/modules/multi-taxi/multi-taxi.service.ts`)

`deliverPassengerNotification` gains a claim/lease/fence boundary and
replaces its prior "record whatever happened, always resolve" persistence
call:

- **Unconfigured provider** (`!passengerPushPort.isAvailable()`): unchanged
  — returns directly via the existing `persistPassengerNotificationOutcome`
  fail-fast path, never reaching the claim. This preserves the previously
  existing behavior the acceptance bar calls out by name.
- **Claim conflict** (`claimed: false`): throws
  `PassengerPushClaimConflictError` before calling the provider — a
  concurrent or restarted caller cannot double-send.
- **Provider send failure**: persists the `failed` outcome via the
  existing helper, then best-effort releases the claim (a release failure
  is reported via `repository.reportPersistenceFailure`, not thrown,
  since the row already carries a correct `failed` status and the lease
  will expire on its own).
- **Provider ack succeeds, but the receipt/outbox transaction does not
  commit** (`recordPushDeliveryOutcome` throws, or returns `{ recorded:
  false }` because the fence moved on): throws
  `PassengerPushPersistenceUnknownError` instead of resolving a fabricated
  `delivered` outcome. This is the central defect this task closes — the
  planning decision's finding that a persistence failure after a real
  provider ack was previously swallowed into a false `delivered` return.

Both new error classes are exported so callers (and this task's tests) can
distinguish "definitely didn't send" (claim conflict) from "provider
ack observed, durable state now unknown" (persistence-unknown) — the two
error paths need different retry handling upstream (skip vs. investigate
before retrying), which is why they are not collapsed into one exception
type.

### 2.4 Tests

- `tests/unit/system-remediation/sr-push-durability-20260911/push-delivery-durability.test.ts`
  (new, 12 cases): unconfigured-provider passthrough; claim-conflict throw
  with no provider call; restarted-claim reclaim after lease expiry
  (fresh fence token flows through to the receipt write); claim release on
  provider-send failure; persistence-throw-after-ack propagation;
  fence-lost-after-ack propagation; plus direct repository-level SQL/
  transaction assertions (claim upsert shape, denied claim, commit-all,
  fence-lost rollback, mid-transaction rollback-and-rethrow,
  replay-detected-via-empty-INSERT-return).
- `apps/api/tests/unit/multi-taxi-passenger-authority.test.ts` (existing
  file, +9 lines): the shared test harness's repository double gained
  stubs for the three new methods (`claimPushDeliveryRow` →
  `{ claimed: true, fenceToken: 1 }`, `releasePushDeliveryClaim`,
  `recordPushDeliveryOutcome` → `{ recorded: true, replayed: false }`) so
  the harness's existing `deliverPassengerNotification` callers keep
  working now that the method has a mandatory claim step. This file is
  outside this task's declared `write_scopes`; the edit was the minimum
  needed to avoid breaking a pre-existing suite that exercises this same
  method, and adds no new assertions of its own — see §4.

---

## 3. 驗證執行紀錄與實際結果 (Verification Evidence)

| 檢查項目 / 指令 | Exit Code | 實際結果摘要 |
| :-- | :-: | :-- |
| `git diff --check` | 0 | 工作目錄零 whitespace error |
| `pnpm exec vitest run tests/unit/system-remediation/sr-push-durability-20260911/` | 0 | 1 test file, **12 passed**, 0 failed |
| `pnpm exec vitest run apps/api/tests/unit/multi-taxi-passenger-authority.test.ts` (run from `apps/api/`) | 0 | 1 test file, **15 passed**, 0 failed — confirms the harness stub addition (§2.4) did not regress this pre-existing suite |
| `pnpm --filter @drts/api typecheck` | 2 | **Fails, but on files this task never touched**: `owned-mobility.service.ts`, `voice-booking/*.service.ts`, `contract-operational-view.service.ts`, `vehicle-eligibility/*.ts` — all missing-export/property errors against `@drts/contracts` (e.g. `BookingRequirements`, `ContractOperationalViewRecord`). Verified pre-existing: this task's base SHA `e2e17cb8d` (before any of this task's 5 commits) already fails the same way in this worktree, and none of the failing files appear in `git diff origin/dev...HEAD --stat` (only `multi-taxi.repository.ts`, `multi-taxi.service.ts`, two test files, and the new migration changed — see §4). `owned-mobility.service.ts`'s last touching commit on `origin/dev` is `693a80bb4` (`SR-DISPATCH-SCHEDULER-001`), itself an ancestor of this task's base SHA. Not fixed here: out of `write_scopes`, and fixing it would require editing `apps/api/src/modules/owned-mobility/`, `voice-booking/`, `regulatory-registry/`, `vehicle-eligibility/` — none declared for this task. |

`multi-taxi.service.ts` and `multi-taxi.repository.ts` — the two files this
task actually changed — produce no new diagnostics of their own; every
`tsc` error above is in unrelated files that were already broken at this
task's base commit.

---

## 4. 變更範圍守護 (Write Scopes Compliance)

Declared `write_scopes`/`artifacts` touched:

1. `apps/api/src/modules/multi-taxi/multi-taxi.repository.ts` — extended (+194/-? lines: three new methods, §2.2)
2. `apps/api/src/modules/multi-taxi/multi-taxi.service.ts` — extended (+123 lines net: claim/lease/fence + persistence-unknown propagation, §2.3)
3. `infra/migrations/V0099__sr_passenger_push_delivery.sql` — new (see filename note in §1)
4. `tests/unit/system-remediation/sr-push-durability-20260911/` — new test file, §2.4
5. `docs/04-uat/system-remediation-20260906/SR-PUSH-DURABILITY-20260911.md` — this document

One file outside declared scope was touched:

- `apps/api/tests/unit/multi-taxi-passenger-authority.test.ts` (+9 lines) —
  necessary stub-only addition to the shared repository test double so this
  pre-existing suite's calls into `deliverPassengerNotification` keep
  passing against the new mandatory claim step (§2.4). No production code,
  no new assertions; verified still green (§3).

No file under `packages/contracts/`, `apps/platform-admin-web/`, or any
other task's declared scope was modified.

---

## 5. 驗證界線與非即時排除聲明 (Boundaries & Non-Live Exclusions)

- **No external provider/transport choice** — `PassengerPushPort` is
  injected as before; this task adds no FCM/APNs integration, matching the
  acceptance bar's explicit "no external provider choice is needed for
  these persistence fixes."
- **No production caller added** — `deliverPassengerNotification` has no
  in-repo scheduler/controller caller today (verified via repo-wide grep);
  wiring a real dispatch/retry loop around it remains `SR-PUSH-001` /
  `SR-LIVE-PUSH-001`'s scope per the parent task's `integration_notes`.
  This task's job was the durability of the method itself, exercised here
  via direct unit tests with injected ports/repository.
- **No live DB run** — this VM does not run Postgres/Docker Compose for
  this task; the migration and its invariants are verified by inspection
  against `schema-allocation.json` and by unit-level SQL/transaction-shape
  assertions (query text, parameter order, commit/rollback sequencing) in
  §2.4, not by an actual applied migration.
- **Pre-existing, unrelated `@drts/api` typecheck failure not fixed** — see
  §3; out of this task's `write_scopes`.

---

## 6. 交接資訊 (Handoff)

- **狀態 (Status)**：candidate ready, awaiting independent review (`Claude`) and CI
- **CANDIDATE_SHA**：`8350f8387e1ef09a9b8d90731d177535319e554e`
- **CANDIDATE_BRANCH**：`claude/sr-push-durability-20260911`
- **INTEGRATION_STATUS**：`branch_pushed` pending this handoff's push
