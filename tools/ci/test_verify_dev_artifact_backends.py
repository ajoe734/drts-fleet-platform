import contextlib
import importlib.util
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]

class TestVerifyDevArtifactBackends(unittest.TestCase):
    def test_help(self):
        result = subprocess.run([sys.executable, str(ROOT / "operations/verification/verify-dev-artifact-backends.py"), "--help"], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0)
        self.assertIn("--document-bucket", result.stdout)
        self.assertIn("--scanner-url", result.stdout)

if __name__ == "__main__":
    unittest.main()
