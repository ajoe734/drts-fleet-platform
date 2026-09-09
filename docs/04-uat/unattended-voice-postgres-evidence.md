# UV-EXEC-024 PostgreSQL Two-Instance Race & Fault Acceptance Evidence

- Task ID: `UV-EXEC-024`
- Title: 真實 PostgreSQL 兩實例競態與故障驗收 (Real PostgreSQL Two-Instance Race & Fault Acceptance)
- Owner: `Gemini`
- Reviewer: `Codex2`
- Planning Ref: [`docs/02-architecture/phase1-unattended-voice-booking-sa-20260906.md`](file:///home/lupin/workspace/drts-fleet-platform/docs/02-architecture/phase1-unattended-voice-booking-sa-20260906.md)
- System Design Ref: [`docs/02-architecture/phase1-unattended-voice-booking-sd-20260906.md`](file:///home/lupin/workspace/drts-fleet-platform/docs/02-architecture/phase1-unattended-voice-booking-sd-20260906.md)
- Two-Pass Audit Ref: [`docs/02-architecture/phase1-unattended-voice-booking-two-pass-audit-20260906.md`](file:///home/lupin/workspace/drts-fleet-platform/docs/02-architecture/phase1-unattended-voice-booking-two-pass-audit-20260906.md)
- Decision Ref: [`docs/01-decisions/SD-DP-20260906-013-unattended-voice-execution.md`](file:///home/lupin/workspace/drts-fleet-platform/docs/01-decisions/SD-DP-20260906-013-unattended-voice-execution.md)
- Execution Ref: [`docs/03-runbooks/unattended-voice-booking-execution-tasks-20260906.md`](file:///home/lupin/workspace/drts-fleet-platform/docs/03-runbooks/unattended-voice-booking-execution-tasks-20260906.md)
- Candidate Revision Ref: Follow-up to rejected candidate `160768f3b`

---

## 1. Executive Summary & Review Remediation

This document records the acceptance verification and execution evidence for **UV-EXEC-024**. Per the unattended voice system design and two-round audit findings (R1-T01 through R1-T08, R2-T01 through R2-T05, R2-S01, R2-S02, R2-V01 through R2-V03), this suite executes directly against an isolated, freshly migrated real PostgreSQL database using two distinct application instance proxies (Instance A and Instance B) sharing the database.

### 1.1 Remediation of Codex2 Review Findings (from Candidate `160768f3b`)

| Finding | Review Rejection Finding | Remediation Applied |
| :--- | :--- | :--- |
| **Finding 1** | Default localhost fallback permitted unconfigured test passes; generic `DATABASE_URL` fallback obscured isolation. | Strictly requires `UV_BOOKING_TEST_DATABASE_URL`. Prohibits fallback to `DATABASE_URL` or localhost defaults. Fails closed with exit code 1 when unconfigured. |
| **Finding 2** | Case 2.5 injected fault before `COMMIT` inside `withTransaction`, testing rollback instead of post-order-commit response loss. | Injects connection crash specifically on the actual order transaction `COMMIT` by tracking order write queries (`hasOrderWrite`). Pre-retry asserts orders=1, receipts=1, proofs=1, audits=1 in DB before Instance B retries idempotently. |
| **Finding 3** | Cases 4.1/4.2 used mocks / in-memory Maps instead of real PostgreSQL tables; Case 4.3 was sequential. | Cases 4.1 and 4.2 use real PostgreSQL tables (`ops.phase1_dispatch_assignments`, `ops.dispatch_resource_reservations`, `voice.callback_task`, `voice.callback_attempt`). Case 4.3 runs deterministic competing schedules between Instance A (handoff CAS) and Instance B (AI confirmation). |
| **Finding 4** | Case 3.2 only checked fence helper; Case 3.3 only checked sequential driver SQL collision. | Case 3.2 executes real `CallcenterService.linkOrderToExistingSession`, testing `VOICE_ACTION_PENDING`, `VOICE_ORDER_ALREADY_LINKED`, and legacy SQL update locks. Case 3.3 tests concurrent voice vs enterprise dispatch reservation race on driver AND vehicle with deferred trigger rejection for old revision writers. |

---

## 2. Acceptance Matrix & Requirement Mapping

| Required Acceptance ID | Verification Target | Test Case / Suite | PostgreSQL Invariant / Schema Mechanism | Status |
| :--- | :--- | :--- | :--- | :--- |
| `isolated_postgres_environment` | Fail-closed connectivity & hermetic isolation | Suite 1: Cases 1.1 & 1.2 | Per-run database creation (`uv_exec_024_*`), connection verification, zero production data access | **PASSED** |
| `two_instance_crash_matrix_evidence` | Two instances, crashes before/after writes, response loss, runner race | Suite 2: Cases 2.1 – 2.7 | `uq_voice_command_receipt_action_key`, transactional rollback, idempotent replay, `raise_append_only` triggers | **PASSED** |
| `mixed_dispatch_entry_evidence` | Stale revision invalidation, legacy entry fence, shared capacity mutual exclusion | Suite 3: Cases 3.1 – 3.3 | `voice.draft_revision`, `voice_order_fence`, `uq_dispatch_resource_reservations_active` (SQLSTATE 23505) | **PASSED** |
| `callback_control_race_evidence` | Late timeout, callback race, handoff fence, control gap | Suite 4: Cases 4.1 – 4.4 | `handleOfferTimeout` versioning, `CALLBACK_TERMINAL_RACE_CONFLICT`, `lease_epoch` CAS, `last_applied_control_sequence` | **PASSED** |
| `reviewed_candidate_sha` | Independent review by assigned reviewer `Codex2` | Candidate handoff | SHA locked via `ai-status.sh handoff` for reviewer approval | **READY** |

### Detailed Functional Requirements (FR) & Acceptance Criteria (AC) Addressed

- **UV-FR-002, UV-FR-007, UV-FR-009, UV-FR-010, UV-FR-011, UV-FR-012, UV-FR-013, UV-FR-017, UV-FR-019, UV-FR-020, UV-FR-021, UV-FR-022, UV-FR-023, UV-FR-024, UV-FR-025, UV-FR-026, UV-FR-027, UV-FR-032**
- **UV-AC-009**: Idempotent acceptance and execution producing exactly 1 receipt and 1 order.
- **UV-AC-010**: Crash recovery before and after commit without ghost or orphan records.
- **UV-AC-021**: Handoff vs confirm race fencing late AI actor with lease epoch increment.
- **UV-AC-023**: Fail-closed PostgreSQL availability and clean database isolation.
- **UV-AC-037**: Proof and audit log append-only immutability.
- **UV-AC-043**: Resource scope and credential verification.
- **UV-AC-045**: Sequence contiguity and `controlCutoff` validation.
- **UV-AC-046**: Callback terminal state race conflict mitigation.
- **UV-AC-047**: Late autonomous dispatch offer timeout no-op protection.
- **UV-AC-048**: Multi-channel driver/vehicle dispatch reservation mutual exclusion.

---

## 3. Verification Commands & Execution Logs

### 3.1 Fail-Closed Verification (Unconfigured & Generic DATABASE_URL Rejection)

#### Test 1: Unconfigured Environment (Fails Closed)

```bash
env -u UV_BOOKING_TEST_DATABASE_URL -u DATABASE_URL pnpm exec vitest run tests/integration/unattended-voice-postgres.integration.test.ts --no-file-parallelism --maxConcurrency=1
```

```text
 RUN  v4.1.4 /home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini-uv-exec-024

 ❯ tests/integration/unattended-voice-postgres.integration.test.ts (16 tests | 16 skipped) 10ms

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯ Failed Suites 1 ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯

 FAIL  tests/integration/unattended-voice-postgres.integration.test.ts > UV-EXEC-024 Real PostgreSQL Two-Instance Race & Fault Matrix
Error: UV-EXEC-024 Acceptance Requirement: UV_BOOKING_TEST_DATABASE_URL must be explicitly configured with an isolated test database. Falling back to default or generic DATABASE_URL is prohibited. Test suite fails explicitly when DB is unconfigured.
 ❯ tests/integration/unattended-voice-postgres.integration.test.ts:51:13


 Test Files  1 failed (1)
      Tests  16 skipped (16)
   Start at  23:41:25
   Duration  3.20s (transform 2.19s, setup 0ms, import 3.01s, tests 10ms, environment 0ms)
```

#### Test 2: Generic DATABASE_URL Rejection (Fails Closed)

```bash
env -u UV_BOOKING_TEST_DATABASE_URL DATABASE_URL="postgresql://postgres:postgres@localhost:5432/postgres" pnpm exec vitest run tests/integration/unattended-voice-postgres.integration.test.ts --no-file-parallelism --maxConcurrency=1
```

```text
 RUN  v4.1.4 /home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini-uv-exec-024

 ❯ tests/integration/unattended-voice-postgres.integration.test.ts (16 tests | 16 skipped) 11ms

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯ Failed Suites 1 ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯

 FAIL  tests/integration/unattended-voice-postgres.integration.test.ts > UV-EXEC-024 Real PostgreSQL Two-Instance Race & Fault Matrix
Error: UV-EXEC-024 Acceptance Requirement: UV_BOOKING_TEST_DATABASE_URL must be explicitly configured with an isolated test database. Falling back to default or generic DATABASE_URL is prohibited. Test suite fails explicitly when DB is unconfigured.
 ❯ tests/integration/unattended-voice-postgres.integration.test.ts:51:13


 Test Files  1 failed (1)
      Tests  16 skipped (16)
   Start at  23:41:31
   Duration  3.36s (transform 2.28s, setup 0ms, import 3.13s, tests 11ms, environment 0ms)
```

---

### 3.2 Full Two-Instance Fault Suite Execution (16/16 Passed)

```bash
UV_BOOKING_TEST_DATABASE_URL="postgresql://postgres:postgres@localhost:5432/postgres" pnpm exec vitest run tests/integration/unattended-voice-postgres.integration.test.ts --no-file-parallelism --maxConcurrency=1
```

```text
 RUN  v4.1.4 /home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini-uv-exec-024

[Nest] 128975  - 09/09/2026, 11:47:50 PM    WARN [VoiceBookingRepository] Voice-booking transaction rollback failed: Connection terminated unexpectedly

 Test Files  1 passed (1)
      Tests  16 passed (16)
   Start at  23:47:45
   Duration  5.12s (transform 2.14s, setup 0ms, import 2.93s, tests 2.01s, environment 0ms)
```

All 16 tests executed directly against PostgreSQL:
1. `Suite 1: fails explicitly when database connection is invalid or unconfigured, without skipping` - **PASSED**
2. `Suite 1: uses an isolated test database with zero production passenger data` - **PASSED**
3. `Suite 2 Case 2.1: Concurrent acceptance race between Instance A and Instance B yields exactly 1 receipt and proof` - **PASSED**
4. `Suite 2 Case 2.2: Crash before accept write in Instance A rolls back, Instance B re-accepts cleanly` - **PASSED**
5. `Suite 2 Case 2.3: Response loss after accept write in Instance A, retry on Instance B discovers existing receipt` - **PASSED**
6. `Suite 2 Case 2.4: Crash before order commit in runner (Instance A), Instance B recovers and commits exactly 1 order` - **PASSED**
7. `Suite 2 Case 2.5: Response loss after order commit in Instance A, retry on Instance B discovers succeeded receipt and creates no second order` - **PASSED**
8. `Suite 2 Case 2.6: Concurrent runner execution produces exactly 1 order with zero duplicate side effects` - **PASSED**
9. `Suite 2 Case 2.7: Immutability triggers on booking_command_proof and booking_audit_intent reject mutation` - **PASSED**
10. `Suite 3 Case 3.1: Old revision invalidation rejects stale confirmation and permits only current revision` - **PASSED**
11. `Suite 3 Case 3.2: Mixed entry fence prevents call-center / legacy double booking on active voice call` - **PASSED**
12. `Suite 3 Case 3.3: Shared driver and vehicle capacity contention between voice and enterprise dispatch enforces mutual exclusion` - **PASSED**
13. `Suite 4 Case 4.1: Late timeout race (UV-AC-047) is safe no-op on already accepted offer or replaced assignment` - **PASSED**
14. `Suite 4 Case 4.2: Callback cancel vs complete race (UV-AC-046) enforces terminal immutability and outcall fencing` - **PASSED**
15. `Suite 4 Case 4.3: Handoff vs confirm race (UV-AC-021) fences AI actor and discards late AI writes into audit log` - **PASSED**
16. `Suite 4 Case 4.4: Control gap / out-of-order sequence check (UV-AC-045) enforces contiguous control stream` - **PASSED**

---

### 3.3 Supporting Regressions & Quality Verification

- **Unit test suites**: `pnpm exec vitest run tests/unit/uv-exec-014.test.ts tests/unit/uv-exec-015.test.ts`
  ```text
   Test Files  2 passed (2)
        Tests  81 passed (81)
     Duration  3.47s
  ```
- **Typecheck**: `pnpm exec tsc --noEmit -p apps/api/tsconfig.json` exited with code 0.
- **Prettier**: `pnpm exec prettier --check tests/integration/unattended-voice-postgres.integration.test.ts` passed cleanly.
- **Git diff check**: `git diff --check` passed cleanly with 0 whitespace issues.

---

## 4. Candidate Handoff Declaration

- Worktree: `/home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini-uv-exec-024`
- Branch: `gemini/uv-exec-024`
- Delivery Files:
  - `tests/integration/unattended-voice-postgres.integration.test.ts`
  - `docs/04-uat/unattended-voice-postgres-evidence.md`
- Independent Reviewer: `Codex2`
