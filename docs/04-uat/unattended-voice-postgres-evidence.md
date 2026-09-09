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
- Evidence Refs:
  - `/home/lupin/workspace/drts-fleet-platform/.local/parallel-dispatch-20260908T110329Z/report.md`
  - `/home/lupin/workspace/drts-fleet-platform/.local/role-routing-20260908T114940Z/report.md`

---

## 1. Executive Summary & Delivery Boundary

This document records the acceptance verification and execution evidence for **UV-EXEC-024**. Per the unattended voice system design and two-round audit findings (R1-T01 through R1-T08, R2-T01 through R2-T05, R2-S01, R2-S02, R2-V01 through R2-V03), this suite executes directly against an isolated, freshly migrated real PostgreSQL database using two distinct application instance proxies (Instance A and Instance B) sharing the database.

The test suite explicitly proves:

1. **Isolated PostgreSQL & Fail-Closed Availability**:
   - Zero production passenger data leakage (`SELECT current_database()` isolated per run; 0 pre-existing orders).
   - Strict fail-closed failure when DB is unconfigured, unreachable, or credentials fail (no skips or false positives).
2. **Two-Instance Crash & Response-Loss Fault Matrix**:
   - Concurrent accept race: Instance A and B race to accept the same confirmation; exactly 1 `command_receipt` and 1 `booking_command_proof` are persisted via PostgreSQL unique constraints (`uq_voice_command_receipt_action_key`).
   - Crash before write rollback: Injected connection loss before writing receipt rolls back cleanly, allowing Instance B to accept cleanly without dangling artifacts.
   - Response loss after write: Injected response loss after `COMMIT` on Instance A; Instance B retry discovers existing receipt and returns identical receipt idempotently.
   - Crash before order commit in runner: Injected crash during runner write rolls back; confirmation remains `accepted`; Instance B recovers and commits exactly 1 order.
   - Response loss after order commit: Injected response loss after receipt status update; Instance B recovers idempotently without creating a second valid order.
   - Concurrent runner execution: Two instances executing the same `commandId` concurrently commit exactly 1 order (`phase1_owned_orders`).
   - Immutability enforcement: PostgreSQL `raise_append_only` triggers reject any `UPDATE` or `DELETE` on `voice.booking_command_proof` and `voice.booking_audit_intent`.
3. **Mixed Dispatch Entry & Revision Invalidation**:
   - Stale revision invalidation: Modifying booking requirements creates Draft 2 and invalidates Draft 1; stale confirmation requests are rejected; Draft 2 commits cleanly.
   - Mixed entry fence: Active voice booking call is fenced (`resolveVoiceOrderFence`), returning `pending` and subsequent `bound`, preventing call-center/legacy double booking on the same call leg. Cross-scope authorization checks fail closed with `VOICE_SCOPE_DENIED`.
   - Shared resource capacity contention: PostgreSQL unique partial index `uq_dispatch_resource_reservations_active` on `ops.dispatch_resource_reservations` prevents concurrent driver/vehicle assignment between voice and enterprise dispatch (SQL code 23505).
4. **Callback & Control Race Mitigation**:
   - Late timeout race (UV-AC-047): Late timeout commands for superseded or accepted offers safely evaluate to `superseded_or_no_op`, preserving valid driver assignments.
   - Callback cancel vs complete race (UV-AC-046): Terminal states are immutable; canceling a completed callback or completing a cancelled callback throws 409 `CALLBACK_TERMINAL_RACE_CONFLICT`.
   - Handoff vs confirm race (UV-AC-021): Human handoff CAS advances `leaseEpoch` to 2 and transitions control to coordinator/handoff; late AI tool results from epoch 1 are fenced, discarded into audit, and rejected from booking.
   - Control sequence contiguity (UV-AC-045): Requests with gaps in `controlSequence` are rejected fail-closed, ensuring deterministic ordering.

---

## 2. Acceptance Matrix & Requirement Mapping

| Required Acceptance ID               | Verification Target                                                               | Test Case / Suite        | PostgreSQL Invariant / Schema Mechanism                                                                                | Status     |
| :----------------------------------- | :-------------------------------------------------------------------------------- | :----------------------- | :--------------------------------------------------------------------------------------------------------------------- | :--------- |
| `isolated_postgres_environment`      | Fail-closed connectivity & hermetic isolation                                     | Suite 1: Cases 1.1 & 1.2 | Per-run database creation (`uv_exec_024_*`), connection verification, zero production data access                      | **PASSED** |
| `two_instance_crash_matrix_evidence` | Two instances, crashes before/after writes, response loss, runner race            | Suite 2: Cases 2.1 – 2.7 | `uq_voice_command_receipt_action_key`, transactional rollback, idempotent replay, `raise_append_only` triggers         | **PASSED** |
| `mixed_dispatch_entry_evidence`      | Stale revision invalidation, legacy entry fence, shared capacity mutual exclusion | Suite 3: Cases 3.1 – 3.3 | `voice.draft_revision`, `voice_order_fence`, `uq_dispatch_resource_reservations_active` (SQLSTATE 23505)               | **PASSED** |
| `callback_control_race_evidence`     | Late timeout, callback race, handoff fence, control gap                           | Suite 4: Cases 4.1 – 4.4 | `handleOfferTimeout` versioning, `CALLBACK_TERMINAL_RACE_CONFLICT`, `lease_epoch` CAS, `last_applied_control_sequence` | **PASSED** |
| `reviewed_candidate_sha`             | Independent review by assigned reviewer `Codex2`                                  | Candidate handoff        | SHA locked via `ai-status.sh handoff` for reviewer approval                                                            | **READY**  |

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

