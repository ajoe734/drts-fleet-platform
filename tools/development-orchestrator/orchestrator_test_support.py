"""Shared isolation fixtures for orchestrator runtime tests."""
from __future__ import annotations

import tempfile
from pathlib import Path
from unittest import mock

from control_plane.infra import worker_evidence


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
