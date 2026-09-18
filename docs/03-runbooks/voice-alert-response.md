# Voice Booking Alert Response & Incident Operations Runbook

Task: `UV-EXEC-022`  
Planning Reference: `docs/02-architecture/phase1-unattended-voice-booking-sa-20260906.md` §10.2  
System Design Reference: `docs/02-architecture/phase1-unattended-voice-booking-sd-20260906.md` §13 / §14.3  
Alert Rules: `infra/monitoring/voice-alerts.yaml`  
Dashboard: `infra/monitoring/voice-dashboard.json`

---

## Overview & Operational Principles

This runbook defines operational triage, containment, escalation, and remediation procedures for all dimensional alerts emitted by the unattended voice booking subsystem under `UV-EXEC-022`.

### Core Operational Invariants

1. **Dimensional Routing & Scoping**: Every alert is tagged with 4 dimensions: `language`, `route_profile_version`, `provider`, and `brand_id`. Incident triage must isolate the incident to the affected dimension rather than shutting down unaffected languages or fleets.
2. **Fail-Closed on Integrity & Safety**: If duplicate orders, scope leaks, or unverified recording checkpoints occur, autonomous booking creation must immediately halt for that profile/brand scope and fall back to the human operator queue.
3. **Observation Window Rule (SA §10.2)**: Cost per successful dispatch is pending until the observation window ends (default 15 minutes after session close) to avoid incomplete dispatch bias.
4. **Estimate Never Overwrites Invoice (SD §14.3)**: Estimated rate-card ledger costs must never overwrite reconciled carrier billing invoices.
5. **No Synthetic Zero Cost**: If cost data is unavailable, the system reports `N/A (尚無成本資料)` instead of fabricating `0.00 TWD`.

---

## Alert Signal & Incident Response Procedures

### 1. VoiceErrorOrDuplicateBooking

- **Metric**: `drts_voice_error_or_duplicate_bookings_total`
- **Severity**: `P1 Critical`
- **Owner**: Ops On-Call
- **Route Channel**: `voice-pager-p1`
- **Specification**: SD §13.2 / UV-AC-032
- **Trigger**: Key field mismatch, duplicate order creation, or unauthorized booking occurred for specified language/profile/provider/brand (`increase >= 1` in 1 minute).
- **Impact**: Risk of duplicate vehicle dispatch or incorrect passenger destination.
- **Triage & Response Steps**:
  1. Check Ops Console `/callcenter` and query for recent active or error call sessions with the reported `brand_id` and `language`.
  2. Inspect the audit log for idempotency key collision or booking command mismatch.
  3. Activate scope kill switch if errors continue on the affected route profile version:
     ```bash
     curl -X POST http://localhost:3000/api/callcenter/voice/policy/kill-switch \
       -H "Content-Type: application/json" \
       -d '{"scope": "profile", "id": "<route_profile_version>", "reason": "Duplicate booking alert triggered"}'
     ```
  4. Verify that subsequent inbound calls on this route profile fall back safely to human queue.
  5. Identify duplicate orders in dispatch and cancel unconfirmed duplicate dispatch jobs.

---

### 2. VoiceCrossScopeAccessDenied

- **Metric**: `drts_voice_cross_scope_denials_total`
- **Severity**: `P1 Critical`
- **Owner**: Security Ops On-Call
- **Route Channel**: `voice-pager-p1`
- **Trigger**: Voice session attempted to query or mutate resources outside its authorized tenant/brand boundary (`increase >= 1` in 1 minute).
- **Impact**: Potential tenant isolation breach or compromised agent prompt injection.
- **Triage & Response Steps**:
  1. Retrieve `voiceSessionId` and `brandId` from the security audit event logs.
  2. Inspect the LLM tool execution trace to see which tool was invoked with cross-brand parameters.
  3. Terminate the active session immediately via:
     ```bash
     curl -X POST http://localhost:3000/api/callcenter/sessions/<callId>/close \
       -H "Content-Type: application/json" \
       -d '{"reason": "security_cross_scope_violation"}'
     ```
  4. Inspect whether prompt injection or phone spoofing was attempted. Escalate to Security Incident Response if suspicious.

---

### 3. VoicePendingCommandTimeout

- **Metric**: `drts_voice_pending_command_timeouts_total`
- **Severity**: `P2 High`
- **Owner**: SRE On-Call
- **Route Channel**: `voice-oncall`
- **Trigger**: Booking or dispatch command issued to backend remained in pending reconciliation beyond timeout threshold (`increase >= 1` in 5 minutes).
- **Impact**: Passenger may have hung up while booking was half-committed.
- **Triage & Response Steps**:
  1. Inspect PostgreSQL order and voice session reconciliation logs.
  2. Check if the dispatch service or message broker is experiencing high latency or backlog.
  3. Check the command receipt status and determine whether an order was created in the database.
  4. If caller hung up before receipt confirmation, create an urgent callback task for the human operator to verify passenger intentions.

---

### 4. VoiceRecordingCheckpointFailure

