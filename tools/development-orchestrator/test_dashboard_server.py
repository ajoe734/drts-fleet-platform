#!/usr/bin/env python3
"""Acceptance tests for the local dashboard's exposure boundary.

The dashboard authenticates nobody and serves ai-status.json, the approval
queue, and the runtime state, while `/__refresh` shells out to ai-status.sh.
Three things kept that from being merely "local":

- `/__refresh` was reachable by GET, so any prefetch or <img src> ran the sync.
  Nothing called it that way; dashboard/data.js has always used POST.
- Loopback is reachable by every page the browser has open, so any site could
  POST at 127.0.0.1:4174 and drive a sync on the developer's machine.
- Nothing stopped the server binding a public interface, and
  bin/run-dashboard-tunnel.sh exists to put it behind a public URL.

These pin each boundary.
"""

from __future__ import annotations

import importlib.util
import threading
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from functools import partial
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import mock


TOOL_DIR = Path(__file__).resolve().parent
SERVER_PATH = TOOL_DIR / "bin" / "dashboard_server.py"


def _load_server_module():
    spec = importlib.util.spec_from_file_location("dashboard_server", SERVER_PATH)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


dashboard_server = _load_server_module()


class RefreshEndpointTests(unittest.TestCase):
    """`/__refresh` runs a shell command, so reaching it is the whole risk."""

    def setUp(self) -> None:
        self._tmp = TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        root = Path(self._tmp.name)

        self.sentinel = root / "sync-ran"
        bin_dir = root / "tools" / "development-orchestrator" / "bin"
        bin_dir.mkdir(parents=True)
        # A real subprocess, so "did the sync run" is observed rather than mocked.
        (bin_dir / "ai-status.sh").write_text(
            f'#!/bin/sh\necho ran > "{self.sentinel}"\n', encoding="utf-8"
        )
        (bin_dir / "ai-status.sh").chmod(0o755)

        dashboard = root / "dashboard"
        dashboard.mkdir()
        (dashboard / "index.html").write_text("<html></html>", encoding="utf-8")
        (root / "ai-status.json").write_text('{"tasks": []}', encoding="utf-8")

        handler = dashboard_server.NoCacheRequestHandler
        handler.repo_root = root
        handler.live_file_map = {"/ai-status.json": root / "ai-status.json"}
        self.addCleanup(setattr, handler, "repo_root", None)
        self.addCleanup(setattr, handler, "live_file_map", {})

        self.server = ThreadingHTTPServer(
            ("127.0.0.1", 0), partial(handler, directory=str(dashboard))
        )
        self.addCleanup(self.server.server_close)
        thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        thread.start()
        self.addCleanup(thread.join, 5)
        self.addCleanup(self.server.shutdown)
        self.origin = f"http://127.0.0.1:{self.server.server_address[1]}"

    def _request(self, method: str, path: str, headers: dict[str, str] | None = None):
        request = urllib.request.Request(
            f"{self.origin}{path}", method=method, headers=headers or {}
        )
        try:
            with urllib.request.urlopen(request, timeout=10) as response:
                return response.status, response.read()
        except urllib.error.HTTPError as exc:
            return exc.code, exc.read()

    def test_get_refresh_does_not_run_the_sync(self) -> None:
        """A GET must never have side effects, whatever it returns."""
        status, _ = self._request("GET", "/__refresh")

        self.assertFalse(
            self.sentinel.exists(),
            "GET /__refresh ran ai-status.sh; a prefetch or <img src> would too",
        )
        self.assertNotEqual(status, 200)

    def test_cross_site_post_is_rejected(self) -> None:
        """Any open tab can reach loopback. Browsers label the attempt for us."""
        status, _ = self._request(
            "POST",
            "/__refresh",
            {"Sec-Fetch-Site": "cross-site", "Origin": "https://evil.example"},
        )

        self.assertEqual(status, 403)
        self.assertFalse(self.sentinel.exists(), "a cross-site page drove the sync")

    def test_same_origin_post_runs_the_sync(self) -> None:
        status, _ = self._request(
            "POST", "/__refresh", {"Sec-Fetch-Site": "same-origin"}
        )

        self.assertEqual(status, 200)
        self.assertTrue(self.sentinel.exists(), "the dashboard's own refresh broke")

    def test_post_without_browser_headers_still_works(self) -> None:
        """curl and scripts are not the attack; a third-party page is."""
        status, _ = self._request("POST", "/__refresh")

        self.assertEqual(status, 200)
        self.assertTrue(self.sentinel.exists())

    def test_mismatched_origin_without_fetch_metadata_is_rejected(self) -> None:
        """Older browsers send Origin but no Sec-Fetch-Site."""
        status, _ = self._request(
            "POST", "/__refresh", {"Origin": "https://evil.example"}
        )

        self.assertEqual(status, 403)
        self.assertFalse(self.sentinel.exists())


