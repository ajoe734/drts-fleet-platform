#!/usr/bin/env python3
from __future__ import annotations

import sys
import tempfile
import unittest
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


if __name__ == "__main__":
    unittest.main()