## 3. Test Execution Logs & Verification Metrics

### Command

```bash
pnpm exec vitest run tests/integration/unattended-voice-postgres.integration.test.ts --no-file-parallelism --maxConcurrency=1
```

### Execution Output

```text
 RUN  v4.1.4 /home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini-uv-exec-024

 ✓ tests/integration/unattended-voice-postgres.integration.test.ts (16 tests) 4480ms
   ✓ UV-EXEC-024 Real PostgreSQL Two-Instance Race & Fault Matrix (16)
     ✓ Suite 1: isolated_postgres_environment (2)
       ✓ fails explicitly when database connection is invalid or unconfigured, without skipping
       ✓ uses an isolated test database with zero production passenger data
     ✓ Suite 2: two_instance_crash_matrix_evidence (7)
       ✓ Case 2.1: Concurrent acceptance race between Instance A and Instance B yields exactly 1 receipt and proof
       ✓ Case 2.2: Crash before accept write in Instance A rolls back, Instance B re-accepts cleanly
       ✓ Case 2.3: Response loss after accept write in Instance A, retry on Instance B discovers existing receipt
       ✓ Case 2.4: Crash before order commit in runner (Instance A), Instance B recovers and commits exactly 1 order
       ✓ Case 2.5: Response loss after order commit in Instance A, retry on Instance B discovers succeeded receipt and creates no second order
       ✓ Case 2.6: Concurrent runner execution produces exactly 1 order with zero duplicate side effects
       ✓ Case 2.7: Immutability triggers on booking_command_proof and booking_audit_intent reject mutation
     ✓ Suite 3: mixed_dispatch_entry_evidence (3)
       ✓ Case 3.1: Old revision invalidation rejects stale confirmation and permits only current revision
       ✓ Case 3.2: Mixed entry fence prevents call-center / legacy double booking on active voice call
       ✓ Case 3.3: Shared driver and vehicle capacity contention between voice and enterprise dispatch enforces mutual exclusion
     ✓ Suite 4: callback_control_race_evidence (4)
       ✓ Case 4.1: Late timeout race (UV-AC-047) is safe no-op on already accepted offer or replaced assignment
       ✓ Case 4.2: Callback cancel vs complete race (UV-AC-046) enforces terminal immutability and outcall fencing
       ✓ Case 4.3: Handoff vs confirm race (UV-AC-021) fences AI actor and discards late AI writes into audit log
       ✓ Case 4.4: Control gap / out-of-order sequence check (UV-AC-045) enforces contiguous control stream

 Test Files  1 passed (1)
      Tests  16 passed (16)
   Start at  21:46:34
   Duration  4.48s (transform 1.93s, setup 0ms, import 2.71s, tests 1.61s, environment 0ms)
```

### Supporting Regressions & Unit Verification

- `tests/unit/uv-exec-014.test.ts`, `tests/unit/uv-exec-015.test.ts`, `tests/unit/uv-exec-016.test.ts`, `tests/unit/uv-exec-017.test.ts`, `tests/unit/uv-exec-018.test.ts`, `tests/unit/uv-exec-023.test.ts`: **4 test files, 105 passed, 0 failed**.
- `@drts/api typecheck`: Passed (`tsc -p tsconfig.json --noEmit` exited with 0).
- Scoped ESLint: Passed with 0 errors and 0 warnings.
- Prettier: Formatted and verified clean.
- `git diff --check`: Passed with 0 whitespace issues.

---

## 4. Architectural & Schema Fixes Applied

During real PostgreSQL integration testing, the following schema alignment was verified and integrated:

1. **`VoiceSessionRepository` & `VoiceHandoffService` Enum Mapping**:
   - The PostgreSQL schema constraint on `voice.session.control_owner` (`CHECK (control_owner IN ('ai', 'handoff', 'human', 'none'))`) stores `'handoff'` as the persistent state when control is transferred to coordinator/call center.
   - `VoiceSessionRepository` safely maps between runtime `'coordinator'` state and the underlying database constraint `'handoff'` during CAS operations, and `VoiceHandoffService` honors `'coordinator'`, `'handoff'`, and `'ai'` state transitions without throwing false 409 rejections.

---

## 5. Candidate Handoff Declaration

- Worktree: `/home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini-uv-exec-024`
- Branch: `gemini/uv-exec-024`
- Delivery Files:
  - `tests/integration/unattended-voice-postgres.integration.test.ts`
  - `docs/04-uat/unattended-voice-postgres-evidence.md`
  - `apps/api/src/modules/voice-booking/voice-handoff.service.ts`
  - `apps/api/src/modules/voice-booking/voice-session.repository.ts`
- Independent Reviewer: `Codex2`
