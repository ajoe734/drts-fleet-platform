import unittest
import subprocess

class TestVerifyHelper(unittest.TestCase):
    def test_help(self):
        result = subprocess.run(["python3", "operations/verification/verify-dev-artifact-backends.py", "--help"], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0)
        self.assertIn("--document-bucket", result.stdout)
        self.assertIn("--remittance-bucket", result.stdout)
        self.assertIn("--scanner-url", result.stdout)

if __name__ == "__main__":
    unittest.main()
