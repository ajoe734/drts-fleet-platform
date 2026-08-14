from __future__ import annotations

from control_plane.domain.lane_health import identity_fingerprint, pause_matches_lane, quota_pool_key


def test_identity_and_quota_pool_do_not_expose_account() -> None:
    identity = identity_fingerprint("codex", "account-1", "org-1")
    assert identity and "account-1" not in identity
    assert quota_pool_key("codex", identity, "terra") == f"codex:{identity}:terra"


def test_identity_pause_does_not_match_another_account() -> None:
    old = {"fingerprint": identity_fingerprint("codex", "old")}
    new = {"fingerprint": identity_fingerprint("codex", "new")}
    pause = {"scope": "identity", "identity_fingerprint": old["fingerprint"]}
    assert not pause_matches_lane(pause, new, None)


def test_quota_pool_pause_matches_same_account_and_scope() -> None:
    fingerprint = identity_fingerprint("codex", "same")
    pool = quota_pool_key("codex", fingerprint, "terra")
    pause = {"scope": "quota_pool", "quota_pool": pool}
    assert pause_matches_lane(pause, {"fingerprint": fingerprint}, pool)
