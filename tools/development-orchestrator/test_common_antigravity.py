from __future__ import annotations

import unittest

from common import antigravity_rotation_config


class AntigravityRotationConfigTests(unittest.TestCase):
    def test_blank_and_low_reasoning_models_use_high_reasoning_defaults(self) -> None:
        rotation = antigravity_rotation_config(
            {
                "model_rotation": {
                    "primary": "gemini-2.5-flash-lite",
                    "fallback": "claude-haiku-4-5",
                }
            }
        )

        self.assertEqual(rotation["primary"], "gemini-3.1-pro-high")
        self.assertEqual(rotation["fallback"], "claude-sonnet-4-6")

    def test_explicit_high_reasoning_models_are_preserved(self) -> None:
        rotation = antigravity_rotation_config(
            {
                "model_rotation": {
                    "primary": "gemini-3.1-pro-high",
                    "fallback": "claude-sonnet-4-6",
                }
            }
        )

        self.assertEqual(rotation["primary"], "gemini-3.1-pro-high")
        self.assertEqual(rotation["fallback"], "claude-sonnet-4-6")


if __name__ == "__main__":
    unittest.main()
