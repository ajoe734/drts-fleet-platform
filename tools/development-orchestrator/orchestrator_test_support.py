"""Shared isolation fixtures for orchestrator runtime tests."""
from __future__ import annotations

import os
import tempfile
from pathlib import Path
from unittest import mock

from control_plane.infra import worker_evidence


class DispatchEnvironmentIsolation:
    """Keep the invoking worker's dispatch context out of isolated test boards."""

    def setUp(self) -> None:
        super().setUp()
        environ = {
            key: value
            for key, value in os.environ.items()
            if key != "ORCH_RUN_ID" and not key.startswith("ORCH_DISPATCH_")
        }
        # Restore the inherited context even after setup or test failure. Tests
        # for dispatch fencing can still supply their own explicit context.
        env_patch = mock.patch.dict(os.environ, environ, clear=True)
        env_patch.start()
        self.addCleanup(env_patch.stop)


class EvidenceOutputIsolation:
    """Keep worker-failure evidence out of the canonical runtime during tests."""

    def setUp(self) -> None:
        super().setUp()
        self._evidence_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self._evidence_dir.cleanup)
        self._evidence_path_patch = mock.patch.object(
            worker_evidence,
            "evidence_path",
            side_effect=lambda run_id, config=None: Path(self._evidence_dir.name) / f"{run_id}.json",
        )
        self._evidence_path_patch.start()
        self.addCleanup(self._evidence_path_patch.stop)
