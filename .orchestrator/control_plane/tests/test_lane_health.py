from control_plane.domain.lane_health import (
    identity_fingerprint,
    lane_identity_changed,
    pause_matches_lane,
    quota_pool_key,
    worker_capacity_counts,
)
from control_plane.infra.worker_failure_detector import detect_failure_signal_in_lines
from control_plane.domain.failure_policy import FailureKind, classify_failure


def test_identity_and_quota_pool_are_stable_without_exposing_account() -> None:
    identity = identity_fingerprint("codex", "account-1", "org-1")
    assert identity and "account-1" not in identity
    assert quota_pool_key("codex", identity, "terra") == f"codex:{identity}:terra"


def test_identity_change_does_not_inherit_a_scoped_pause() -> None:
    old = {"fingerprint": identity_fingerprint("codex", "old")}
    new = {"fingerprint": identity_fingerprint("codex", "new")}
    pause = {"scope": "identity", "identity_fingerprint": old["fingerprint"]}
    assert lane_identity_changed(old, new)
    assert not pause_matches_lane(pause, new, None)


def test_suspended_workers_reserve_sessions_not_execution_capacity() -> None:
    workers = {
        "a": {"agent_id": "claude", "status": "suspended_approval"},
        "b": {"agent_id": "claude", "status": "running"},
        "c": {"agent_id": "claude", "status": "running", "role": "chair"},
    }
    assert worker_capacity_counts(workers, "claude") == {"execution": 1, "sessions": 1, "control": 1}


def test_command_output_with_quota_text_cannot_pause_a_provider() -> None:
    line = '{"type":"item.completed","item":{"type":"command_execution","aggregated_output":"Error: Individual quota reached"}}'
    assert detect_failure_signal_in_lines([line]) is None


def test_structured_rate_limit_event_preserves_reset_and_pauses_as_quota() -> None:
    signal = detect_failure_signal_in_lines([
        '{"type":"rate_limit_event","rate_limit_info":{"status":"rejected","rateLimitType":"seven_day","resetsAt":1786363200}}'
    ])
    assert signal is not None
    assert signal.provider_pause_authorized
    assert "reset_at=2026-08-10T12:00:00Z" in signal.reason
    assert classify_failure({}, {"provider": "claude"}, signal.reason).kind is FailureKind.QUOTA_TERMINAL
