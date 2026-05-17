from __future__ import annotations

import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class AgentWorkflowDocsTests(unittest.TestCase):
    def test_agents_md_exists_and_carries_no_local_only_rule(self) -> None:
        content = (ROOT / "AGENTS.md").read_text(encoding="utf-8")
        self.assertIn("Do not stop after implementation or verification", content)
        self.assertIn("branch -> commit -> push", content)

    def test_collaboration_guide_contains_no_local_only_completion_rule(self) -> None:
        content = (ROOT / "AI_COLLABORATION_GUIDE.md").read_text(encoding="utf-8")
        self.assertIn("### No local-only completion rule", content)
        self.assertIn("tests passed locally", content)


if __name__ == "__main__":
    unittest.main()
