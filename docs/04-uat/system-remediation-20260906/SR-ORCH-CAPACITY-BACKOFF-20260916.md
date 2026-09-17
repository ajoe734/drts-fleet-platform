# SR-ORCH-CAPACITY-BACKOFF-20260916 — Capacity Failure Backoff Storm Fix

Owner: `Gemini`
Reviewer: `Claude2`
Date: 2026-09-16 UTC

## 1. Traceability & Context

- **Task ID**: `SR-ORCH-CAPACITY-BACKOFF-20260916`
- **Branch**: `gemini/sr-orch-capacity-backoff-20260916`

---

## 2. Root Cause Analysis (RCA)

### 2.1 Retry Storm for Capacity Failures

Between 2026-09-15T16:42:39 and 2026-09-16T09:05:44, the supervisor recorded 7285 capacity/unavailable failures for provider `gemini2`. The median failure interval was 2.0 seconds (equal to the supervisor's `poll_interval`).
Although `worker_retry` configuration defines a `backoff_schedule_seconds` and `dispatch_cooldown_seconds`, they were effectively bypassed for capacity errors.

**Root Cause**:
1. Capacity-exhaustion pause paths in `supervisor_runtime.py` were mistakenly using `dispatch_cooldown_seconds` from `ready_dispatch_settings` rather than `capacity_pause_seconds` from `worker_retry_settings`.
2. The retry logic was unconditionally pausing on every capacity retry previously, but after a refactor to fix retry_count accumulation, the backoff schedule was supposed to govern pacing, which it wasn't due to incorrect config wiring.

## 3. Remediation & Implementation

1. **Config Wiring Fix**: Corrected `maybe_trigger_retry_or_fallback` and `handle_worker_failure_signal` in `supervisor_runtime.py` to correctly extract `capacity_pause_seconds` from `worker_retry_settings` for capacity failures.
2. **Test File Relocation**: Moved the newly created tests from `control_plane/tests/test_capacity_retry_storm.py` to `test_worker_failure_detector.py` to match expected task deliverables.
3. **Test Renaming & Documentation**: Renamed `test_capacity_retry_temporarily_pauses_exact_lane` to `test_capacity_retry_respects_backoff_without_pausing_lane_early` in `test_supervisor.py` and added a docstring to document the intentional contract change.

## 4. Acceptance Criteria & Verification

- **capacity_failure_respects_backoff_schedule_and_dispatch_cooldown**: Addressed by fixing the configuration path used for setting reset_seconds.
- **regression_test_reproduces_tick_rate_retry_storm**: Addressed by the new multi-generation test in `test_worker_failure_detector.py`.
- **no_change_to_terminal_quota_pause_behaviour**: Addressed, existing pause logic for terminal errors is maintained untouched.
