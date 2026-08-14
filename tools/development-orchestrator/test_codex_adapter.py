from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest import mock

THIS_DIR = Path(__file__).resolve().parent
if str(THIS_DIR) not in sys.path:
    sys.path.insert(0, str(THIS_DIR))

from adapters.base import DeliveryRequest
from adapters.codex import CodexAdapter


class CodexAdapterTests(unittest.TestCase):
    def test_codex_writes_structured_result_to_canonical_worker_results(self) -> None:
        config = {
            "paths": {"status_file": "/canonical/ai-status.json", "state_file": "/canonical/.orchestrator/state.json"},
            "agents": {"codex": {"id": "codex", "display_name": "Codex", "provider": "codex"}},
            "providers": {"codex": {"codex": {"cli": "codex"}}},
        }
        request = DeliveryRequest(
            agent_id="codex",
            provider="codex",
            delivery_mode="codex",
            message="continue task",
            task_id="S1F-REF-001",
            metadata={"workspace_root": "/worker"},
        )
        process = mock.Mock(pid=4242)
        result_path = Path("/canonical/.orchestrator/worker-results/codex-test.json")
        schema_path = Path("/runtime/schemas/worker-result.schema.json")
        with (
            mock.patch("adapters.codex.command_exists", return_value="/usr/bin/codex"),
            mock.patch("adapters.codex.new_runtime_id", return_value="codex-test"),
            mock.patch("adapters.codex.worker_result_path", return_value=result_path),
            mock.patch("adapters.codex.worker_result_schema_path", return_value=schema_path),
            mock.patch("adapters.codex.runtime_log_path", return_value=Path("/runtime/worker.log")),
            mock.patch("adapters.codex.spawn_background_process", return_value=(process, Path("/runtime/worker.log"))) as spawn,
        ):
            result = CodexAdapter(config=config, provider_capabilities={}).deliver(request)

        command = spawn.call_args.args[0]
        self.assertTrue(result.ok)
        self.assertEqual(command[command.index("--output-schema") + 1], str(schema_path))
        self.assertEqual(command[command.index("--output-last-message") + 1], str(result_path))
        self.assertEqual(result.metadata["result_path"], str(result_path))

    def test_codex_uses_configured_model_and_unrestricted_sandbox(self) -> None:
        config = {
            "paths": {"status_file": "/canonical/ai-status.json", "state_file": "/canonical/.orchestrator/state.json"},
            "agents": {"codex": {"id": "codex", "display_name": "Codex", "provider": "codex"}},
            "providers": {"codex": {"codex": {"cli": "codex", "model": "gpt-5.6-terra", "sandbox_mode": "danger-full-access", "dangerously_bypass": True}}},
        }
        request = DeliveryRequest("codex", "codex", "codex", "continue", metadata={"workspace_root": "/worker"})
        process = mock.Mock(pid=4242)
        with (
            mock.patch("adapters.codex.command_exists", return_value="/usr/bin/codex"),
            mock.patch("adapters.codex.worker_result_path", return_value=Path("/canonical/result.json")),
            mock.patch("adapters.codex.runtime_log_path", return_value=Path("/runtime/worker.log")),
            mock.patch("adapters.codex.spawn_background_process", return_value=(process, Path("/runtime/worker.log"))) as spawn,
        ):
            CodexAdapter(config=config, provider_capabilities={}).deliver(request)
        command = spawn.call_args.args[0]
        self.assertEqual(command[command.index("--model") + 1], "gpt-5.6-terra")
        self.assertEqual(command[command.index("-s") + 1], "danger-full-access")
        self.assertIn("--dangerously-bypass-approvals-and-sandbox", command)


if __name__ == "__main__":
    unittest.main()
