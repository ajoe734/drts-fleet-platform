from __future__ import annotations

import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from adapters.copilot_local import _copilot_auth_ready, _copilot_plaintext_token


class CopilotLocalAdapterTest(unittest.TestCase):
    def test_plaintext_token_reads_camel_case_key(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            config_path = Path(tmp) / "config.json"
            config_path.write_text(
                json.dumps(
                    {
                        "storeTokenPlaintext": True,
                        "copilotTokens": {
                            "https://github.com:demo": "gho_demo_token"
                        },
                    }
                ),
                encoding="utf-8",
            )
            with patch.dict(os.environ, {"COPILOT_CONFIG_DIR": tmp}, clear=False):
                self.assertEqual(_copilot_plaintext_token(), "gho_demo_token")

    def test_auth_ready_accepts_camel_case_key(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            config_path = Path(tmp) / "config.json"
            config_path.write_text(
                json.dumps(
                    {
                        "storeTokenPlaintext": True,
                        "copilotTokens": {
                            "https://github.com:demo": "gho_demo_token"
                        },
                    }
                ),
                encoding="utf-8",
            )
            with patch.dict(os.environ, {"COPILOT_CONFIG_DIR": tmp}, clear=False):
                self.assertTrue(_copilot_auth_ready())


if __name__ == "__main__":
    unittest.main()