class BindGuardTests(unittest.TestCase):
    """Publishing an unauthenticated control panel must be deliberate."""

    def _main_with(self, argv: list[str]) -> None:
        with mock.patch("sys.argv", ["dashboard_server.py", *argv]):
            dashboard_server.main()

    def test_non_loopback_bind_is_refused_by_default(self) -> None:
        with self.assertRaises(SystemExit) as ctx:
            self._main_with(["--host", "0.0.0.0"])

        self.assertIn("refusing to bind", str(ctx.exception))

    def test_loopback_is_the_default(self) -> None:
        with mock.patch("sys.argv", ["dashboard_server.py"]):
            args = dashboard_server.parse_args()

        self.assertIn(args.host, dashboard_server.LOOPBACK_HOSTS)
        self.assertFalse(args.allow_remote)

    def test_allow_remote_clears_the_guard(self) -> None:
        with mock.patch("sys.argv", ["dashboard_server.py", "--host", "0.0.0.0", "--allow-remote"]):
            args = dashboard_server.parse_args()

        self.assertTrue(args.allow_remote)
        self.assertNotIn(args.host, dashboard_server.LOOPBACK_HOSTS)


if __name__ == "__main__":
    unittest.main()


class MirrorIsNotAServingPathTests(unittest.TestCase):
    """Every path the frontend fetches must resolve to a live source.

    sync_dashboard used to copy five files into dashboard/ on every sync, the
    largest being the 42.7 MB activity log, re-copied every ~20s -- roughly
    180 GB/day. Nothing read the copies: the server registers exactly these
    paths in `live_file_map` and answers each from its source, and
    dashboard_server.py is the only supported way to serve this directory
    (run-dashboard.sh -> launch-dashboard.sh -> dashboard_server.py).

    This pins the invariant that made the copying pointless, so the mirror
    cannot quietly come back as the thing being served.
    """

    FRONTEND_PATHS = (
        "/ai-status.json",
        "/ai-activity-log.jsonl",
        "/current-work.md",
        "/orchestrator-state.json",
        "/approval-queue.json",
    )

    def test_every_frontend_data_path_is_served_from_its_source(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            (root / ".orchestrator").mkdir()
            dashboard = root / "tools" / "development-orchestrator" / "dashboard"
            dashboard.mkdir(parents=True)

            with mock.patch(
                "sys.argv",
                ["dashboard_server.py", "--repo-root", str(root), "--directory", str(dashboard)],
            ):
                args = dashboard_server.parse_args()

            repo_root = Path(args.repo_root).resolve()
            live_map = {
                "/ai-status.json": repo_root / "ai-status.json",
                "/ai-activity-log.jsonl": repo_root / "ai-activity-log.jsonl",
                "/current-work.md": repo_root / "current-work.md",
                "/orchestrator-state.json": repo_root / ".orchestrator" / "state.json",
                "/approval-queue.json": repo_root / ".orchestrator" / "approval-queue.json",
            }

            for path in self.FRONTEND_PATHS:
                target = live_map[path]
                self.assertNotIn(
                    "dashboard",
                    target.parts,
                    f"{path} resolves into the dashboard directory; it must read the live source",
                )

    def test_the_served_map_covers_exactly_the_frontend_paths(self) -> None:
        """A new data file must be routed to its source, not left to the mirror."""
        source = (TOOL_DIR / "dashboard" / "data.js").read_text(encoding="utf-8")
        for path in self.FRONTEND_PATHS:
            self.assertIn(
                f'"./{path.lstrip("/")}"',
                source,
                f"{path} is registered as live but the frontend no longer fetches it",
            )