- **Metric**: `drts_voice_recording_checkpoint_failures_total`
- **Severity**: `P1 Critical`
- **Owner**: SRE On-Call
- **Route Channel**: `voice-pager-p1`
- **Specification**: SD §13.2 / UV-AC-032
- **Trigger**: Voice recording manifest checksum verification failed or recording file was inaccessible at the compliance checkpoint (`increase >= 1` in 1 minute).
- **Impact**: Regulatory non-compliance; audio evidence missing for autonomous booking. Autonomous creation is gated closed per SD §13.2.
- **Triage & Response Steps**:
  1. Check telephony provider (e.g., TWM / Twilio) recording webhook delivery status and storage bucket upload errors.
  2. Verify Cloud Storage bucket permissions and signed URL validity.
  3. Ensure that booking creation gate correctly blocked completion for the affected session.
  4. If recording storage is degraded, route all traffic to human callcenter until recording persistence is confirmed healthy.

---

### 5. VoiceProviderCapacityExceeded

- **Metric**: `drts_voice_provider_overflow_total`
- **Severity**: `P2 High`
- **Owner**: SRE On-Call
- **Route Channel**: `voice-oncall`
- **Trigger**: Telephony provider SIP trunk, concurrency limit, or telephony capacity reached (`increase >= 3` in 5 minutes).
- **Impact**: Inbound callers may encounter busy signals or dropped calls.
- **Triage & Response Steps**:
  1. Inspect telephony provider trunk utilization metrics and concurrent call dashboard.
  2. Verify that pre-AI overflow admission handler is routing excess calls to IVR wait queue or overflow backup trunk.
  3. Request provider trunk capacity increase if inbound volume is sustained.
  4. Ensure all overflow admissions are properly recorded in denominator with reason `overflow`.

---

### 6. VoiceHandoffUnansweredBreach

- **Metric**: `drts_voice_handoff_queue_unanswered_count`
- **Severity**: `P2 High`
- **Owner**: Callcenter Ops Lead
- **Route Channel**: `voice-oncall`
- **Specification**: SA §10.1 / SD §13.2
- **Trigger**: Inbound caller transferred from AI to human queue remained unanswered beyond the 60-second SLA (`unanswered_count >= 1` for 2 minutes).
- **Impact**: Passenger abandoned or left waiting; customer service degradation.
- **Triage & Response Steps**:
  1. Inspect Ops Console `/callcenter` pending sessions and callback queue.
  2. Reassign available callcenter agents to the voice queue.
  3. If caller disconnected while waiting, confirm an automatic callback task was generated.
  4. Review agent staffing levels and active session concurrency.

---

### 7. VoiceDispatchUnavailableSpike

- **Metric**: `drts_voice_dispatch_unavailable_total`
- **Severity**: `P3 Warning`
- **Owner**: Fleet Ops
- **Route Channel**: `voice-oncall`
- **Trigger**: Spike in no-car-available, driver rejection, or dispatch timeout events (`increase >= 5` in 10 minutes) on a given brand.
- **Impact**: Passenger booking requests cannot be fulfilled by available fleet.
- **Triage & Response Steps**:
  1. Inspect fleet heatmaps and vehicle density in the affected service area.
  2. Verify that the AI agent correctly explained the no-car situation to callers and offered scheduled booking or alternative times.
  3. Alert fleet operations to reposition or dispatch standby vehicles to high-demand clusters.
  4. Verify that these events are properly retained in the dispatch denominator per SA §10.2.

---

### 8. VoiceCostAnomalySpike

- **Metric**: `drts_voice_call_unit_cost_twd`
- **Severity**: `P2 High`
- **Owner**: Finance Ops & Voice Engineering
- **Route Channel**: `voice-cost-audit`
- **Specification**: SD §14.3
- **Trigger**: Unit cost of an individual call exceeded the 50.0 TWD anomaly threshold (`call_unit_cost_twd > 50.0`).
- **Impact**: Budget overrun or runaway LLM tool looping.
- **Triage & Response Steps**:
  1. In Ops Console `/callcenter` or API `GET /callcenter/voice/usage/records?voiceSessionId=<id>`, inspect cost breakdown.
  2. Check breakdown by service type (`telephony`, `asr`, `tts`, `llm`, `storage`, `human_operator`).
  3. If `llm` token count is excessive, check session transcript for conversation looping or prompt degradation.
  4. If `telephony` leg duration is excessive, check if session disconnect signaling failed.
  5. Verify whether rate card was active and unverified flags were handled.

---

### 9. VoiceWorkerLeaseConflict

- **Metric**: `drts_voice_worker_lease_conflicts_total`
- **Severity**: `P1 Critical`
- **Owner**: SRE On-Call
- **Route Channel**: `voice-pager-p1`
- **Trigger**: Multiple distributed workers attempted concurrent mutation of the same voice session or CAS epoch fencing rejected a stale write (`increase >= 1` in 1 minute).
- **Impact**: Risk of split-brain state or conflicting passenger responses.
- **Triage & Response Steps**:
  1. Inspect voice worker pod logs for epoch fencing rejections and lease takeover events.
  2. Identify the contending worker IDs and verify whether a dead worker was slow to shut down.
  3. Verify that the database CAS update query (`UPDATE voice_sessions SET epoch = epoch + 1 WHERE epoch = :expected`) successfully prevented conflicting writes.
  4. Check worker health check and network partitions between Kubernetes nodes.
