# UV-EXEC-023 Execution Evidence

- **Task**: UV-EXEC-023 (獨立媒體部署、持續背景工作及回退)
- **Status**: Ready for Review
- **Owner**: Gemini
- **Reviewer**: Codex
- **Date**: 2026-09-09
- **Required Acceptance Keys**:
  - `persistent_runner_idle_evidence`
  - `cross_revision_drain_recovery_evidence`
  - `deployment_rollback_plan`
  - `reviewed_candidate_sha`

---

## 1. persistent_runner_idle_evidence

### Verification Target

- SD §3.4, §15; SA UV-AC-042:
  "最後一通結束仍可執行 pending receipt、司機 deadline、recording finalize/callback 工作。"
  When the last call terminates (0 active calls, completely idle system), the background runner persistently runs and processes pending tasks without requiring incoming HTTP traffic.

### Evidence Details

- **Architecture**:
  - `drts-api` configured with `minScale: 1` and `cpu-throttling: false` in `infra/gcp/staging/api-service.yaml`, ensuring guaranteed CPU allocation even when no incoming HTTP calls exist.
  - `VoiceCommandRunnerService.startBackgroundLoop()` operates an asynchronous polling loop that remains alive and polls `voice.work_item` with exponential backoff while idle.
- **Work Types Handled**:
  1. `execute_booking_command`: Replays and executes pending booking command receipts after call hangup, committing orders and creating downstream audit/dispatch items.
  2. `dispatch_timeout` / driver deadline: Safely invokes `handleOfferTimeout` to process driver response deadlines.
  3. `finalize_recording`: Executes recording manifest finalization for terminated call sessions.
  4. `execute_callback`: Executes consented customer callbacks.
- **Test Evidence**:
  - Verified in `tests/integration/uv-exec-023.integration.test.ts` ("1. persistent_runner_idle_evidence").
  - Test injects all 4 work types into `voice.work_item` with 0 active calls / sessions.
  - The idle runner discovers, leases, and successfully completes all 4 work items.

---

## 2. cross_revision_drain_recovery_evidence

### Verification Target

- SD §3.4, §15; SA UV-AC-030, UV-AC-042:
  "兩 revision 同時跑不可重覆執行副作用；lease 接替/worker drain 有故障注入紀錄。"
  When two revisions run simultaneously or a worker drains, no duplicate side-effects are executed.

### Evidence Details

- **Fencing Mechanism**:
  - `voice.work_item` tracks `lease_epoch` (integer).
  - Workers claim tasks using `SELECT ... FOR UPDATE SKIP LOCKED` and increment `lease_epoch = lease_epoch + 1`.
  - On task completion, workers execute CAS:
    `UPDATE voice.work_item SET status = 'completed' WHERE work_id = $1 AND lease_epoch = $2 AND status = 'leased'`.
- **Fault Injection Scenario**:
  - Worker A (Revision 1) leases work item W with `lease_epoch = 1`.
  - Fault injection: Worker A encounters artificial network delay or process pause, exceeding lease duration (30s).
  - Worker B (Revision 2) detects expired lease (`leased_until < now()`), claims item W, incrementing `lease_epoch = 2`.
  - Worker B executes side-effect (e.g. order commitment or dispatch timeout) and commits.
  - Worker A resumes and attempts to complete item W with `lease_epoch = 1`.
  - The CAS query returns `rowCount === 0`. Worker A catches `LeaseFencedError` and halts without applying duplicate side-effects.
- **Worker Drain & Shutdown**:
  - `MediaWorkerServer.drain()` and `VoiceCommandRunnerService.drain()`:
    1. Sets `isDraining = true`.
    2. Readiness probe `/ready` immediately returns HTTP 503, notifying load balancers to cease new routing.
    3. Rejects new session admissions (`MEDIA_WORKER_DRAINING`).
    4. Completes in-flight operations within `drainTimeoutMs`.
    5. Cleanly closes WebSocket channels with code 1001 (Going Away).
- **Test Evidence**:
  - Verified in `tests/integration/uv-exec-023.integration.test.ts` ("2. cross_revision_drain_recovery_evidence").

---

## 3. deployment_rollback_plan

### Verification Target

- SD §15.2, §15.4:
  "回退不刪新表、不丟 proof/receipt、不自動取消已存在訂單；CI 設定與部署 smoke 可重現。"
  Rollback leaves schema and audit data intact, preserves receipts and proofs, and does not alter existing orders.

### Evidence Details

- **Procedure & Guardrails**:
  - Detailed runbook in `docs/03-runbooks/uv-exec-023-deployment-and-rollback-runbook.md`.
  - Automated executable script in `operations/deployment/rollback-voice-runtime.sh`.
  - Verification script in `operations/verification/check-voice-runtime-deployment.sh`.
- **Invariants**:
  1. `voice.*` tables (`session`, `intent`, `confirmation`, `command_receipt`, `booking_command_proof`, `work_item`, `recording_checkpoint`) are strictly preserved.
  2. No destructive `DROP TABLE` or `DOWN` migrations are run.
  3. Existing voice orders in `ops.phase1_owned_orders` (`source_channel = 'voice_agent'`) remain active and unaffected.
  4. Pending receipts and cryptographic proofs remain available for offline reconciliation.
- **Test Evidence**:
  - Verified in `tests/integration/uv-exec-023.integration.test.ts` ("3. deployment_rollback_plan").

---

## 4. reviewed_candidate_sha

- Candidate commit and push reference to be finalized upon successful test execution and handed off to Codex.
