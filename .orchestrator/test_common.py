#!/usr/bin/env python3
from __future__ import annotations

import sys
import tempfile
import unittest
from types import SimpleNamespace
from pathlib import Path
from unittest import mock

THIS_DIR = Path(__file__).resolve().parent
if str(THIS_DIR) not in sys.path:
    sys.path.insert(0, str(THIS_DIR))

import common


class CommandExistsTests(unittest.TestCase):
    def test_finds_repo_local_cli_when_not_on_system_path(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            local_cli = root / ".orchestrator" / "bin" / "node_modules" / ".bin" / "gemini"
            local_cli.parent.mkdir(parents=True)
            local_cli.write_text("#!/bin/sh\nexit 0\n", encoding="utf-8")
            local_cli.chmod(0o755)

            with mock.patch.object(common, "ROOT", root):
                self.assertEqual(common.command_exists("gemini"), str(local_cli))


class ActivityLogRefreshTests(unittest.TestCase):
    def test_write_activity_log_triggers_status_view_refresh(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            log_path = root / "ai-activity-log.jsonl"
            config = {"paths": {"activity_log": str(log_path), "status_file": str(root / "ai-status.json")}}

            with mock.patch.object(common, "refresh_status_views") as refresh_status_views:
                common.write_activity_log(config, {"type": "worker_started", "message": "Dispatching worker."})

            rows = common.load_jsonl(log_path)
            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0]["type"], "worker_started")
            self.assertEqual(rows[0]["message"], "Dispatching worker.")
            self.assertEqual(rows[0]["agent"], "Orchestrator")
            self.assertIn("ts", rows[0])
            refresh_status_views.assert_called_once_with(config)

    def test_refresh_status_views_uses_configured_paths(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            status_path = root / "ai-status.json"
            log_path = root / "ai-activity-log.jsonl"
            status_path.write_text('{"objective":"demo","tasks":[],"agents":[],"handoffs":[],"blockers":[],"updated_at":"2026-05-09T00:00:00Z"}\n', encoding="utf-8")
            log_path.write_text("", encoding="utf-8")

            recorded: dict[str, object] = {}
            fake_module = SimpleNamespace()
            fake_module.ROOT = Path("/original-root")
            fake_module.STATUS_FILE = Path("/original-root/ai-status.json")
            fake_module.LOG_FILE = Path("/original-root/ai-activity-log.jsonl")
            fake_module.CURRENT_WORK_FILE = Path("/original-root/current-work.md")
            fake_module.DOCS_SITE_DIR = Path("/original-root/docs-site")
            fake_module.load_logs = lambda: [{"ts": "2026-05-09T00:00:01Z", "agent": "Orchestrator", "message": "ok"}]

            def fake_load_state() -> dict[str, object]:
                recorded["load_state_paths"] = (
                    fake_module.ROOT,
                    fake_module.STATUS_FILE,
                    fake_module.LOG_FILE,
                    fake_module.CURRENT_WORK_FILE,
                    fake_module.DOCS_SITE_DIR,
                )
                return {"objective": "demo", "tasks": [], "agents": [], "handoffs": [], "blockers": [], "updated_at": "seed"}

            def fake_write_current_work(state: dict[str, object], logs: list[dict[str, object]]) -> None:
                recorded["write_current_work_paths"] = (
                    fake_module.ROOT,
                    fake_module.STATUS_FILE,
                    fake_module.LOG_FILE,
                    fake_module.CURRENT_WORK_FILE,
                    fake_module.DOCS_SITE_DIR,
                )
                recorded["state"] = state
                recorded["logs"] = logs

            def fake_sync_docs_site() -> None:
                recorded["sync_docs_site_paths"] = (
                    fake_module.ROOT,
                    fake_module.STATUS_FILE,
                    fake_module.LOG_FILE,
                    fake_module.CURRENT_WORK_FILE,
                    fake_module.DOCS_SITE_DIR,
                )

            fake_module.load_state = fake_load_state
            fake_module.write_current_work = fake_write_current_work
            fake_module.sync_docs_site = fake_sync_docs_site

            config = {"paths": {"activity_log": str(log_path), "status_file": str(status_path)}}

            with mock.patch.object(common, "_load_ai_status_module", return_value=fake_module):
                common.refresh_status_views(config)

            expected_paths = (
                root,
                status_path,
                log_path,
                root / "current-work.md",
                root / "docs-site",
            )
            self.assertEqual(recorded["load_state_paths"], expected_paths)
            self.assertEqual(recorded["write_current_work_paths"], expected_paths)
            self.assertEqual(recorded["sync_docs_site_paths"], expected_paths)
            self.assertEqual(recorded["state"]["objective"], "demo")
            self.assertNotEqual(recorded["state"]["updated_at"], "seed")
            self.assertEqual(recorded["logs"], [{"ts": "2026-05-09T00:00:01Z", "agent": "Orchestrator", "message": "ok"}])
            self.assertEqual(fake_module.ROOT, Path("/original-root"))
            self.assertEqual(fake_module.STATUS_FILE, Path("/original-root/ai-status.json"))
            self.assertEqual(fake_module.LOG_FILE, Path("/original-root/ai-activity-log.jsonl"))
            self.assertEqual(fake_module.CURRENT_WORK_FILE, Path("/original-root/current-work.md"))
            self.assertEqual(fake_module.DOCS_SITE_DIR, Path("/original-root/docs-site"))

    def test_refresh_status_views_skips_incomplete_status_state(self) -> None:
        fake_module = SimpleNamespace()
        fake_module.ROOT = Path("/original-root")
        fake_module.STATUS_FILE = Path("/original-root/ai-status.json")
        fake_module.LOG_FILE = Path("/original-root/ai-activity-log.jsonl")
        fake_module.CURRENT_WORK_FILE = Path("/original-root/current-work.md")
        fake_module.DOCS_SITE_DIR = Path("/original-root/docs-site")
        fake_module.load_state = lambda: {"tasks": []}
        fake_module.sync_docs_site = mock.Mock()
        fake_module.write_current_work = mock.Mock()

        config = {"paths": {"activity_log": "/tmp/ai-activity-log.jsonl", "status_file": "/tmp/ai-status.json"}}

        with mock.patch.object(common, "_load_ai_status_module", return_value=fake_module):
            common.refresh_status_views(config)

        fake_module.write_current_work.assert_not_called()
        fake_module.sync_docs_site.assert_called_once()

    def test_write_activity_log_skips_view_refresh_for_permission_hooks(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            log_path = root / "ai-activity-log.jsonl"
            config = {"paths": {"activity_log": str(log_path), "status_file": str(root / "ai-status.json")}}

            with mock.patch.object(common, "refresh_status_views") as refresh_status_views:
                common.write_activity_log(config, {"type": "permission_hook", "message": "PostToolUse: Read"})

            rows = common.load_jsonl(log_path)
            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0]["type"], "permission_hook")
            refresh_status_views.assert_not_called()


if __name__ == "__main__":
    unittest.main()
