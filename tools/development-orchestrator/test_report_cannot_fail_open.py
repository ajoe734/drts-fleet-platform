from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

_TOOL_ROOT = Path(__file__).resolve().parent
if str(_TOOL_ROOT) not in sys.path:
    sys.path.insert(0, str(_TOOL_ROOT))

from control_plane.domain.lane_health import pause_matches_lane  # noqa: E402
from control_plane.runtime import supervisor_runtime as supervisor  # noqa: E402
from provider_permissions import write_provider_capabilities  # noqa: E402


IDENTITY_PAUSE = {"kind": "auth", "scope": "identity", "lane_id": "claude2",
                  "identity_fingerprint": "a90ce4e4166b52db38f103ad"}


class UnknownIdentityIsNotHealthTests(unittest.TestCase):
    """An unreadable capability report used to release every paused lane.

    Identity and quota-pool scopes resolve through the report. When it could not
    answer, `pause_matches_lane` matched nothing, so the dispatcher read a
    paused fleet as an open one. On 2026-08-19 a report was written with an
    empty providers map and a 27-hour auth pause silently stopped applying to
    both lanes it covered -- the failure ran in the direction of dispatching.
    """

    def test_an_identity_pause_still_covers_the_lane_it_recorded(self) -> None:
        self.assertTrue(pause_matches_lane(IDENTITY_PAUSE, None, None, "claude2"))

    def test_it_does_not_spread_to_lanes_it_cannot_prove_share_the_account(self) -> None:
        """Unknown identity means the account's other lanes cannot be named.
        Pausing them anyway on a guess would wedge a healthy fleet."""
        self.assertFalse(pause_matches_lane(IDENTITY_PAUSE, None, None, "claude"))

    def test_a_resolvable_identity_still_covers_every_lane_on_the_account(self) -> None:
        identity = {"fingerprint": "a90ce4e4166b52db38f103ad"}
        self.assertTrue(pause_matches_lane(IDENTITY_PAUSE, identity, None, "claude"))

    def test_a_quota_pool_pause_falls_back_the_same_way(self) -> None:
        pause = {"kind": "quota", "scope": "quota_pool", "lane_id": "codex2",
                 "quota_pool": "codex:abc:default"}
        self.assertTrue(pause_matches_lane(pause, None, None, "codex2"))
        self.assertFalse(pause_matches_lane(pause, None, None, "codex"))

    def test_the_dispatcher_keeps_refusing_the_failed_lane_without_a_report(self) -> None:
        config = {"agents": {"claude": {"provider": "claude"},
                             "claude2": {"provider": "claude2"}}, "providers": {}}
        state = {"provider_pauses": {"identity:claude2:a90ce4e4166b52db38f103ad": IDENTITY_PAUSE}}

        paused = {lane: supervisor.is_agent_dispatch_paused(config, state, lane, provider_report={})
                  for lane in config["agents"]}

        self.assertEqual(paused, {"claude": False, "claude2": True})


class EmptyReportIsNeverWrittenTests(unittest.TestCase):
    def _config(self, target: Path) -> dict:
        return {"providers": {"claude": {}, "gemini": {}},
                "paths": {"provider_capabilities": str(target)}}

    def test_a_report_with_no_providers_does_not_overwrite_a_good_one(self) -> None:
        """A probe that finds nothing reports lanes as not installed; it does
        not report no lanes. Zero against a config that declares two is
        incoherent, and persisting it is what made the pause stop applying."""
        with tempfile.TemporaryDirectory() as tmpdir:
            target = Path(tmpdir) / "provider_capabilities.json"
            good = {"generated_at": "2026-08-19T00:00:00Z",
                    "providers": {"claude": {"auth_ready": True}, "gemini": {"auth_ready": True}}}
            target.write_text(json.dumps(good), encoding="utf-8")

            write_provider_capabilities(self._config(target),
                                        report={"generated_at": "x", "providers": {}})

            self.assertEqual(json.loads(target.read_text()), good)

    def test_a_normal_report_is_written(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            target = Path(tmpdir) / "provider_capabilities.json"
            fresh = {"generated_at": "2026-08-19T01:00:00Z",
                     "providers": {"claude": {"auth_ready": False}, "gemini": {"auth_ready": True}}}

            write_provider_capabilities(self._config(target), report=fresh)

            self.assertEqual(json.loads(target.read_text()), fresh)

    def test_a_config_that_declares_no_providers_can_still_write_an_empty_report(self) -> None:
        """The guard compares against the config; it does not forbid an empty
        fleet, only an answer that contradicts one that is configured."""
        with tempfile.TemporaryDirectory() as tmpdir:
            target = Path(tmpdir) / "provider_capabilities.json"
            report = {"generated_at": "x", "providers": {}}

            write_provider_capabilities({"providers": {},
                                         "paths": {"provider_capabilities": str(target)}},
                                        report=report)

            self.assertEqual(json.loads(target.read_text()), report)


if __name__ == "__main__":
    unittest.main()
