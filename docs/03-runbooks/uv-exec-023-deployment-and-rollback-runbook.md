# UV-EXEC-023 Deployment and Rollback Runbook

- **Task**: UV-EXEC-023 (獨立媒體部署、持續背景工作及回退)
- **Status**: Ready for Review
- **Owner**: Gemini
- **Reviewer**: Codex
- **Reference**: SD §3.4, §15; SA UV-FR-012, UV-FR-013, UV-FR-021, UV-FR-022, UV-FR-026, UV-FR-027, UV-FR-032; AC UV-AC-030, UV-AC-042

---

## 1. Architecture Overview (SD §3.4)

### 1.1 Independent Deployments

1. **`drts-voice-media-worker` (Cloud Run Knative Service)**:
   - Dedicated service handling bidirectional audio streaming, ASR, TTS, and WebSocket framing.
   - Isolated from the business transactional API (`drts-api`) to ensure CPU/memory isolation during speech recognition bursts.
   - Configured with `sessionAffinity: "true"` for long-lived WebSocket connections.
   - Configured with `timeoutSeconds: 3600` (up to 60 minutes) conforming to Cloud Run WebSocket guidelines.
   - Configured with `autoscaling.knative.dev/minScale: "1"` (warm instance) to prevent cold-start latency on incoming customer calls.
   - Dedicated CPU allocation (`run.googleapis.com/cpu-throttling: "false"`) to prevent audio degradation during silent pauses.
   - Exposes `/health` (liveness) and `/ready` (readiness; fails with 503 during drain).

2. **`drts-api` Background Runner (Cloud Run Knative Service)**:
   - Configured with `autoscaling.knative.dev/minScale: "1"` (warm instance) and `run.googleapis.com/cpu-throttling: "false"` (instance-based billing).
   - Guarantees persistent background execution even when idle (0 active customer calls).
   - Executes durable background work:
     - `execute_booking_command`: pending booking command receipts after call hangup.
     - `dispatch_timeout` / driver deadline: autonomous dispatch timeout management.
     - `finalize_recording`: immutable recording manifest closure for terminated calls.
     - `execute_callback`: consented callback execution and dialing retry.

---

## 2. Multi-Worker & Cross-Revision Concurrency (SD §7.5, §15.3)

### 2.1 Database Lease & Epoch Fencing

- All background work items are managed through `voice.work_item`:
  - `status IN ('pending', 'leased', 'completed', 'failed', 'dead_letter')`
  - `attempt`, `lease_epoch`, `run_after`, `leased_until`.
- Workers claim items using PostgreSQL row-level locks:
  `SELECT work_id FROM voice.work_item WHERE ((status = 'pending' AND run_after <= now()) OR (status = 'leased' AND leased_until < now())) ORDER BY run_after FOR UPDATE SKIP LOCKED LIMIT 1`.
- On lease claim, `lease_epoch` is atomically incremented by 1 and `leased_until` is set to `now() + interval '30 seconds'`.
- On completion, the worker executes a CAS update:
  `UPDATE voice.work_item SET status = 'completed' WHERE work_id = $1 AND lease_epoch = $2 AND status = 'leased'`.
- If another worker or revision took over the lease (due to drain, crash, or transient network partition), `lease_epoch` will have changed, `rowCount === 0`, and the worker raises `LeaseFencedError`.
- **Fencing Guarantee**: No duplicate side-effects (duplicate orders, repeated callbacks, or invalid double dispatch) can ever execute across revisions.

### 2.2 Worker Drain & Graceful Shutdown

- When a worker process receives `SIGTERM` or `drain()` is initiated:
  1. It immediately marks `isDraining = true`.
  2. The `/ready` probe returns HTTP 503 so Cloud Run / GCP load balancer redirects incoming requests to healthy revisions.
  3. No new sessions or work items are admitted.
  4. In-flight operations finish within the configurable `drainTimeoutMs` (default 15s to 30s).
  5. Any uncompleted leased work items expire naturally in DB (or are released) so the new revision claims them seamlessly.

---

## 3. Rollback Safety Plan (`deployment_rollback_plan`) (SD §15.2, §15.4)

### 3.1 Non-Destructive Invariants

1. **No Table Deletions**: We never drop or truncate `voice.*` tables during rollback (`voice.session`, `voice.intent`, `voice.confirmation`, `voice.command_receipt`, `voice.booking_command_proof`, `voice.work_item`, `voice.recording_checkpoint`).
2. **No Audit or Receipt Loss**: All command receipts and immutable cryptographic proofs remain intact for offline reconciliation and dispute investigation.
3. **No Automatic Order Cancellation**: Existing orders in `ops.phase1_owned_orders` created by the voice agent retain their current lifecycle and driver assignments; rolling back code does not cancel existing passenger rides.
4. **Schema Compatibility (Expand-Contract)**: All schema changes are backward-compatible with earlier API readers.

### 3.2 Rollback Execution Steps

1. Run pre-rollback verification:
   ```bash
   ./operations/deployment/rollback-voice-runtime.sh
   ```
2. Shift traffic back to the designated stable revision:
   ```bash
   ./operations/deployment/rollback-voice-runtime.sh <STABLE_API_REVISION> <STABLE_MEDIA_REVISION>
   ```
3. Run post-rollback health checks:
   ```bash
   ./operations/verification/check-voice-runtime-deployment.sh
   ./operations/database/check-voice-runtime-integrity.sh
   ```
